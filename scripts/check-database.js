"use strict";

const { checkDatabase, closeDatabase } = require("../db");

async function main() {
    try {
        const status = await checkDatabase();
        if (!status.configured) {
            console.error("DATABASE_URL is not configured.");
            process.exitCode = 1;
            return;
        }
        console.log("PostgreSQL connection successful.");
    } finally {
        await closeDatabase();
    }
}

main().catch(error => {
    console.error("PostgreSQL connection failed:", error.message);
    process.exitCode = 1;
});
