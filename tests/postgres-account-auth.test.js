"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
    isAccountRoute,
    configuredCommunityServerIds,
    sanitizeProfile,
    hashPassword,
    verifyPassword,
    postgresAccountStorageEnabled,
    isSecure,
    trustedOrigin
} = require("../postgres-account-auth");
const {
    sanitizeSettings,
    validDeckCards,
    DEFAULT_SETTINGS,
    MAX_DECKS,
    MAX_DECK_CARDS
} = require("../account-auth");
const cardCatalog = require("../cards.json");

test("PostgreSQL account routing recognizes only account API routes", () => {
    assert.equal(isAccountRoute("/api/auth/register"), true);
    assert.equal(isAccountRoute("/api/auth/me"), true);
    assert.equal(isAccountRoute("/api/community/join-keys"), true);
    assert.equal(isAccountRoute("/api/account/profile"), true);
    assert.equal(isAccountRoute("/api/account/decks/deck_0123456789abcdef0123456789abcdef"), true);
    assert.equal(isAccountRoute("/api/community/servers/community:one/join-ticket"), true);
    assert.equal(isAccountRoute("/api/community/servers/bad%2Fid/join-ticket"), false);
    assert.equal(isAccountRoute("/api/multiplayer/matches"), false);
    assert.equal(isAccountRoute("/api/cards"), false);
});

test("profile sanitization bounds and normalizes profile fields", () => {
    assert.deepEqual(sanitizeProfile({
        displayName: "  Player  ",
        bio: "  Hello there  ",
        role: "admin"
    }), { displayName: "Player", bio: "Hello there" });
    assert.equal(sanitizeProfile({ displayName: "x".repeat(30) }).displayName.length, 24);
    assert.equal(sanitizeProfile({ bio: "x".repeat(300) }).bio.length, 240);
    assert.deepEqual(sanitizeProfile(null), { displayName: "", bio: "" });
});

test("PostgreSQL password hashes remain compatible with the existing scrypt format", async () => {
    const encoded = await hashPassword("a-long-test-password-123");
    assert.match(encoded, /^scrypt\$16384\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    assert.equal(await verifyPassword("a-long-test-password-123", encoded), true);
    assert.equal(await verifyPassword("incorrect-password", encoded), false);
    assert.equal(await verifyPassword("a-long-test-password-123", "invalid"), false);
});

test("PostgreSQL account storage is opt-in and defaults to JSON mode", () => {
    const original = process.env.CSY_ACCOUNT_STORAGE;
    try {
        delete process.env.CSY_ACCOUNT_STORAGE;
        assert.equal(postgresAccountStorageEnabled(), false);
        process.env.CSY_ACCOUNT_STORAGE = "postgres";
        assert.equal(postgresAccountStorageEnabled(), true);
        process.env.CSY_ACCOUNT_STORAGE = "POSTGRES";
        assert.equal(postgresAccountStorageEnabled(), true);
    } finally {
        if (original === undefined) delete process.env.CSY_ACCOUNT_STORAGE;
        else process.env.CSY_ACCOUNT_STORAGE = original;
    }
});

test("PostgreSQL settings use the same strict allowlist as JSON accounts", () => {
    assert.deepEqual(sanitizeSettings({
        masterVolume: 45,
        reducedMotion: true,
        onlineStatus: "away",
        isAdmin: true,
        mouseSensitivity: 999
    }), {
        masterVolume: 45,
        reducedMotion: true,
        onlineStatus: "away"
    });
    assert.ok(Object.hasOwn(DEFAULT_SETTINGS, "masterVolume"));
});

test("saved deck validation enforces catalog IDs and existing size limits", () => {
    const validId = cardCatalog[0].id;
    assert.equal(validDeckCards([validId]), true);
    assert.equal(validDeckCards([]), true);
    assert.equal(validDeckCards(["not-a-real-card"]), false);
    assert.equal(validDeckCards(Array(MAX_DECK_CARDS + 1).fill(validId)), false);
    assert.equal(MAX_DECKS, 25);
});

test("community join-ticket issuance requires an explicit valid server allowlist", () => {
    assert.equal(configuredCommunityServerIds(""), null);
    assert.equal(configuredCommunityServerIds(undefined), null);
    assert.equal(configuredCommunityServerIds("community:one, community-two")?.has("community:one"), true);
    assert.equal(configuredCommunityServerIds("community:one, community-two")?.has("community-two"), true);
    assert.equal(configuredCommunityServerIds("community:one, bad%2Fid"), null);
    assert.equal(configuredCommunityServerIds("community:one,,community-two")?.size, 2);
});

test("account cookies and same-origin checks ignore spoofed forwarded HTTPS by default", () => {
    const original = process.env.CSY_TRUST_PROXY;
    try {
        delete process.env.CSY_TRUST_PROXY;
        const req = {
            headers: {
                host: "game.example",
                origin: "https://game.example",
                "x-forwarded-proto": "https"
            },
            socket: { encrypted: false }
        };
        assert.equal(isSecure(req), false);
        assert.equal(trustedOrigin(req), false);
        assert.equal(isSecure({ ...req, socket: { encrypted: true } }), true);
    } finally {
        if (original === undefined) delete process.env.CSY_TRUST_PROXY;
        else process.env.CSY_TRUST_PROXY = original;
    }
});

test("account cookie and origin protocol honor forwarded HTTPS only behind trusted proxy", () => {
    const original = process.env.CSY_TRUST_PROXY;
    try {
        process.env.CSY_TRUST_PROXY = "true";
        const req = {
            headers: {
                host: "game.example",
                origin: "https://game.example",
                "x-forwarded-proto": "https, http"
            },
            socket: { encrypted: false }
        };
        assert.equal(isSecure(req), true);
        assert.equal(trustedOrigin(req), true);
        req.headers["x-forwarded-proto"] = "http";
        assert.equal(isSecure(req), false);
        assert.equal(trustedOrigin(req), false);
    } finally {
        if (original === undefined) delete process.env.CSY_TRUST_PROXY;
        else process.env.CSY_TRUST_PROXY = original;
    }
});
