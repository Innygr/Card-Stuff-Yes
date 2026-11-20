"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test } = require("node:test");
const {
    issueJoinTicket,
    verifyJoinTicket,
    JoinTicketReplayGuard
} = require("../community-join-tickets");

const keys = crypto.generateKeyPairSync("ed25519");
const context = {
    privateKey: keys.privateKey,
    keyId: "official-2026-01",
    issuer: "https://accounts.cardstuffyes.ca",
    audience: "community-server-abc",
    subject: "opaque-player-subject-123",
    now: 1800000000,
    ticketId: "ticket_identifier_123456"
};
const trusted = {
    publicKeys: { "official-2026-01": keys.publicKey },
    issuer: context.issuer,
    audience: context.audience,
    now: context.now
};

test("signed join tickets verify for their intended server", () => {
    const token = issueJoinTicket(context);
    const claims = verifyJoinTicket(token, trusted);
    assert.equal(claims.subject, context.subject);
    assert.equal(claims.audience, context.audience);
    assert.equal(claims.scope, "game:join");
    assert.equal(claims.ticketId, context.ticketId);
});

test("join tickets cannot be used for another audience or issuer", () => {
    const token = issueJoinTicket(context);
    assert.throws(() => verifyJoinTicket(token, { ...trusted, audience: "another-server" }));
    assert.throws(() => verifyJoinTicket(token, { ...trusted, issuer: "untrusted-issuer" }));
});

test("tampered claims and unknown signing keys are rejected", () => {
    const token = issueJoinTicket(context);
    const parts = token.split(".");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    payload.aud = "attacker-server";
    parts[1] = Buffer.from(JSON.stringify(payload)).toString("base64url");
    assert.throws(() => verifyJoinTicket(parts.join("."), trusted));
    assert.throws(() => verifyJoinTicket(token, { ...trusted, publicKeys: {} }));
});

test("expired and excessively long tickets are rejected", () => {
    const token = issueJoinTicket(context);
    assert.throws(() => verifyJoinTicket(token, { ...trusted, now: context.now + 180 }));
    assert.throws(() => issueJoinTicket({ ...context, lifetimeSeconds: 121 }));
});

test("ticket replay guard accepts a ticket once and rejects replay", () => {
    const claims = verifyJoinTicket(issueJoinTicket(context), trusted);
    const guard = new JoinTicketReplayGuard({ maxEntries: 2 });
    assert.equal(guard.consume(claims, context.now), true);
    assert.equal(guard.consume(claims, context.now), false);
});

test("replay guard refuses new tickets at capacity until entries expire", () => {
    const guard = new JoinTicketReplayGuard({ maxEntries: 1 });
    const first = { ticketId: "first_ticket_identifier", expiresAt: 1800000010 };
    const second = { ticketId: "second_ticket_identifier", expiresAt: 1800000020 };
    assert.equal(guard.consume(first, 1800000000), true);
    assert.equal(guard.consume(second, 1800000000), false);
    assert.equal(guard.consume(second, 1800000011), true);
});


test("verification rejects inherited key names and malformed token segments", () => {
    const inheritedKeyToken = issueJoinTicket({ ...context, keyId: "toString" });
    assert.throws(() => verifyJoinTicket(inheritedKeyToken, {
        ...trusted,
        publicKeys: Object.create({ "toString": keys.publicKey })
    }));
    const token = issueJoinTicket(context);
    const parts = token.split(".");
    assert.throws(() => verifyJoinTicket([parts[0] + "=", parts[1], parts[2]].join("."), trusted));
    const arrayHeader = Buffer.from("[]").toString("base64url");
    assert.throws(() => verifyJoinTicket([arrayHeader, parts[1], parts[2]].join("."), trusted));
});

test("verification validates clock-skew configuration", () => {
    const token = issueJoinTicket(context);
    assert.throws(() => verifyJoinTicket(token, { ...trusted, clockSkewSeconds: -1 }));
    assert.throws(() => verifyJoinTicket(token, { ...trusted, clockSkewSeconds: 61 }));
});

test("replay guard rejects tickets at their exact expiry second", () => {
    const guard = new JoinTicketReplayGuard();
    assert.equal(guard.consume({ ticketId: "expired_ticket_identifier", expiresAt: 1800000000 }, 1800000000), false);
});

test("issuer rejects oversized or missing string claims", () => {
    assert.throws(() => issueJoinTicket({ ...context, keyId: "" }));
    assert.throws(() => issueJoinTicket({ ...context, audience: "x".repeat(129) }));
    assert.throws(() => issueJoinTicket({ ...context, subject: "" }));
});
