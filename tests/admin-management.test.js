"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const http = require("node:http");
const crypto = require("node:crypto");

const salt = crypto.randomBytes(16);
const passwordHash = "scrypt:" + salt.toString("hex") + ":" +
    crypto.scryptSync("test-owner-password", salt, 64).toString("hex");
process.env.CSY_ADMIN_USERS = JSON.stringify([
    { username: "test-owner", rank: "owner", passwordHash },
    { username: "test-admin", rank: "admin", passwordHash }
]);

const player = {
    id: "acct_0123456789abcdef0123456789abcdef",
    player_id: "a".repeat(48),
    username: "test-player",
    rank: "player",
    email: null,
    email_verified_at: null,
    created_at: new Date("2026-01-01T00:00:00Z")
};
const posts = new Map();
const db = require("../db");
db.getPool = () => ({
    async query(sql, params = []) {
        if (sql.includes("SELECT id, player_id, username, rank, email")) {
            return { rows: [player], rowCount: 1 };
        }
        if (sql.includes("UPDATE csy_private.accounts SET rank")) {
            player.rank = params[0];
            return { rows: [{ id: player.id, username: player.username, rank: player.rank }], rowCount: 1 };
        }
        if (sql.includes("INSERT INTO csy_private.news_posts")) {
            const row = {
                id: params[0], title: params[1], summary: params[2], content: params[3],
                published: params[4], featured: params[5], created_by: params[6],
                created_at: new Date(), updated_at: new Date(),
                published_at: params[4] ? new Date() : null
            };
            posts.set(row.id, row);
            return { rows: [row], rowCount: 1 };
        }
        if (sql.includes("SELECT id, title, summary, content, published")) {
            return { rows: [...posts.values()], rowCount: posts.size };
        }
        if (sql.includes("UPDATE csy_private.news_posts SET")) {
            const row = posts.get(params[0]);
            if (!row) return { rows: [], rowCount: 0 };
            if (params[1] !== null) row.title = params[1];
            if (params[2] !== null) row.summary = params[2];
            if (params[3] !== null) row.content = params[3];
            if (params[4] !== null) row.published = params[4];
            if (params[5] !== null) row.featured = params[5];
            return { rows: [row], rowCount: 1 };
        }
        if (sql.includes("DELETE FROM csy_private.news_posts")) {
            const existed = posts.delete(params[0]);
            return { rows: existed ? [{ id: params[0] }] : [], rowCount: existed ? 1 : 0 };
        }
        if (sql.includes("INSERT INTO csy_private.account_card_inventory")) {
            return { rows: [{ account_id: params[0], card_id: params[1], quantity: params[2] }], rowCount: 1 };
        }
        throw new Error("Unexpected SQL in admin API test: " + sql);
    }
});

const { handleAdminManagement, handlePublicNews } = require("../admin-management");
const { handleAdminLogs } = require("../admin-logs");
let server;
let base;
let ownerCookie;
let adminCookie;

async function request(path, options = {}, cookie = ownerCookie) {
    const headers = { Origin: base, ...(options.headers || {}) };
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(base + path, { ...options, headers });
    return { response, data: await response.json() };
}

test.before(async () => {
    server = http.createServer(async (req, res) => {
        const url = new URL(req.url, "http://localhost");
        if (await handleAdminManagement(req, res, url)) return;
        if (await handleAdminLogs(req, res, url)) return;
        if (await handlePublicNews(req, res, url)) return;
        res.writeHead(404); res.end();
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    base = "http://127.0.0.1:" + server.address().port;

    const owner = await request("/api/admin/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "test-owner", password: "test-owner-password" })
    }, null);
    assert.equal(owner.response.status, 200);
    ownerCookie = owner.response.headers.get("set-cookie").split(";")[0];

    const admin = await request("/api/admin/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "test-admin", password: "test-owner-password" })
    }, null);
    assert.equal(admin.response.status, 200);
    adminCookie = admin.response.headers.get("set-cookie").split(";")[0];
});

test.after(async () => {
    await new Promise(resolve => server.close(resolve));
});

test("admin can list account-backed players", async () => {
    const { response, data } = await request("/api/admin/players");
    assert.equal(response.status, 200);
    assert.equal(data.players[0].username, "test-player");
});

test("only owner can change player roles and owner cannot be assigned", async () => {
    const admin = await request("/api/admin/players/" + player.id + "/rank", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rank: "mod" })
    }, adminCookie);
    assert.equal(admin.response.status, 403);

    const invalid = await request("/api/admin/players/" + player.id + "/rank", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rank: "owner" })
    });
    assert.equal(invalid.response.status, 400);

    const updated = await request("/api/admin/players/" + player.id + "/rank", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rank: "mod" })
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.data.player.rank, "mod");
});

test("admin can create, publish, edit, and delete news posts", async () => {
    const created = await request("/api/admin/news", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            title: "1.0 update", summary: "Release notes", content: "The release is getting closer.",
            published: true, featured: false
        })
    });
    assert.equal(created.response.status, 201);
    const id = created.data.post.id;

    const publicList = await request("/api/news", {}, null);
    assert.equal(publicList.response.status, 200);
    assert.equal(publicList.data.news.length, 1);

    const edited = await request("/api/admin/news/" + id, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured: true, title: "Card Stuff Yes 1.0" })
    });
    assert.equal(edited.response.status, 200);
    assert.equal(edited.data.post.featured, true);
    assert.equal(edited.data.post.title, "Card Stuff Yes 1.0");

    const deleted = await request("/api/admin/news/" + id, { method: "DELETE" });
    assert.equal(deleted.response.status, 200);
    const afterDelete = await request("/api/news", {}, null);
    assert.equal(afterDelete.data.news.length, 0);
});

test("news validation rejects unsafe or malformed payloads", async () => {
    const { response } = await request("/api/admin/news", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "", summary: "", content: "x", published: "yes", featured: false })
    });
    assert.equal(response.status, 400);
});

test("admin can set a player's card quantity with catalog validation", async () => {
    const valid = await request("/api/admin/players/" + player.id + "/collection/spark", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: 4 })
    });
    assert.equal(valid.response.status, 200);
    assert.equal(valid.data.inventory.quantity, 4);

    const invalid = await request("/api/admin/players/" + player.id + "/collection/not-a-card", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: 4 })
    });
    assert.equal(invalid.response.status, 400);
});
