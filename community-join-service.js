"use strict";

const { createCommunityJoinHttpHandler } = require("./community-join-http");
const { createCommunityJoinRedeemer } = require("./community-join-ticket-redeemer");
const { PostgresJoinTicketReplayStore } = require("./community-join-ticket-replay-store");
const { PostgresCommunityPlayerIdentityStore } = require("./community-player-identity-store");

function createBoundedJoinRateLimiter({ limit = 10, windowMs = 60_000, maxSources = 10_000, now = Date.now } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 ||
        !Number.isSafeInteger(windowMs) || windowMs < 1000 ||
        !Number.isSafeInteger(maxSources) || maxSources < 1 ||
        typeof now !== "function") {
        throw new TypeError("Invalid community join rate-limit configuration.");
    }
    const sources = new Map();
    return function rateLimit(req) {
        const source = String(req.socket && req.socket.remoteAddress || "unknown").slice(0, 128);
        const current = now();
        let entry = sources.get(source);
        if (!entry || current - entry.startedAt >= windowMs) {
            if (sources.size >= maxSources) {
                for (const [key, value] of sources) {
                    if (current - value.startedAt >= windowMs) sources.delete(key);
                }
            }
            if (sources.size >= maxSources && !sources.has(source)) return false;
            entry = { startedAt: current, count: 0 };
            sources.set(source, entry);
        }
        entry.count += 1;
        return entry.count <= limit;
    };
}

function createCommunityJoinService({ pool, issuer, serverId, publicKeySet, provisionPlayer, establishSession, now }) {
    if (!pool || typeof pool.query !== "function") {
        throw new TypeError("A host-owned PostgreSQL pool is required.");
    }
    if (typeof provisionPlayer !== "function") {
        throw new TypeError("A local player provisioning callback is required.");
    }
    const replayStore = new PostgresJoinTicketReplayStore(pool);
    const redeemer = createCommunityJoinRedeemer({
        issuer, serverId, publicKeySet, replayStore,
        ...(now ? { now } : {})
    });
    return createCommunityJoinHttpHandler({
        redeemer,
        provisionPlayer,
        rateLimit: createBoundedJoinRateLimiter(),
        ...(establishSession ? { establishSession } : {})
    });
}

function createCommunityJoinServiceFromEnvironment(options = {}) {
    let publicKeySet;
    try {
        publicKeySet = JSON.parse(process.env.CSY_COMMUNITY_JOIN_PUBLIC_JWKS || "");
    } catch {
        throw new Error("CSY_COMMUNITY_JOIN_PUBLIC_JWKS must contain valid pinned public JWK JSON.");
    }
    const issuer = process.env.CSY_COMMUNITY_JOIN_ISSUER;
    const serverId = process.env.CSY_COMMUNITY_SERVER_ID;
    if (!issuer || !serverId) {
        throw new Error("Community join issuer and server ID are required.");
    }
    return createCommunityJoinService({
        ...options,
        issuer,
        serverId,
        publicKeySet
    });
}

module.exports = {
    createBoundedJoinRateLimiter,
    createCommunityJoinService,
    createCommunityJoinServiceFromEnvironment
};
