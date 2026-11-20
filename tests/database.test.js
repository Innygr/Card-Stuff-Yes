"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { databaseConfigured, checkDatabase } = require("../db");

test("database configuration is detected without exposing its value", async () => {
    const original = process.env.DATABASE_URL;
    try {
        delete process.env.DATABASE_URL;
        assert.equal(databaseConfigured(), false);
        assert.deepEqual(await checkDatabase(), { configured: false, connected: false });

        process.env.DATABASE_URL = "postgresql://example.invalid/test";
        assert.equal(databaseConfigured(), true);
    } finally {
        if (original === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = original;
    }
});
