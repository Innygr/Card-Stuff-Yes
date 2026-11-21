"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
    PostgresCommunityServerRegistry,
    hashOwnershipChallenge,
    createOwnershipChallenge,
    validateEndpoint
} = require("../community-server-registry");

const NOW = new Date("2026-11-20T12:00:00.000Z");
const base = {
    serverId: "community:example",
    ownerAccountId: "account_123",
    endpoint: "https://cards.example.net/",
    displayName: "Example Community",
    challengeTokenHash: "a".repeat(64),
    challengeExpiresAt: new Date("2026-11-20T13:00:00.000Z")
};

test("registry validates HTTPS endpoints and rejects credentials or unsafe URL components", () => {
    assert.equal(validateEndpoint("https://cards.example.net/"), "https://cards.example.net");
    for (const endpoint of [
        "http://cards.example.net",
        "https://user:password@cards.example.net",
        "https://cards.example.net/?token=secret",
        "https://cards.example.net/#fragment",
        "https://localhost",
        "https://127.0.0.1",
        "https://internal.local",
        "not a URL"
    ]) assert.throws(() => validateEndpoint(endpoint), TypeError);
});

test("registry stores a pending registration without granting public visibility", async () => {
    const calls = [];
    const pool = {
        async query(sql, values) {
            calls.push({ sql, values });
            return { rows: [{
                server_id: values[0], status: "pending", endpoint: values[2],
                display_name: values[3], created_at: NOW
            }] };
        }
    };
    const registry = new PostgresCommunityServerRegistry(pool);
    const result = await registry.registerPending(base);
    assert.equal(result.created, true);
    assert.equal(result.status, "pending");
    assert.match(calls[0].sql, /ON CONFLICT \(server_id\) DO NOTHING/);
    assert.equal(calls[0].values[4], base.challengeTokenHash);
    assert.equal(Object.hasOwn(result, "ownerAccountId"), false);
});

test("registry does not overwrite an existing server ID registration", async () => {
    const registry = new PostgresCommunityServerRegistry({
        async query() { return { rows: [] }; }
    });
    assert.deepEqual(await registry.registerPending(base), { created: false });
});

test("ownership verification is one-time, owner-bound, and expiry-bound", async () => {
    const calls = [];
    const registry = new PostgresCommunityServerRegistry({
        async query(sql, values) {
            calls.push({ sql, values });
            return { rows: [{ server_id: base.serverId }] };
        }
    });
    assert.equal(await registry.verifyOwnership({
        serverId: base.serverId,
        ownerAccountId: base.ownerAccountId,
        challengeTokenHash: base.challengeTokenHash,
        now: NOW
    }), true);
    assert.match(calls[0].sql, /verification_expires_at > \$4/);
    assert.match(calls[0].sql, /verification_token_hash = \$3/);
    assert.equal(calls[0].values[1], base.ownerAccountId);
});

test("approval requires verified pending registration and revocation is explicit", async () => {
    const calls = [];
    const registry = new PostgresCommunityServerRegistry({
        async query(sql, values) {
            calls.push({ sql, values });
            return { rows: [{ server_id: base.serverId }] };
        }
    });
    assert.equal(await registry.approve({
        serverId: base.serverId, approvedBy: "operator-1", now: NOW
    }), true);
    assert.match(calls[0].sql, /status = 'pending' AND verified_at IS NOT NULL/);
    assert.equal(await registry.revoke({
        serverId: base.serverId, revokedBy: "operator-1",
        reason: "policy review", now: NOW
    }), true);
    assert.match(calls[1].sql, /status <> 'revoked'/);
});

test("public directory returns only approved records and omits owner and moderation metadata", async () => {
    const registry = new PostgresCommunityServerRegistry({
        async query(sql, values) {
            assert.match(sql, /status = 'approved' AND verified_at IS NOT NULL/);
            assert.match(sql, /revoked_at IS NULL/);
            assert.match(sql, /ORDER BY server_id ASC/);
            assert.deepEqual(values, [26, null]);
            return { rows: [{
                server_id: base.serverId,
                endpoint: "https://cards.example.net",
                display_name: "Example Community",
                verified_at: NOW
            }] };
        }
    });
    const page = await registry.listApproved({ limit: 25 });
    assert.deepEqual(page.servers[0], {
        serverId: base.serverId,
        endpoint: "https://cards.example.net",
        displayName: "Example Community",
        verifiedAt: NOW.toISOString()
    });
    assert.equal(page.nextCursor, null);
    assert.equal(Object.hasOwn(page.servers[0], "ownerAccountId"), false);
    await assert.rejects(registry.listApproved({ limit: 101 }), TypeError);
    await assert.rejects(registry.listApproved({ afterServerId: "bad/id" }), TypeError);
});

test("public directory pagination uses a stable server ID cursor", async () => {
    const registry = new PostgresCommunityServerRegistry({
        async query(sql, values) {
            assert.match(sql, /server_id > \$2/);
            assert.deepEqual(values, [3, "community:first"]);
            return { rows: [
                { server_id: "community:a", endpoint: "https://a.example.net", display_name: "A", verified_at: NOW },
                { server_id: "community:b", endpoint: "https://b.example.net", display_name: "B", verified_at: NOW },
                { server_id: "community:c", endpoint: "https://c.example.net", display_name: "C", verified_at: NOW }
            ] };
        }
    });
    const page = await registry.listApproved({ limit: 2, afterServerId: "community:first" });
    assert.equal(page.servers.length, 2);
    assert.equal(page.nextCursor, "community:b");
});

test("registry scopes owner lookup and propagates database errors", async () => {
    const registry = new PostgresCommunityServerRegistry({
        async query() { throw new Error("database offline"); }
    });
    await assert.rejects(registry.getOwned({
        serverId: base.serverId, ownerAccountId: base.ownerAccountId
    }), /database offline/);
    assert.throws(() => new PostgresCommunityServerRegistry(null), TypeError);
});

test("ownership challenge hashing accepts high-entropy URL-safe tokens only", () => {
    const token = "x".repeat(43);
    assert.equal(hashOwnershipChallenge(token).length, 64);
    assert.throws(() => hashOwnershipChallenge("short"), TypeError);
});

test("ownership challenge produces a one-time DNS TXT proof with bounded expiry", () => {
    const challenge = createOwnershipChallenge("https://play.example.net", {
        now: NOW,
        lifetimeMs: 60 * 60 * 1000
    });
    assert.equal(challenge.recordName, "_csy-verify.play.example.net");
    assert.equal(challenge.recordValue, challenge.token);
    assert.equal(challenge.tokenHash, hashOwnershipChallenge(challenge.token));
    assert.equal(challenge.expiresAt.toISOString(), "2026-11-20T13:00:00.000Z");
    assert.equal(challenge.token.length, 43);
    assert.throws(() => createOwnershipChallenge("http://play.example.net"), TypeError);
});

test("approved eligibility lookup requires an approved, verified, non-revoked row", async () => {
    const calls = [];
    const registry = new PostgresCommunityServerRegistry({
        async query(sql, values) {
            calls.push({ sql, values });
            return { rows: calls.length === 1 ? [{ "?column?": 1 }] : [] };
        }
    });
    assert.equal(await registry.isApproved(base.serverId), true);
    assert.equal(await registry.isApproved(base.serverId), false);
    assert.match(calls[0].sql, /status = 'approved'/);
    assert.match(calls[0].sql, /verified_at IS NOT NULL AND revoked_at IS NULL/);
    assert.deepEqual(calls[0].values, [base.serverId]);
    await assert.rejects(registry.isApproved("invalid server id"), TypeError);
});

test("DNS ownership verification compares the exact TXT challenge and consumes it once", async () => {
    const token = "z".repeat(43);
    const tokenHash = hashOwnershipChallenge(token);
    const calls = [];
    const registry = new PostgresCommunityServerRegistry({
        async query(sql, values) {
            calls.push({ sql, values });
            if (calls.length === 1) return { rows: [{
                endpoint: "https://play.example.net",
                verification_token_hash: tokenHash,
                verification_expires_at: new Date("2026-11-20T13:00:00.000Z")
            }] };
            return { rows: [{ server_id: base.serverId }] };
        }
    });
    let queriedName;
    const verified = await registry.verifyOwnershipFromDns({
        serverId: base.serverId,
        ownerAccountId: base.ownerAccountId,
        now: NOW,
        clock: () => NOW,
        async resolveTxt(name) {
            queriedName = name;
            return [["unrelated"], [token.slice(0, 20), token.slice(20)]];
        }
    });
    assert.equal(verified, true);
    assert.equal(queriedName, "_csy-verify.play.example.net");
    assert.match(calls[1].sql, /verification_token_hash = \$3/);
});

test("DNS ownership proof is rejected if it expires while DNS is resolving", async () => {
    const token = "z".repeat(43);
    const tokenHash = hashOwnershipChallenge(token);
    const registry = new PostgresCommunityServerRegistry({
        async query(sql) {
            if (sql.startsWith("SELECT endpoint")) return { rows: [{
                endpoint: "https://play.example.net",
                verification_token_hash: tokenHash,
                verification_expires_at: new Date("2026-11-20T13:00:00.000Z")
            }] };
            throw new Error("Expired proof must not be consumed.");
        }
    });
    const verified = await registry.verifyOwnershipFromDns({
        serverId: base.serverId, ownerAccountId: base.ownerAccountId, now: NOW,
        clock: () => new Date("2026-11-20T13:00:01.000Z"),
        async resolveTxt() { return [[token]]; }
    });
    assert.equal(verified, false);
});

test("DNS ownership verification fails closed for missing, incorrect, and expired proofs", async () => {
    const tokenHash = hashOwnershipChallenge("z".repeat(43));
    let dbCalls = 0;
    const registry = new PostgresCommunityServerRegistry({
        async query(sql) {
            dbCalls += 1;
            if (dbCalls === 1) return { rows: [{
                endpoint: "https://play.example.net",
                verification_token_hash: tokenHash,
                verification_expires_at: new Date("2026-11-20T13:00:00.000Z")
            }] };
            if (dbCalls === 2) return { rows: [{
                endpoint: "https://play.example.net",
                verification_token_hash: tokenHash,
                verification_expires_at: new Date("2026-11-20T13:00:00.000Z")
            }] };
            return { rows: [] };
        }
    });
    assert.equal(await registry.verifyOwnershipFromDns({
        serverId: base.serverId, ownerAccountId: base.ownerAccountId, now: NOW,
        async resolveTxt() { return [["wrong-token"]]; }
    }), false);
    assert.equal(await registry.verifyOwnershipFromDns({
        serverId: base.serverId, ownerAccountId: base.ownerAccountId, now: NOW,
        async resolveTxt() { const error = new Error("missing"); error.code = "ENODATA"; throw error; }
    }), false);
    assert.equal(await registry.verifyOwnershipFromDns({
        serverId: base.serverId, ownerAccountId: base.ownerAccountId,
        now: new Date("2026-11-20T14:00:00.000Z"),
        async resolveTxt() { throw new Error("must not query DNS after expiry"); }
    }), false);
});
