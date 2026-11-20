"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { REQUIRED_TABLES, verifyDatabase } = require("../scripts/verify-database");

test("Supabase verifier checks the complete initial private schema", () => {
    assert.deepEqual(REQUIRED_TABLES, [
        "accounts",
        "account_sessions",
        "decks",
        "deck_cards",
        "player_settings",
        "profiles",
        "schema_migrations"
    ]);
    assert.equal(typeof verifyDatabase, "function");
});
