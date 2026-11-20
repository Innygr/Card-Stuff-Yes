"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const cards = require("../cards.json");
const {
    validateSource,
    importSource,
    parseArgs
} = require("../scripts/import-json-accounts");

const now = Date.now();
const account = () => ({
    id: "acct_0123456789abcdef0123456789abcdef",
    username: "Test_Player",
    usernameKey: "test_player",
    playerId: "0123456789abcdef0123456789abcdef0123456789abcdef",
    passwordHash: "scrypt$16384$0123456789abcdef0123456789abcdef$" + "a".repeat(128),
    profile: { displayName: "Test", bio: "Hello" },
    settings: { masterVolume: 50 },
    decks: [{
        id: "deck_0123456789abcdef0123456789abcdef",
        name: "Starter",
        cards: [cards[0].id],
        createdAt: new Date(now - 10000).toISOString(),
        updatedAt: new Date(now - 5000).toISOString()
    }],
    createdAt: new Date(now - 20000).toISOString(),
    updatedAt: new Date(now - 5000).toISOString()
});

const sourceData = () => ({
    version: 1,
    accounts: [account()],
    sessions: [{
        tokenHash: "b".repeat(64),
        accountId: "acct_0123456789abcdef0123456789abcdef",
        createdAt: now - 1000,
        expiresAt: now + 60000
    }]
});

test("validates and normalizes legacy account, profile, settings, deck and session records", () => {
    const result = validateSource(sourceData(), now);
    assert.equal(result.accounts.length, 1);
    assert.equal(result.accounts[0].usernameKey, "test_player");
    assert.equal(result.accounts[0].profile.displayName, "Test");
    assert.equal(result.accounts[0].settings.masterVolume, 50);
    assert.deepEqual(result.accounts[0].decks[0].cards, [cards[0].id]);
    assert.equal(result.sessions.length, 1);
    assert.equal(result.expiredSessions, 0);
});

test("skips expired sessions without importing them", () => {
    const data = sourceData();
    data.sessions[0].expiresAt = now - 1;
    const result = validateSource(data, now);
    assert.equal(result.sessions.length, 0);
    assert.equal(result.expiredSessions, 1);
});

test("rejects malformed accounts, duplicate identities, invalid cards and orphan sessions", () => {
    const badPassword = sourceData();
    badPassword.accounts[0].passwordHash = "plaintext";
    assert.throws(() => validateSource(badPassword, now), /Invalid account/);

    const duplicate = sourceData();
    duplicate.accounts.push({ ...account(), id: "acct_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
    assert.throws(() => validateSource(duplicate, now), /Duplicate account identity/);

    const badDeck = sourceData();
    badDeck.accounts[0].decks[0].cards = ["not-a-card"];
    assert.throws(() => validateSource(badDeck, now), /Invalid saved deck/);

    const orphan = sourceData();
    orphan.sessions[0].accountId = "acct_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    assert.throws(() => validateSource(orphan, now), /Invalid session/);
});

test("rejects an existing profile that conflicts with the source instead of silently skipping it", async () => {
    const input = validateSource(sourceData(), now);
    const sourceAccount = input.accounts[0];
    const fakeClient = {
        async query(sql) {
            if (sql.includes("FROM csy_private.accounts")) {
                return { rowCount: 1, rows: [{
                    id: sourceAccount.id,
                    player_id: sourceAccount.playerId,
                    username: sourceAccount.username,
                    username_key: sourceAccount.usernameKey,
                    password_hash: sourceAccount.passwordHash
                }] };
            }
            if (sql.includes("FROM csy_private.profiles")) {
                return { rowCount: 1, rows: [{ display_name: "Different", bio: "Hello" }] };
            }
            if (sql.includes("FROM csy_private.player_settings")) return { rowCount: 0, rows: [] };
            return { rowCount: 0, rows: [] };
        }
    };
    await assert.rejects(
        importSource(fakeClient, input, { apply: false }),
        /Existing profile conflicts/
    );
});

test("requires an explicit dry-run or apply mode", () => {
    assert.throws(() => parseArgs([]), /Choose exactly one mode/);
    assert.throws(() => parseArgs(["--apply", "--dry-run"]), /Choose exactly one mode/);
    assert.throws(() => parseArgs(["--force"]), /Unknown argument/);
    assert.deepEqual(parseArgs(["--dry-run"]), { apply: false });
    assert.deepEqual(parseArgs(["--apply"]), { apply: true });
    assert.deepEqual(parseArgs(["--help"]), { help: true });
});

test("dry-run inspects without issuing row locks or writes", async () => {
    const calls = [];
    const fakeClient = {
        async query(sql) {
            calls.push(sql);
            if (sql.includes("FROM csy_private.accounts")) return { rowCount: 0, rows: [] };
            if (sql.includes("FROM csy_private.profiles")) return { rowCount: 0, rows: [] };
            if (sql.includes("FROM csy_private.player_settings")) return { rowCount: 0, rows: [] };
            return { rowCount: 0, rows: [] };
        }
    };
    const result = await importSource(fakeClient, validateSource(sourceData(), now), { apply: false });
    assert.equal(result.accountsInserted, 1);
    assert.equal(result.profilesInserted, 1);
    assert.equal(result.settingsInserted, 1);
    assert.equal(result.decksInserted, 1);
    assert.equal(result.sessionsInserted, 1);
    assert.ok(calls.every(sql => !/FOR UPDATE|INSERT INTO|DELETE FROM|UPDATE csy_private/i.test(sql)));
});
