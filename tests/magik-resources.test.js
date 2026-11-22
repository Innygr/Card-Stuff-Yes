"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const cards = JSON.parse(fs.readFileSync(path.join(root, "cards.json"), "utf8"));
const solo = fs.readFileSync(path.join(root, "cardgame.js"), "utf8");
const soloHtml = fs.readFileSync(path.join(root, "cardgame.html"), "utf8");
const online = fs.readFileSync(path.join(root, "multiplayer.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

const resourceIds = ["magik", "astral-magik", "gilded-magik", "blood-magik", "dark-magik"];

test("the card catalogue assigns every card to one of the five Magik resources", () => {
    assert.ok(cards.length >= 5);
    assert.ok(resourceIds.every(resource => cards.some(card => card.resource === resource)));
    assert.ok(cards.every(card => resourceIds.includes(card.resource)));
});

test("solo battles replenish, display, and charge the matching resource pool", () => {
    for (const key of ["magik", "astralMagik", "gildedMagik", "bloodMagik", "darkMagik"]) {
        assert.match(solo, new RegExp(key));
    }
    assert.match(solo, /combatant\.resources\[resourceKey\] -= definition\.cost/);
    assert.match(solo, /state\.player\.resources\.magik -= 1/);
    assert.match(soloHtml, /id="resource-pools"/);
    assert.doesNotMatch(solo, /Cards cost Astral Magik to play/);
});

test("multiplayer validates and spends the matching resource on the server", () => {
    for (const key of ["magik", "energy", "gildedMagik", "bloodMagik", "darkMagik"]) {
        assert.match(server, new RegExp(key));
    }
    assert.match(server, /own\[resourceKey\] -= card\.cost/);
    assert.match(server, /resources:\s*\{/);
    assert.match(online, /card\.resource/);
    assert.match(online, /online-resource-pools/);
});
