"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "csy-admin-logs-"));
const logFile = path.join(temp, "server.log");
fs.writeFileSync(logFile, "INFO server ready\nWARN slow request\nERROR request failed\n");
const salt = crypto.randomBytes(16);
const passwordHash = "scrypt:" + salt.toString("hex") + ":" +
    crypto.scryptSync("correct horse battery staple", salt, 64).toString("hex");
process.env.CSY_LOG_FILE = logFile;
process.env.CSY_ADMIN_USERS = JSON.stringify([
    { username: "site-owner", rank: "owner", passwordHash },
    { username: "ordinary-mod", rank: "mod", passwordHash }
]);
const { handleAdminLogs } = require("../admin-logs");

let server;
let base;
test.before(async () => {
    server = http.createServer(async (req, res) => {
        const url = new URL(req.url, "http://localhost");
        if (await handleAdminLogs(req, res, url)) return;
        res.writeHead(404); res.end();
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    base = "http://127.0.0.1:" + server.address().port;
});
test.after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
});

test("rejects log reads without an owner/admin session", async () => {
    const response = await fetch(base + "/api/admin/server-logs");
    assert.equal(response.status, 403);
});

test("owner login can read and filter bounded server logs", async () => {
    const login = await fetch(base + "/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: base },
        body: JSON.stringify({ username: "site-owner", password: "correct horse battery staple" })
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const response = await fetch(base + "/api/admin/server-logs?level=error", {
        headers: { Cookie: cookie }
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.lines.length, 1);
    assert.match(data.lines[0], /ERROR request failed/);
});

test("rejects users whose configured rank is not admin or owner", async () => {
    const login = await fetch(base + "/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: base },
        body: JSON.stringify({ username: "ordinary-mod", password: "correct horse battery staple" })
    });
    assert.equal(login.status, 401);
});

test("admin login rate limit returns HTTP 429 after eight attempts", async () => {
    const headers = {
        "Content-Type": "application/json",
        Origin: base,
        "X-Forwarded-For": "203.0.113.77"
    };
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const response = await fetch(base + "/api/admin/login", {
            method: "POST",
            headers,
            body: "{"
        });
        assert.equal(response.status, 400);
    }
    const blocked = await fetch(base + "/api/admin/login", {
        method: "POST",
        headers,
        body: "{"
    });
    assert.equal(blocked.status, 429);
});
