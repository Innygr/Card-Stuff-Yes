"use strict";

const { getPool, closeDatabase } = require("../db");

const REQUIRED_TABLES = [
    "accounts",
    "account_sessions",
    "decks",
    "deck_cards",
    "player_settings",
    "profiles",
    "schema_migrations"
];

async function verifyDatabase() {
    const result = await getPool().query(`
        SELECT
            ARRAY(
                SELECT required.name
                FROM unnest($1::text[]) AS required(name)
                WHERE to_regclass(format('%I.%I', 'csy_private', required.name)) IS NULL
                ORDER BY required.name
            ) AS missing_tables,
            CASE
                WHEN EXISTS (
                    SELECT 1 FROM pg_namespace WHERE nspname = 'csy_private'
                )
                THEN has_schema_privilege('anon', 'csy_private', 'USAGE')
                ELSE false
            END AS anon_schema_usage,
            CASE
                WHEN EXISTS (
                    SELECT 1 FROM pg_namespace WHERE nspname = 'csy_private'
                )
                THEN has_schema_privilege('authenticated', 'csy_private', 'USAGE')
                ELSE false
            END AS authenticated_schema_usage,
            EXISTS (
                SELECT 1
                FROM information_schema.role_table_grants
                WHERE table_schema = 'csy_private'
                  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
            ) AS exposed_table_grants
    `, [REQUIRED_TABLES]);

    const status = result.rows[0];
    const failures = [];
    if (status.missing_tables.length) {
        failures.push("Missing tables: " + status.missing_tables.join(", "));
    }
    if (status.anon_schema_usage) failures.push("Supabase anon role has schema USAGE.");
    if (status.authenticated_schema_usage) failures.push("Supabase authenticated role has schema USAGE.");
    if (status.exposed_table_grants) failures.push("PUBLIC, anon, or authenticated has table privileges.");

    if (failures.length) {
        throw new Error("Database verification failed: " + failures.join(" "));
    }

    return status;
}

async function main() {
    try {
        await verifyDatabase();
        console.log("Database verification successful.");
        console.log("All 7 expected private tables are present.");
        console.log("anon/authenticated have no schema access; no PUBLIC/API-role table grants were found.");
    } finally {
        await closeDatabase();
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { REQUIRED_TABLES, verifyDatabase };
