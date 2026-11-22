"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const cards = JSON.parse(fs.readFileSync(path.join(root, "cards.json"), "utf8"));
const config = JSON.parse(fs.readFileSync(path.join(root, "card-packs.json"), "utf8"));
const handler = fs.readFileSync(path.join(root, "admin-management.js"), "utf8");
const migration = fs.readFileSync(path.join(root, "migrations", "008_card_pack_opening.sql"), "utf8");

test("Card Set 1 has two disjoint 60-card pack pools covering the full catalogue", () => {
    assert.equal(cards.length, 120);
    const cardIds = cards.map(card => card.id);
    assert.equal(new Set(cardIds).size, 120);
    assert.equal(config.packs.length, 2);
    const poolIds = config.packs.flatMap(pack => {
        assert.equal(pack.cardsPerOpen, 5);
        assert.equal(pack.poolCardIds.length, 60);
        return pack.poolCardIds;
    });
    assert.equal(new Set(poolIds).size, 120);
    assert.deepEqual([...poolIds].sort(), [...cardIds].sort());
});

test("pack opening uses owned pack inventory and stores idempotent results transactionally", () => {
    assert.match(handler, /account_pack_inventory/);
    assert.match(handler, /pack_openings/);
    assert.match(handler, /FOR UPDATE/);
    assert.match(handler, /crypto\.randomInt/);
    assert.match(handler, /Cross-origin request rejected/);
    assert.match(migration, /UNIQUE \(account_id, request_id\)/);
    assert.match(migration, /REFERENCES csy_private\.accounts\(id\) ON DELETE CASCADE/);
});
