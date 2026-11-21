"use strict";

const crypto = require("node:crypto");
const { isIP } = require("node:net");
const dns = require("node:dns/promises");

const SERVER_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const TOKEN_HASH = /^[a-f0-9]{64}$/;

function validateEndpoint(value) {
    if (typeof value !== "string" || value.length > 2048) {
        throw new TypeError("A valid HTTPS server endpoint is required.");
    }
    let url;
    try { url = new URL(value); }
    catch { throw new TypeError("A valid HTTPS server endpoint is required."); }
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !hostname || hostname === "localhost" ||
        hostname.endsWith(".localhost") || hostname.endsWith(".local") ||
        !hostname.includes(".") || isIP(hostname) ||
        url.username || url.password || url.search || url.hash || url.origin === "null") {
        throw new TypeError("The server endpoint must use a public DNS hostname over HTTPS without credentials, query, or fragment.");
    }
    return url.toString().replace(/\/$/, "");
}

function validateRegistration(input) {
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        typeof input.serverId !== "string" || !SERVER_ID.test(input.serverId) ||
        typeof input.ownerAccountId !== "string" || input.ownerAccountId.length < 1 ||
        input.ownerAccountId.length > 128 ||
        typeof input.displayName !== "string" || !input.displayName.trim() ||
        input.displayName.trim().length > 64 ||
        typeof input.challengeTokenHash !== "string" || !TOKEN_HASH.test(input.challengeTokenHash) ||
        !(input.challengeExpiresAt instanceof Date) || !Number.isFinite(input.challengeExpiresAt.getTime())) {
        throw new TypeError("A valid server registration and ownership challenge are required.");
    }
    return {
        serverId: input.serverId,
        ownerAccountId: input.ownerAccountId,
        endpoint: validateEndpoint(input.endpoint),
        displayName: input.displayName.trim(),
        challengeTokenHash: input.challengeTokenHash,
        challengeExpiresAt: input.challengeExpiresAt
    };
}

function publicServer(row) {
    return Object.freeze({
        serverId: row.server_id,
        endpoint: row.endpoint,
        displayName: row.display_name,
        verifiedAt: new Date(row.verified_at).toISOString()
    });
}

function createOwnershipChallenge(endpoint, { now = new Date(), lifetimeMs = 24 * 60 * 60 * 1000 } = {}) {
    const normalizedEndpoint = validateEndpoint(endpoint);
    if (!(now instanceof Date) || !Number.isFinite(now.getTime()) ||
        !Number.isSafeInteger(lifetimeMs) || lifetimeMs < 60_000 || lifetimeMs > 7 * 24 * 60 * 60 * 1000) {
        throw new TypeError("A valid clock and ownership-challenge lifetime are required.");
    }
    const hostname = new URL(normalizedEndpoint).hostname.toLowerCase();
    const token = crypto.randomBytes(32).toString("base64url");
    return Object.freeze({
        token,
        tokenHash: hashOwnershipChallenge(token),
        recordName: "_csy-verify." + hostname,
        recordValue: token,
        expiresAt: new Date(now.getTime() + lifetimeMs)
    });
}

class PostgresCommunityServerRegistry {
    constructor(pool) {
        if (!pool || typeof pool.query !== "function") {
            throw new TypeError("A PostgreSQL-compatible query pool is required.");
        }
        this.pool = pool;
    }

    async registerPending(input) {
        const value = validateRegistration(input);
        const result = await this.pool.query(
            `INSERT INTO csy_private.community_servers
                (server_id, owner_account_id, endpoint, display_name,
                 verification_token_hash, verification_expires_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (server_id) DO NOTHING
             RETURNING server_id, status, endpoint, display_name, created_at`,
            [value.serverId, value.ownerAccountId, value.endpoint, value.displayName,
                value.challengeTokenHash, value.challengeExpiresAt]
        );
        if (!result.rows?.length) return { created: false };
        const row = result.rows[0];
        return Object.freeze({
            created: true,
            serverId: row.server_id,
            status: row.status,
            endpoint: row.endpoint,
            displayName: row.display_name,
            createdAt: new Date(row.created_at).toISOString()
        });
    }

    async verifyOwnership({ serverId, ownerAccountId, challengeTokenHash, now = new Date() }) {
        if (typeof serverId !== "string" || !SERVER_ID.test(serverId) ||
            typeof ownerAccountId !== "string" || ownerAccountId.length < 1 ||
            typeof challengeTokenHash !== "string" || !TOKEN_HASH.test(challengeTokenHash) ||
            !(now instanceof Date) || !Number.isFinite(now.getTime())) {
            throw new TypeError("A valid server ownership challenge is required.");
        }
        const result = await this.pool.query(
            `UPDATE csy_private.community_servers
             SET verified_at = $4, verification_token_hash = NULL,
                 verification_expires_at = NULL, updated_at = $4
             WHERE server_id = $1 AND owner_account_id = $2
               AND verification_token_hash = $3
               AND verification_expires_at > $4
               AND status = 'pending'
             RETURNING server_id, verified_at`,
            [serverId, ownerAccountId, challengeTokenHash, now]
        );
        return result.rows?.length === 1;
    }

    async verifyOwnershipFromDns({ serverId, ownerAccountId, now = new Date(), resolveTxt = dns.resolveTxt }) {
        if (typeof serverId !== "string" || !SERVER_ID.test(serverId) ||
            typeof ownerAccountId !== "string" || ownerAccountId.length < 1 ||
            !(now instanceof Date) || !Number.isFinite(now.getTime()) ||
            typeof resolveTxt !== "function") {
            throw new TypeError("A valid server ownership verification request is required.");
        }
        const pending = await this.pool.query(
            `SELECT endpoint, verification_token_hash, verification_expires_at
             FROM csy_private.community_servers
             WHERE server_id = $1 AND owner_account_id = $2 AND status = 'pending'
               AND verified_at IS NULL AND verification_token_hash IS NOT NULL
               AND verification_expires_at > $3`,
            [serverId, ownerAccountId, now]
        );
        if (pending.rows?.length !== 1) return false;
        const hostname = new URL(validateEndpoint(pending.rows[0].endpoint)).hostname;
        let records;
        try {
            records = await resolveTxt("_csy-verify." + hostname);
        } catch (error) {
            // Missing records and resolver failures are a failed proof, not a
            // reason to reveal DNS or registration details to the caller.
            if (error && ["ENOTFOUND", "ENODATA", "ENONAME", "ESERVFAIL", "ETIMEOUT", "ECONNREFUSED"].includes(error.code)) {
                return false;
            }
            throw error;
        }
        if (!Array.isArray(records) || records.length > 32) return false;
        const expectedHash = pending.rows[0].verification_token_hash;
        const matched = records.some(chunks => {
            if (!Array.isArray(chunks) || chunks.length < 1 || chunks.length > 8 ||
                chunks.some(chunk => typeof chunk !== "string")) return false;
            const value = chunks.join("");
            if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
            const actualHash = hashOwnershipChallenge(value);
            return crypto.timingSafeEqual(Buffer.from(actualHash, "hex"), Buffer.from(expectedHash, "hex"));
        });
        if (!matched) return false;
        // DNS resolution may take long enough for the challenge to expire.
        // Re-read the clock after the external lookup; never reuse the
        // pre-resolution timestamp to extend the proof's validity.
        const verifiedAt = new Date();
        if (verifiedAt.getTime() >= new Date(pending.rows[0].verification_expires_at).getTime()) {
            return false;
        }
        return this.verifyOwnership({
            serverId,
            ownerAccountId,
            challengeTokenHash: expectedHash,
            now: verifiedAt
        });
    }

    async approve({ serverId, approvedBy, now = new Date() }) {
        if (typeof serverId !== "string" || !SERVER_ID.test(serverId) ||
            typeof approvedBy !== "string" || !approvedBy.trim() || approvedBy.length > 128 ||
            !(now instanceof Date) || !Number.isFinite(now.getTime())) {
            throw new TypeError("A valid approval actor, server ID, and timestamp are required.");
        }
        const result = await this.pool.query(
            `UPDATE csy_private.community_servers
             SET status = 'approved', approved_at = $3, approved_by = $2, updated_at = $3
             WHERE server_id = $1 AND status = 'pending' AND verified_at IS NOT NULL
             RETURNING server_id`,
            [serverId, approvedBy, now]
        );
        return result.rows?.length === 1;
    }

    async revoke({ serverId, revokedBy, reason = "", now = new Date() }) {
        if (typeof serverId !== "string" || !SERVER_ID.test(serverId) ||
            typeof revokedBy !== "string" || !revokedBy.trim() || revokedBy.length > 128 ||
            typeof reason !== "string" || reason.length > 240 ||
            !(now instanceof Date) || !Number.isFinite(now.getTime())) {
            throw new TypeError("A valid revocation actor, server ID, reason, and timestamp are required.");
        }
        const result = await this.pool.query(
            `UPDATE csy_private.community_servers
             SET status = 'revoked', revoked_at = $3, revoked_by = $2,
                 revocation_reason = $4, updated_at = $3
             WHERE server_id = $1 AND status <> 'revoked'
             RETURNING server_id`,
            [serverId, revokedBy, now, reason.trim()]
        );
        return result.rows?.length === 1;
    }

    async isApproved(serverId) {
        if (typeof serverId !== "string" || !SERVER_ID.test(serverId)) {
            throw new TypeError("A valid community server ID is required.");
        }
        const result = await this.pool.query(
            `SELECT 1
             FROM csy_private.community_servers
             WHERE server_id = $1 AND status = 'approved'
               AND verified_at IS NOT NULL AND revoked_at IS NULL`,
            [serverId]
        );
        return result.rows?.length === 1;
    }

    async listApproved({ limit = 100, afterServerId = null } = {}) {
        if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
            (afterServerId !== null &&
                (typeof afterServerId !== "string" || !SERVER_ID.test(afterServerId)))) {
            throw new TypeError("A valid directory page size and cursor are required.");
        }
        const result = await this.pool.query(
            `SELECT server_id, endpoint, display_name, verified_at
             FROM csy_private.community_servers
             WHERE status = 'approved' AND verified_at IS NOT NULL
               AND revoked_at IS NULL
               AND ($2::text IS NULL OR server_id > $2)
             ORDER BY server_id ASC
             LIMIT $1`,
            [limit + 1, afterServerId]
        );
        const rows = result.rows || [];
        const hasMore = rows.length > limit;
        const page = rows.slice(0, limit);
        return Object.freeze({
            servers: Object.freeze(page.map(publicServer)),
            nextCursor: hasMore ? page[page.length - 1].server_id : null
        });
    }

    async getOwned({ serverId, ownerAccountId }) {
        if (typeof serverId !== "string" || !SERVER_ID.test(serverId) ||
            typeof ownerAccountId !== "string" || ownerAccountId.length < 1) {
            throw new TypeError("A valid server ID and owner account are required.");
        }
        const result = await this.pool.query(
            `SELECT server_id, endpoint, display_name, status, verified_at,
                    approved_at, revoked_at, created_at, updated_at
             FROM csy_private.community_servers
             WHERE server_id = $1 AND owner_account_id = $2`,
            [serverId, ownerAccountId]
        );
        if (!result.rows?.length) return null;
        const row = result.rows[0];
        return Object.freeze({
            serverId: row.server_id,
            endpoint: row.endpoint,
            displayName: row.display_name,
            status: row.status,
            verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
            approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
            revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
            createdAt: new Date(row.created_at).toISOString(),
            updatedAt: new Date(row.updated_at).toISOString()
        });
    }
}

function hashOwnershipChallenge(token) {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
        throw new TypeError("A cryptographically random ownership challenge token is required.");
    }
    return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

module.exports = {
    PostgresCommunityServerRegistry,
    hashOwnershipChallenge,
    createOwnershipChallenge,
    validateEndpoint
};
