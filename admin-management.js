"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { getPool } = require("./db");
const { adminFor } = require("./admin-logs");
const { accountForSession, postgresAccountStorageEnabled } = require("./postgres-account-auth");

const CARD_CATALOG = JSON.parse(fs.readFileSync(path.join(__dirname, "cards.json"), "utf8"));
const CARD_IDS = new Set(CARD_CATALOG.map(card => card.id));

function send(res, status, data, headers = {}) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...headers
    });
    res.end(JSON.stringify(data));
}

async function readJson(req) {
    let body = "";
    for await (const chunk of req) {
        body += chunk.toString("utf8");
        if (Buffer.byteLength(body) > 16384) throw new Error("Request body is too large.");
    }
    try { return body.trim() ? JSON.parse(body) : {}; }
    catch { throw new Error("Request body must be valid JSON."); }
}

function validText(value, max, allowEmpty = true) {
    return typeof value === "string" && value.length <= max &&
        (allowEmpty || value.trim().length > 0) &&
        !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}

function isAdminRoute(pathname) {
    return pathname.startsWith("/api/admin/") &&
        (pathname === "/api/admin/players" ||
         pathname.startsWith("/api/admin/players/") ||
         pathname === "/api/admin/news" ||
         pathname.startsWith("/api/admin/news/"));
}

async function handleAdminManagement(req, res, url) {
    const route = url.pathname;
    if (!isAdminRoute(route)) return false;
    const admin = adminFor(req);
    if (!admin || !["owner", "admin"].includes(admin.rank)) {
        send(res, 403, { error: "Owner or admin access required." });
        return true;
    }
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
        !["application/json", "application/json; charset=utf-8"].includes(
            String(req.headers["content-type"] || "").toLowerCase())) {
        send(res, 415, { error: "Content-Type must be application/json." });
        return true;
    }

    if (route === "/api/admin/players" && req.method === "GET") {
        const result = await getPool().query(`
            SELECT id, player_id, username, rank, email, email_verified_at, created_at
            FROM csy_private.accounts
            ORDER BY created_at DESC
            LIMIT 500
        `);
        send(res, 200, { players: result.rows.map(row => ({
            id: row.id, playerId: row.player_id, username: row.username, rank: row.rank,
            email: row.email, emailVerified: Boolean(row.email_verified_at),
            createdAt: new Date(row.created_at).toISOString()
        })) });
        return true;
    }

    const rankMatch = route.match(/^\/api\/admin\/players\/([A-Za-z0-9_-]+)\/rank$/);
    if (rankMatch && req.method === "PATCH") {
        if (admin.rank !== "owner") {
            send(res, 403, { error: "Only the owner can change player roles." });
            return true;
        }
        let body;
        try { body = await readJson(req); }
        catch (error) { send(res, 400, { error: error.message }); return true; }
        const rank = body.rank;
        if (!["player", "mod", "admin"].includes(rank)) {
            send(res, 400, { error: "Rank must be player, mod, or admin. Owner status cannot be assigned through this API." });
            return true;
        }
        const result = await getPool().query(
            "UPDATE csy_private.accounts SET rank = $1, updated_at = now() WHERE id = $2 RETURNING id, username, rank",
            [rank, rankMatch[1]]
        );
        if (!result.rowCount) { send(res, 404, { error: "Player not found." }); return true; }
        send(res, 200, { player: result.rows[0] });
        return true;
    }

    if (route === "/api/admin/news" && req.method === "GET") {
        const result = await getPool().query(
            "SELECT id, title, summary, content, published, featured, created_at, updated_at, published_at FROM csy_private.news_posts ORDER BY featured DESC, updated_at DESC LIMIT 200"
        );
        send(res, 200, { news: result.rows });
        return true;
    }

    if (route === "/api/admin/news" && req.method === "POST") {
        let body;
        try { body = await readJson(req); }
        catch (error) { send(res, 400, { error: error.message }); return true; }
        if (!validText(body.title, 120, false) || !validText(body.summary, 300) ||
            !validText(body.content, 10000, false) ||
            typeof body.published !== "boolean" || typeof body.featured !== "boolean") {
            send(res, 400, { error: "Provide a title (1–120 chars), summary (up to 300), content (1–10000), and boolean published/featured fields." });
            return true;
        }
        const id = crypto.randomUUID();
        const result = await getPool().query(`
            INSERT INTO csy_private.news_posts
                (id, title, summary, content, published, featured, created_by, published_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $5 THEN now() ELSE NULL END)
            RETURNING *
        `, [id, body.title.trim(), body.summary.trim(), body.content, body.published, body.featured, admin.username]);
        send(res, 201, { post: result.rows[0] });
        return true;
    }

    const newsMatch = route.match(/^\/api\/admin\/news\/([0-9a-f-]{36})$/i);
    if (newsMatch && req.method === "PATCH") {
        let body;
        try { body = await readJson(req); }
        catch (error) { send(res, 400, { error: error.message }); return true; }
        const allowed = ["title", "summary", "content", "published", "featured"];
        if (!body || typeof body !== "object" || Array.isArray(body) ||
            Object.keys(body).length === 0 || Object.keys(body).some(key => !allowed.includes(key)) ||
            (body.title !== undefined && !validText(body.title, 120, false)) ||
            (body.summary !== undefined && !validText(body.summary, 300)) ||
            (body.content !== undefined && !validText(body.content, 10000, false)) ||
            (body.published !== undefined && typeof body.published !== "boolean") ||
            (body.featured !== undefined && typeof body.featured !== "boolean")) {
            send(res, 400, { error: "Invalid news update." });
            return true;
        }
        const result = await getPool().query(`
            UPDATE csy_private.news_posts SET
                title = COALESCE($2, title),
                summary = COALESCE($3, summary),
                content = COALESCE($4, content),
                published = COALESCE($5, published),
                featured = COALESCE($6, featured),
                published_at = CASE
                    WHEN $5 = true AND published_at IS NULL THEN now()
                    WHEN $5 = false THEN NULL
                    ELSE published_at END,
                updated_at = now()
            WHERE id = $1 RETURNING *
        `, [newsMatch[1], body.title?.trim() ?? null, body.summary?.trim() ?? null,
            body.content ?? null, body.published ?? null, body.featured ?? null]);
        if (!result.rowCount) { send(res, 404, { error: "News post not found." }); return true; }
        send(res, 200, { post: result.rows[0] });
        return true;
    }
    if (newsMatch && req.method === "DELETE") {
        const result = await getPool().query(
            "DELETE FROM csy_private.news_posts WHERE id = $1 RETURNING id",
            [newsMatch[1]]
        );
        if (!result.rowCount) { send(res, 404, { error: "News post not found." }); return true; }
        send(res, 200, { deleted: true, id: newsMatch[1] });
        return true;
    }

    if (route.startsWith("/api/admin/players/") && route.includes("/collection/") && req.method === "PUT") {
        if (admin.rank !== "owner" && admin.rank !== "admin") {
            send(res, 403, { error: "Admin access required." });
            return true;
        }
        const match = route.match(/^\/api\/admin\/players\/([A-Za-z0-9_-]+)\/collection\/([a-z0-9-]+)$/);
        if (!match || !CARD_IDS.has(match[2])) { send(res, 400, { error: "Invalid player or card ID." }); return true; }
        let body;
        try { body = await readJson(req); }
        catch (error) { send(res, 400, { error: error.message }); return true; }
        if (!Number.isInteger(body.quantity) || body.quantity < 0 || body.quantity > 999) {
            send(res, 400, { error: "Quantity must be an integer from 0 to 999." }); return true;
        }
        const result = await getPool().query(
            "INSERT INTO csy_private.account_card_inventory (account_id, card_id, quantity) SELECT id, $2, $3 FROM csy_private.accounts WHERE id = $1 ON CONFLICT (account_id, card_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now() RETURNING account_id, card_id, quantity",
            [match[1], match[2], body.quantity]
        );
        if (!result.rowCount) { send(res, 404, { error: "Player not found." }); return true; }
        send(res, 200, { inventory: result.rows[0] });
        return true;
    }

    send(res, 405, { error: "Method not allowed." }, { Allow: "GET, POST, PATCH, PUT, DELETE" });
    return true;
}

async function handlePublicNews(req, res, url) {
    if (url.pathname !== "/api/news") return false;
    if (req.method !== "GET") {
        send(res, 405, { error: "Method not allowed." }, { Allow: "GET" });
        return true;
    }
    const result = await getPool().query(`
        SELECT id, title, summary, content, featured, published_at
        FROM csy_private.news_posts
        WHERE published = true
        ORDER BY featured DESC, published_at DESC
        LIMIT 100
    `);
    send(res, 200, { news: result.rows });
    return true;
}

async function handleAccountCollection(req, res, url) {
    if (url.pathname !== "/api/account/collection") return false;
    if (!postgresAccountStorageEnabled()) {
        send(res, 503, { error: "Card collection requires PostgreSQL account storage." });
        return true;
    }
    if (req.method !== "GET") {
        send(res, 405, { error: "Method not allowed." }, { Allow: "GET" });
        return true;
    }
    const accountSession = await accountForSession(req);
    if (!accountSession) {
        send(res, 401, { error: "Sign in to view your card collection." });
        return true;
    }
    const result = await getPool().query(
        "SELECT card_id, quantity, updated_at FROM csy_private.account_card_inventory WHERE account_id = $1 ORDER BY card_id",
        [accountSession.account.id]
    );
    const owned = new Map(result.rows.map(row => [row.card_id, row]));
    const cards = CARD_CATALOG.map(card => ({
        ...card,
        quantity: owned.has(card.id) ? owned.get(card.id).quantity : 0
    }));
    send(res, 200, { cards, count: cards.length, ownedCount: cards.filter(card => card.quantity > 0).length });
    return true;
}

module.exports = { handleAdminManagement, handlePublicNews, handleAccountCollection };
