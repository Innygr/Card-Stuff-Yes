"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test } = require("node:test");
const { createCommunityJoinIssuer } = require("../community-join-ticket-issuer");
const { createCommunityJoinRedeemer } = require("../community-join-ticket-redeemer");

function fixture() {
    const pair = crypto.generateKeyPairSync("ed25519");
    const issuer = createCommunityJoinIssuer({
        privateKey: pair.privateKey,
        keyId: "redeem-test-1",
        issuer: "https://accounts.example.test",
        subjectSecret: "test-redeemer-secret-long-enough-for-hmac-sha256",
        now: () => 1800000000
    });
    const used = new Set();
    const replayStore = {
        async consume(ticket) {
            if (ticket.expiresAt <= 1800000000 || used.has(ticket.ticketId)) return false;
            used.add(ticket.ticketId);
            return true;
        }
    };
    const redeemer = createCommunityJoinRedeemer({
        issuer: "https://accounts.example.test",
        serverId: "community:redeem-test",
        publicKeySet: issuer.publicKeySet,
        replayStore,
        now: () => 1800000000
    });
    return { issuer, redeemer, replayStore };
}

test("redeemer accepts a valid ticket and returns only an opaque external identity", async () => {
    const f = fixture();
    const token = f.issuer.issueForAccount({
        accountId: "internal-database-account-id",
        serverId: "community:redeem-test"
    });
    const result = await f.redeemer.redeem(token);
    assert.equal(result.accepted, true);
    assert.notEqual(result.player.externalSubject, "internal-database-account-id");
    assert.equal(result.player.serverId, "community:redeem-test");
    assert.equal(Object.hasOwn(result.player, "accountId"), false);
});

test("redeemer rejects replayed tickets", async () => {
    const f = fixture();
    const token = f.issuer.issueForAccount({
        accountId: "account-1",
        serverId: "community:redeem-test"
    });
    assert.equal((await f.redeemer.redeem(token)).accepted, true);
    assert.deepEqual(await f.redeemer.redeem(token), {
        accepted: false,
        reason: "ticket_already_used_or_expired"
    });
});

test("redeemer rejects tickets for another audience before claiming replay state", async () => {
    const f = fixture();
    const token = f.issuer.issueForAccount({
        accountId: "account-1",
        serverId: "community:other"
    });
    let calls = 0;
    const redeemer = createCommunityJoinRedeemer({
        issuer: "https://accounts.example.test",
        serverId: "community:redeem-test",
        publicKeySet: f.issuer.publicKeySet,
        replayStore: { async consume() { calls += 1; return true; } },
        now: () => 1800000000
    });
    await assert.rejects(redeemer.redeem(token), /not valid for this server/);
    assert.equal(calls, 0);
});

test("redeemer fails closed when replay storage is unavailable", async () => {
    const f = fixture();
    const token = f.issuer.issueForAccount({
        accountId: "account-1",
        serverId: "community:redeem-test"
    });
    const redeemer = createCommunityJoinRedeemer({
        issuer: "https://accounts.example.test",
        serverId: "community:redeem-test",
        publicKeySet: f.issuer.publicKeySet,
        replayStore: { async consume() { throw new Error("database unavailable"); } },
        now: () => 1800000000
    });
    await assert.rejects(redeemer.redeem(token), /database unavailable/);
});

test("redeemer requires exact server identity and replay store", () => {
    const f = fixture();
    assert.throws(() => createCommunityJoinRedeemer({
        issuer: "issuer", serverId: "bad server", publicKeySet: f.issuer.publicKeySet,
        replayStore: f.replayStore
    }), /server ID/);
    assert.throws(() => createCommunityJoinRedeemer({
        issuer: "issuer", serverId: "community:ok", publicKeySet: f.issuer.publicKeySet
    }), /replay store/);
});
