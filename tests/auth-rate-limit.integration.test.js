"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { test } = require("node:test");

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "csy-auth-rate-limit-"));
process.env.CSY_ACCOUNT_FILE = path.join(temporaryDirectory, "accounts.json");
process.env.CSY_ACCOUNT_STORAGE = "";

const { handleAccountAuth } = require("../account-auth");
const { handlePostgresAccountAuth } = require("../postgres-account-auth");

let server;
let base;

test.before(async () => {
    server = http.createServer(async (req, res) => {
        const url = new URL(req.url, "http://localhost");
        const handler = url.pathname.startsWith("/postgres/")
            ? handlePostgresAccountAuth
            : handleAccountAuth;
        const routedUrl = url.pathname.startsWith("/postgres/")
            ? new URL(url.pathname.slice("/postgres".length) + url.search, "http://localhost")
            : url;
        if (await handler(req, res, routedUrl, null)) return;
        res.writeHead(404);
        res.end();
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    base = "http://127.0.0.1:" + server.address().port;
});

test.after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

async function malformedAttempt(route, ip) {
    const response = await fetch(base + route, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": ip
        },
        body: "{"
    });
    return response.status;
}

for (const [storage, prefix] of [["JSON", ""], ["PostgreSQL", "/postgres"]]) {
    for (const route of ["/api/auth/register", "/api/auth/login"]) {
        test(storage + " " + route + " enforces the HTTP 429 threshold", async () => {
            const ip = storage === "JSON"
                ? (route.endsWith("register") ? "198.51.100.11" : "198.51.100.12")
                : (route.endsWith("register") ? "198.51.100.21" : "198.51.100.22");
            for (let attempt = 0; attempt < 10; attempt += 1) {
                assert.equal(await malformedAttempt(prefix + route, ip), 400);
            }
            assert.equal(await malformedAttempt(prefix + route, ip), 429);
        });
    }
}
