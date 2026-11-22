"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const admin = fs.readFileSync(path.join(root, "admin-management.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const migration = fs.readFileSync(path.join(root, "migrations", "009_card_catalogue_versions.sql"), "utf8");

test("card catalogue publishing is owner-only and validates battle abilities", () => {
    assert.match(admin, /route === "\/api\/admin\/cards" && req\.method === "PUT"/);
    assert.match(admin, /admin\.rank !== "owner"/);
    assert.match(admin, /Only the owner can publish the card catalogue/);
    assert.match(admin, /new Set\(\["attack", "guard", "heal", "draw"\]\)/);
    assert.match(admin, /resourceKeys\.has\(key\)/);
    assert.match(admin, /\["damage", "shield", "heal", "draw"\]/);
    assert.match(admin, /\["self", "opponent"\]/);
});

test("published catalogues are versioned and cannot drop existing card IDs", () => {
    assert.match(migration, /card_catalogue_versions/);
    assert.match(migration, /PRIMARY KEY/);
    assert.match(admin, /LOCK TABLE csy_private\.card_catalogue_versions IN EXCLUSIVE MODE/);
    assert.match(admin, /cannot remove existing card IDs/);
    assert.match(admin, /INSERT INTO csy_private\.card_catalogue_versions/);
});

test("public card API and multiplayer refresh use the latest published catalogue", () => {
    assert.match(server, /async function refreshPublishedCatalogue/);
    assert.match(server, /SELECT cards FROM csy_private\.card_catalogue_versions ORDER BY version DESC LIMIT 1/);
    assert.match(server, /await refreshPublishedCatalogue\(true\);\s*sendJson\(res, 200, \{ cards: CARDS/);
    assert.match(server, /await refreshPublishedCatalogue\(\);\s*await handleApi/);
});
