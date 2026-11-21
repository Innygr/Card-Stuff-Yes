"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createBoundedJoinRateLimiter, createCommunityJoinService } = require("../community-join-service");

test("community join limiter enforces per-source windows and bounds memory", () => {
    let current = 1000;
    const limit = createBoundedJoinRateLimiter({
        limit: 2, windowMs: 5000, maxSources: 2, now: () => current
    });
    const request = ip => ({ socket: { remoteAddress: ip } });
    assert.equal(limit(request("192.0.2.1")), true);
    assert.equal(limit(request("192.0.2.1")), true);
    assert.equal(limit(request("192.0.2.1")), false);
    assert.equal(limit(request("192.0.2.2")), true);
    assert.equal(limit(request("192.0.2.3")), false);
    current += 5001;
    assert.equal(limit(request("192.0.2.3")), true);
});

test("community join service requires a host-owned PostgreSQL pool", () => {
    assert.throws(() => createCommunityJoinService({
        issuer: "https://accounts.example.test",
        serverId: "community:test",
        publicKeySet: { keys: [] },
        provisionPlayer() {}
    }), /PostgreSQL pool/);
});

test("community join service validates its configured issuer and pinned keys", () => {
    const pool = { async query() { return { rows: [] }; } };
    assert.throws(() => createCommunityJoinService({
        pool, issuer: "https://accounts.example.test", serverId: "community:test",
        publicKeySet: { keys: [] }, provisionPlayer() {}
    }), /public key|key set|keys/i);
});

test("community join limiter ignores spoofed forwarded client addresses", () => {
    const limit = createBoundedJoinRateLimiter({ limit: 1, windowMs: 5000, maxSources: 4, now: () => 1000 });
    const request = (peer, forwarded) => ({
        socket: { remoteAddress: peer },
        headers: { "x-forwarded-for": forwarded }
    });
    assert.equal(limit(request("198.51.100.10", "203.0.113.1")), true);
    assert.equal(limit(request("198.51.100.10", "203.0.113.2")), false);
    assert.equal(limit(request("198.51.100.11", "203.0.113.1")), true);
});
