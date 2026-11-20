"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
    normalizeEmail, publicBaseUrl, emailActionsReady, tokenHash, createToken, rateLimited, trustedOrigin
} = require("../email-account");

test("email normalization trims, lowercases, and rejects malformed or oversized addresses", () => {
    assert.equal(normalizeEmail("  Player@Example.COM "), "player@example.com");
    assert.equal(normalizeEmail("not-an-address"), null);
    assert.equal(normalizeEmail("x".repeat(250) + "@example.com"), null);
    assert.equal(normalizeEmail(null), null);
});

test("email action links require a configured HTTPS origin without path or credentials", () => {
    const original = process.env.CSY_PUBLIC_BASE_URL;
    try {
        delete process.env.CSY_PUBLIC_BASE_URL;
        assert.equal(publicBaseUrl(), null);
        process.env.CSY_PUBLIC_BASE_URL = "http://cardstuffyes.ca";
        assert.equal(publicBaseUrl(), null);
        process.env.CSY_PUBLIC_BASE_URL = "https://cardstuffyes.ca";
        assert.equal(publicBaseUrl(), "https://cardstuffyes.ca");
        process.env.CSY_PUBLIC_BASE_URL = "https://cardstuffyes.ca/path";
        assert.equal(publicBaseUrl(), null);
        process.env.CSY_PUBLIC_BASE_URL = "https://user:pass@cardstuffyes.ca";
        assert.equal(publicBaseUrl(), null);
    } finally {
        if (original === undefined) delete process.env.CSY_PUBLIC_BASE_URL;
        else process.env.CSY_PUBLIC_BASE_URL = original;
    }
});

test("email action availability fails closed until all provider settings exist", () => {
    const oldKey = process.env.RESEND_API_KEY;
    const oldFrom = process.env.CSY_EMAIL_FROM;
    const oldBase = process.env.CSY_PUBLIC_BASE_URL;
    try {
        delete process.env.RESEND_API_KEY;
        delete process.env.CSY_EMAIL_FROM;
        delete process.env.CSY_PUBLIC_BASE_URL;
        assert.equal(emailActionsReady(), false);
        process.env.RESEND_API_KEY = "test-key";
        process.env.CSY_EMAIL_FROM = "Card Stuff Yes <noreply@cardstuffyes.ca>";
        process.env.CSY_PUBLIC_BASE_URL = "https://account.cardstuffyes.ca";
        assert.equal(emailActionsReady(), true);
    } finally {
        if (oldKey === undefined) delete process.env.RESEND_API_KEY;
        else process.env.RESEND_API_KEY = oldKey;
        if (oldFrom === undefined) delete process.env.CSY_EMAIL_FROM;
        else process.env.CSY_EMAIL_FROM = oldFrom;
        if (oldBase === undefined) delete process.env.CSY_PUBLIC_BASE_URL;
        else process.env.CSY_PUBLIC_BASE_URL = oldBase;
    }
});

test("action tokens are cryptographically random, 256-bit hex values and stored as hashes", () => {
    const first = createToken();
    const second = createToken();
    assert.match(first.token, /^[a-f0-9]{64}$/);
    assert.match(first.hash, /^[a-f0-9]{64}$/);
    assert.notEqual(first.token, first.hash);
    assert.notEqual(first.token, second.token);
    assert.equal(tokenHash(first.token), first.hash);
});

test("email endpoint rate limiting is bounded by source IP and scope", () => {
    const req = { headers: { "cf-connecting-ip": "192.0.2.45" }, socket: {} };
    const scope = "email-account-test-" + require("node:crypto").randomBytes(8).toString("hex");
    for (let i = 0; i < 5; i += 1) assert.equal(rateLimited(req, scope), false);
    assert.equal(rateLimited(req, scope), true);
});

test("email action POSTs require same-origin or an exact configured allowlisted origin", () => {
    const original = process.env.CSY_ALLOWED_ORIGINS;
    const req = {
        headers: { origin: "https://account.cardstuffyes.ca", host: "api.cardstuffyes.ca", "x-forwarded-proto": "https" },
        socket: {}
    };
    try {
        delete process.env.CSY_ALLOWED_ORIGINS;
        assert.equal(trustedOrigin(req), false);
        process.env.CSY_ALLOWED_ORIGINS = "https://account.cardstuffyes.ca,https://profile.cardstuffyes.ca";
        assert.equal(trustedOrigin(req), true);
        req.headers.origin = "https://evil.example";
        assert.equal(trustedOrigin(req), false);
        req.headers.origin = "http://account.cardstuffyes.ca";
        assert.equal(trustedOrigin(req), false);
    } finally {
        if (original === undefined) delete process.env.CSY_ALLOWED_ORIGINS;
        else process.env.CSY_ALLOWED_ORIGINS = original;
    }
});
