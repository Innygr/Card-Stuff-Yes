"use strict";

let pool = null;

function databaseConfigured() {
    return typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim().length > 0;
}

function getPool() {
    if (!databaseConfigured()) {
        throw new Error("DATABASE_URL is not configured.");
    }
    if (!pool) {
        const connectionString = process.env.DATABASE_URL.trim();
        if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
            throw new Error("DATABASE_URL must be a PostgreSQL connection URI.");
        }
        const { Pool } = require("pg");
        pool = new Pool({
            connectionString,
            // Supabase requires TLS. Keep certificate verification enabled.
            ssl: { rejectUnauthorized: true },
            max: 5,
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 5_000,
            application_name: "card-stuff-yes"
        });
        pool.on("error", error => {
            // Never log the connection string or credentials.
            console.error("Unexpected idle PostgreSQL client error:", error.message);
        });
    }
    return pool;
}

async function checkDatabase() {
    if (!databaseConfigured()) return { configured: false, connected: false };
    await getPool().query("SELECT 1");
    return { configured: true, connected: true };
}

async function closeDatabase() {
    if (!pool) return;
    const current = pool;
    pool = null;
    await current.end();
}

module.exports = { databaseConfigured, getPool, checkDatabase, closeDatabase };
