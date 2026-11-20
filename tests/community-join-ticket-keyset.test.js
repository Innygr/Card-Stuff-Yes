"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test } = require("node:test");
const { importCommunityJoinPublicKeys } = require("../community-join-ticket-keyset");
const { createCommunityJoinIssuer } = require("../community-join-ticket-issuer");
const { verifyJoinTicket } = require("../community-join-tickets");

function keySet() {
    const pair = crypto.generateKeyPairSync("ed25519");
    const issuer = createCommunityJoinIssuer({
        privateKey: pair.privateKey,
        keyId: "rotation-key-1",
        issuer: "https://accounts.example.test",
        subjectSecret: "unit-test-secret-that-is-at-least-thirty-two-characters"
    });
    return { pair, issuer };
}

test("imports public Ed25519 JWKs into a verifier key map", () => {
    const { pair, issuer } = keySet();
    const imported = importCommunityJoinPublicKeys(issuer.publicKeySet);
    assert.equal(imported["rotation-key-1"].asymmetricKeyType, "ed25519");
    assert.equal(Object.isFrozen(imported), true);
    assert.equal(verifyJoinTicket(issuer.issueForAccount({
        accountId: "acct-1", serverId: "community:one"
    }), {
        publicKeys: imported,
        issuer: "https://accounts.example.test",
        audience: "community:one"
    }).audience, "community:one");
    assert.equal(pair.publicKey.asymmetricKeyType, "ed25519");
});

test("supports overlapping old and new keys during rotation", () => {
    const first = keySet();
    const secondPair = crypto.generateKeyPairSync("ed25519");
    const second = createCommunityJoinIssuer({
        privateKey: secondPair.privateKey,
        keyId: "rotation-key-2",
        issuer: "https://accounts.example.test",
        subjectSecret: "another-test-secret-that-is-at-least-thirty-two-characters"
    });
    const imported = importCommunityJoinPublicKeys({
        keys: [...first.issuer.publicKeySet.keys, ...second.publicKeySet.keys]
    });
    assert.deepEqual(Object.keys(imported).sort(), ["rotation-key-1", "rotation-key-2"]);
});

test("rejects missing, malformed, private, duplicate, and oversized key sets", () => {
    const { issuer } = keySet();
    const jwk = issuer.publicKeySet.keys[0];
    assert.throws(() => importCommunityJoinPublicKeys(null), /1 to 32/);
    assert.throws(() => importCommunityJoinPublicKeys({ keys: [] }), /1 to 32/);
    assert.throws(() => importCommunityJoinPublicKeys({ keys: [ { ...jwk, d: "private" } ] }), /invalid or private/);
    assert.throws(() => importCommunityJoinPublicKeys({ keys: [ { ...jwk, alg: "none" } ] }), /invalid or private/);
    assert.throws(() => importCommunityJoinPublicKeys({ keys: [jwk, jwk] }), /duplicate/);
    assert.throws(() => importCommunityJoinPublicKeys({ keys: Array(33).fill(jwk) }), /1 to 32/);
    assert.throws(() => importCommunityJoinPublicKeys({ keys: [{ ...jwk, kid: "../bad" }] }), /invalid or private/);
    assert.throws(() => importCommunityJoinPublicKeys({ keys: [{ ...jwk, x: "A".repeat(43) }] }), /non-canonical public key|invalid/);
    assert.throws(() => importCommunityJoinPublicKeys({ keys: [{ ...jwk, extra: "unexpected" }] }), /unsupported JWK fields/);
});
