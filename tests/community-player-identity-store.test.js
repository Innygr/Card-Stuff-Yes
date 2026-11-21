"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { PostgresCommunityPlayerIdentityStore } = require("../community-player-identity-store");

test("identity store creates a local player mapping without accepting official account IDs", async () => {
    const calls = [];
    const pool = {
        async query(sql, values) {
            calls.push({ sql, values });
            return { rows: [{ local_player_id: values[2], display_name: values[3] }] };
        }
    };
    const store = new PostgresCommunityPlayerIdentityStore(pool);
    const player = await store.resolveOrCreate({
        issuer: "https://accounts.example.test",
        externalSubject: "opaque-subject-value-123456"
    });
    assert.match(player.id, /^[0-9a-f-]{36}$/);
    assert.match(player.name, /^Player-[0-9A-F]{8}$/);
    assert.equal(Object.hasOwn(player, "accountId"), false);
    assert.match(calls[0].sql, /ON CONFLICT \(issuer, external_subject\)/);
    assert.match(calls[0].sql, /RETURNING local_player_id, display_name/);
    assert.deepEqual(calls[0].values.slice(0, 2), [
        "https://accounts.example.test",
        "opaque-subject-value-123456"
    ]);
});

test("identity store returns the existing local identity on repeated sign-in", async () => {
    let stored;
    const pool = {
        async query(sql, values) {
            if (!stored) stored = { local_player_id: values[2], display_name: values[3] };
            return { rows: [stored] };
        }
    };
    const store = new PostgresCommunityPlayerIdentityStore(pool);
    const identity = { issuer: "https://accounts.example.test", externalSubject: "opaque-subject-value-123456" };
    const first = await store.resolveOrCreate(identity);
    const second = await store.resolveOrCreate(identity);
    assert.deepEqual(second, first);
});

test("identity store propagates persistence errors and validates inputs", async () => {
    assert.throws(() => new PostgresCommunityPlayerIdentityStore(null));
    const store = new PostgresCommunityPlayerIdentityStore({
        async query() { throw new Error("database unavailable"); }
    });
    await assert.rejects(store.resolveOrCreate({
        issuer: "issuer", externalSubject: "opaque-subject-value-123456"
    }), /database unavailable/);
    await assert.rejects(store.resolveOrCreate({
        issuer: "issuer", externalSubject: "short"
    }), TypeError);
});
