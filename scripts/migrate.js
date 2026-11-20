"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { getPool, closeDatabase } = require("../db");

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");
const LOCK_KEY_A = 20261119;
const LOCK_KEY_B = 6565;

async function main() {
    const pool = getPool();
    const client = await pool.connect();
    let locked = false;
    try {
        await client.query("CREATE SCHEMA IF NOT EXISTS csy_private");
        await client.query("REVOKE ALL ON SCHEMA csy_private FROM PUBLIC");
        await client.query(`
            CREATE TABLE IF NOT EXISTS csy_private.schema_migrations (
                version text PRIMARY KEY,
                applied_at timestamptz NOT NULL DEFAULT now()
            )
        `);
        await client.query("SELECT pg_advisory_lock($1, $2)", [LOCK_KEY_A, LOCK_KEY_B]);
        locked = true;

        const files = fs.readdirSync(MIGRATIONS_DIR)
            .filter(name => /^\d+_[a-z0-9_-]+\.sql$/.test(name))
            .sort();

        for (const file of files) {
            const alreadyApplied = await client.query(
                "SELECT 1 FROM csy_private.schema_migrations WHERE version = $1",
                [file]
            );
            if (alreadyApplied.rowCount) continue;

            const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
            console.log("Applying migration:", file);
            await client.query("BEGIN");
            try {
                await client.query(sql);
                await client.query(
                    "INSERT INTO csy_private.schema_migrations (version) VALUES ($1)",
                    [file]
                );
                await client.query("COMMIT");
            } catch (error) {
                await client.query("ROLLBACK");
                throw error;
            }
        }
        console.log("Database migrations are up to date.");
    } finally {
        if (locked) {
            try { await client.query("SELECT pg_advisory_unlock($1, $2)", [LOCK_KEY_A, LOCK_KEY_B]); } catch {}
        }
        client.release();
        await closeDatabase();
    }
}

main().catch(error => {
    console.error("Database migration failed:", error.message);
    process.exitCode = 1;
});
