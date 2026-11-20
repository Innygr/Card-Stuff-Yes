"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test } = require("node:test");
const { verifyJoinTicket } = require("../community-join-tickets");
const { createCommunityJoinIssuer, createCommunityJoinIssuerFromEnvironment } =
    require("../community-join-ticket-issuer");

function fixture() {
    const pair = crypto.generateKeyPairSync("ed25519");
    let clock = 1800000000;
    const issuer = createCommunityJoinIssuer({
        privateKey: pair.privateKey,
        keyId: "issuer-test-1",
        issuer: "https://accounts.example.test",
        subjectSecret: "test-only-subject-secret-value-which-is-long-enough",
        now: () => clock
    });
    return { pair, issuer, now: () => clock, setNow: value => { clock = value; } };
}

test("issuer creates short-lived audience-bound tickets with opaque subjects", () => {
    const f = fixture();
    const token = f.issuer.issueForAccount({
        accountId: "internal-account-id-123",
        serverId: "community:example-01"
    });
    const verified = verifyJoinTicket(token, {
        publicKeys: { "issuer-test-1": f.pair.publicKey },
        issuer: "https://accounts.example.test",
        audience: "community:example-01",
        now: f.now()
    });
    assert.notEqual(verified.subject, "internal-account-id-123");
    assert.equal(verified.subject.length > 20, true);
    assert.equal(verified.expiresAt - f.now(), 60);
    assert.throws(() => verifyJoinTicket(token, {
        publicKeys: { "issuer-test-1": f.pair.publicKey },
        issuer: "https://accounts.example.test",
        audience: "community:other-server",
        now: f.now()
    }));
});

test("issuer produces a public-only Ed25519 key set", () => {
    const f = fixture();
    const jwk = f.issuer.publicKeySet.keys[0];
    assert.deepEqual(
        { kty: jwk.kty, crv: jwk.crv, use: jwk.use, alg: jwk.alg, kid: jwk.kid },
        { kty: "OKP", crv: "Ed25519", use: "sig", alg: "EdDSA", kid: "issuer-test-1" }
    );
    assert.equal(typeof jwk.x, "string");
    assert.equal(Object.hasOwn(jwk, "d"), false);
});

test("issuer derives distinct opaque subjects per community server", () => {
    const f = fixture();
    const first = f.issuer.issueForAccount({ accountId: "account-1", serverId: "community:a" });
    const second = f.issuer.issueForAccount({ accountId: "account-1", serverId: "community:b" });
    const a = verifyJoinTicket(first, {
        publicKeys: { "issuer-test-1": f.pair.publicKey },
        issuer: "https://accounts.example.test", audience: "community:a", now: f.now()
    });
    const b = verifyJoinTicket(second, {
        publicKeys: { "issuer-test-1": f.pair.publicKey },
        issuer: "https://accounts.example.test", audience: "community:b", now: f.now()
    });
    assert.notEqual(a.subject, b.subject);
});

test("issuer rejects weak configuration, non-Ed25519 keys, and invalid server IDs", () => {
    const pair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    assert.throws(() => createCommunityJoinIssuer({
        privateKey: pair.privateKey, keyId: "key", issuer: "issuer",
        subjectSecret: "a".repeat(40)
    }), /Ed25519/);
    const good = fixture();
    assert.throws(() => good.issuer.issueForAccount({
        accountId: "acct", serverId: "bad server id"
    }));
    assert.throws(() => createCommunityJoinIssuer({
        privateKey: good.pair.privateKey, keyId: "key", issuer: "issuer",
        subjectSecret: "too-short"
    }), /at least 32/);
});

test("environment factory fails clearly when issuer secrets are absent", () => {
    const names = [
        "CSY_JOIN_SIGNING_PRIVATE_KEY",
        "CSY_JOIN_SIGNING_KEY_ID",
        "CSY_JOIN_ISSUER",
        "CSY_JOIN_SUBJECT_SECRET"
    ];
    const previous = names.map(name => process.env[name]);
    try {
        for (const name of names) delete process.env[name];
        assert.throws(() => createCommunityJoinIssuerFromEnvironment(), /environment is incomplete/);
    } finally {
        names.forEach((name, index) => {
            if (previous[index] === undefined) delete process.env[name];
            else process.env[name] = previous[index];
        });
    }
});
