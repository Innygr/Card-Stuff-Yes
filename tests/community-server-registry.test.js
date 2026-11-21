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
            assert.deepEqual(values, [25]);
            return { rows: [{
                server_id: base.serverId,
                endpoint: "https://cards.example.net",
                display_name: "Example Community",
                verified_at: NOW
            }] };
        }
    });
    const list = await registry.listApproved({ limit: 25 });
    assert.deepEqual(list[0], {
        serverId: base.serverId,
        endpoint: "https://cards.example.net",
        displayName: "Example Community",
        verifiedAt: NOW.toISOString()
    });
    assert.equal(Object.hasOwn(list[0], "ownerAccountId"), false);
    await assert.rejects(registry.listApproved({ limit: 501 }), TypeError);
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
