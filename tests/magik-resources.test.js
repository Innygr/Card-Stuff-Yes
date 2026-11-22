"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const cards = JSON.parse(fs.readFileSync(path.join(root, "cards.json"), "utf8"));
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

const resourceIds = ["magik", "astral-magik", "gilded-magik", "blood-magik", "dark-magik"];

test("the card catalogue assigns every card to one of the five Magik resources", () => {
    assert.ok(cards.length >= 5);
    assert.ok(resourceIds.every(resource => cards.some(card => card.resource === resource)));
    assert.ok(cards.every(card => resourceIds.includes(card.resource)));
});

test("multiplayer replenishes and exposes all five independent resource pools", () => {
    for (const key of ["magik", "energy", "gildedMagik", "bloodMagik", "darkMagik"]) {
        assert.match(server, new RegExp(key));
    }
    assert.match(server, /resources:\s*\{/);
    assert.match(server, /combatant\.magik = 1/);
    assert.match(server, /combatant\.gildedMagik = Math\.min\(MAX_ENERGY, combatant\.turnCount\)/);
    assert.match(server, /own\[resourceKey\] -= card\.cost/);
    assert.match(server, /resourceKeys\[card\.resource\]/);
});
