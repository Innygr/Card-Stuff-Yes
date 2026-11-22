"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { ownedDeckCardShortages } = require("../postgres-account-auth");

test("deck ownership validation counts duplicate copies against inventory", async () => {
    const calls = [];
    const client = {
        async query(sql, params) {
            calls.push({ sql, params });
            return {
                rows: [
                    { card_id: "spark", quantity: 2 },
                    { card_id: "guard", quantity: 1 }
                ]
            };
        }
    };
    const shortages = await ownedDeckCardShortages(client, "account-1", [
        "spark", "spark", "spark", "guard", "mend"
    ]);
    assert.deepEqual(shortages, [
        { cardId: "spark", required: 3, owned: 2 },
        { cardId: "mend", required: 1, owned: 0 }
    ]);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].params, ["account-1", ["spark", "guard", "mend"]]);
    assert.match(calls[0].sql, /FOR UPDATE/);
});

test("empty decks require no inventory query", async () => {
    let called = false;
    const shortages = await ownedDeckCardShortages({
        async query() { called = true; return { rows: [] }; }
    }, "account-1", []);
    assert.deepEqual(shortages, []);
    assert.equal(called, false);
});
