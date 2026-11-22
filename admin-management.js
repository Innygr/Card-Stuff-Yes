"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const database = require("./db");
const { adminFor, isAllowedOrigin } = require("./admin-logs");
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

async function readJson(req, maxBytes = 16384) {
    let body = "";
    for await (const chunk of req) {
        body += chunk.toString("utf8");
        if (Buffer.byteLength(body) > maxBytes) throw new Error("Request body is too large.");
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
         pathname.startsWith("/api/admin/news/") ||
         pathname === "/api/admin/cards" ||
         pathname === "/api/admin/community-servers" ||
         /^\/api\/admin\/community-servers\/[A-Za-z0-9._:-]{1,128}\/(approve|revoke|events)$/.test(pathname));
}

async function handleAdminManagement(req, res, url) {
    const route = url.pathname;
    if (!isAdminRoute(route)) return false;
    const admin = await adminFor(req);
    if (!admin || !["owner", "admin"].includes(admin.rank)) {
        send(res, 403, { error: "Owner or admin access required." });
        return true;
    }
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && !isAllowedOrigin(req)) {
        send(res, 403, { error: "Cross-origin request rejected." });
        return true;
    }
    if (["POST", "PUT", "PATCH"].includes(req.method) &&
        !["application/json", "application/json; charset=utf-8"].includes(
            String(req.headers["content-type"] || "").toLowerCase())) {
        send(res, 415, { error: "Content-Type must be application/json." });
        return true;
    }

    if (route === "/api/admin/cards" && req.method === "GET") {
        const result = await database.getPool().query(
            "SELECT version, cards, published_at, published_by FROM csy_private.card_catalogue_versions ORDER BY version DESC LIMIT 1"
        );
        send(res, 200, { version: result.rows[0]?.version || 0, cards: result.rows[0]?.cards || CARD_CATALOG,
            publishedAt: result.rows[0]?.published_at || null, publishedBy: result.rows[0]?.published_by || null });
        return true;
    }

    if (route === "/api/admin/cards" && req.method === "PUT") {
        if (admin.rank !== "owner") {
            send(res, 403, { error: "Only the owner can publish the card catalogue." });
            return true;
        }
        let body;
        try { body = await readJson(req); }
        catch (error) { send(res, 400, { error: error.message }); return true; }
        const cards = body && body.cards;
        const validTypes = new Set(["attack", "guard", "heal", "draw"]);
        const resourceKeys = new Set(["magik", "astralMagik", "gildedMagik", "bloodMagik", "darkMagik"]);
        const ids = new Set();
        const valid = Array.isArray(cards) && cards.length > 0 && cards.length <= 2000 &&
            cards.every(card => {
                if (!card || typeof card.id !== "string" || !/^[a-z0-9-]{1,80}$/.test(card.id) ||
                    ids.has(card.id) || typeof card.name !== "string" || !card.name.trim() ||
                    card.name.length > 120 || !validTypes.has(card.type) ||
                    !Number.isInteger(card.cost) || card.cost < 0 || card.cost > 99 ||
                    !Number.isInteger(card.value) || card.value < 0 || card.value > 99 ||
                    typeof card.symbol !== "string" || card.symbol.length > 12 ||
                    typeof card.description !== "string" || card.description.length > 1000 ||
                    typeof card.effect !== "string" || card.effect.length > 240) return false;
                ids.add(card.id);
                if (card.abilities !== undefined) {
                    if (!Array.isArray(card.abilities) || card.abilities.length > 20) return false;
                    for (const ability of card.abilities) {
                        if (!ability || typeof ability.name !== "string" || !ability.name.trim() ||
                            ability.name.length > 100 || !Array.isArray(ability.effects) ||
                            ability.effects.length > 30 || !ability.costs || typeof ability.costs !== "object") return false;
                        for (const [key, amount] of Object.entries(ability.costs)) {
                            if (!resourceKeys.has(key) || !Number.isInteger(amount) || amount < 0 || amount > 99) return false;
                        }
                        for (const effect of ability.effects) {
                            if (!effect || !["damage", "shield", "heal", "draw"].includes(effect.type) ||
                                !["self", "opponent"].includes(effect.target) ||
                                !Number.isInteger(effect.value) || effect.value < 1 || effect.value > 99) return false;
                        }
                    }
                }
                return true;
            });
        if (!valid) {
            send(res, 400, { error: "Catalogue is invalid. Check card IDs, battle fields, abilities, costs, and effects." });
            return true;
        }
        const client = await database.getPool().connect();
        try {
            await client.query("BEGIN");
            const previous = await client.query(
                "SELECT cards, version FROM csy_private.card_catalogue_versions ORDER BY version DESC LIMIT 1 FOR UPDATE"
            );
            const previousCards = previous.rows[0]?.cards || CARD_CATALOG;
            const previousIds = new Set(previousCards.map(card => card.id));
            if ([...previousIds].some(id => !ids.has(id))) {
                await client.query("ROLLBACK");
                send(res, 409, { error: "Publishing cannot remove existing card IDs; keep them for saved decks and active matches." });
                return true;
            }
            const version = Number(previous.rows[0]?.version || 0) + 1;
            await client.query(
                "INSERT INTO csy_private.card_catalogue_versions (version, cards, published_by) VALUES ($1, $2::jsonb, $3)",
                [version, JSON.stringify(cards), admin.username]
            );
            await client.query("COMMIT");
            send(res, 201, { published: true, version, count: cards.length });
        } catch (error) {
            try { await client.query("ROLLBACK"); } catch {}
            throw error;
        } finally { client.release(); }
        return true;
    }

    if (route === "/api/admin/players" && req.method === "GET") {
        const result = await database.getPool().query(`
            SELECT id, player_id, username, "rank" AS rank, email, email_verified_at, created_at
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
        const result = await database.getPool().query(
            "UPDATE csy_private.accounts SET \"rank\" = $1, updated_at = now() WHERE id = $2 RETURNING id, username, \"rank\" AS rank",
            [rank, rankMatch[1]]
        );
        if (!result.rowCount) { send(res, 404, { error: "Player not found." }); return true; }
        send(res, 200, { player: result.rows[0] });
        return true;
    }

    if (route === "/api/admin/community-servers" && req.method === "GET") {
        const result = await database.getPool().query(`
            SELECT s.server_id, s.owner_account_id, a.username AS owner_username,
                   s.endpoint, s.display_name, s.status, s.verified_at,
                   s.approved_at, s.approved_by, s.revoked_at, s.revoked_by,
                   s.revocation_reason, s.created_at, s.updated_at
            FROM csy_private.community_servers s
            LEFT JOIN csy_private.accounts a ON a.id = s.owner_account_id
            ORDER BY s.created_at DESC
            LIMIT 500
        `);
        send(res, 200, { servers: result.rows.map(row => ({
            serverId: row.server_id,
            ownerAccountId: row.owner_account_id,
            ownerUsername: row.owner_username,
            endpoint: row.endpoint,
            displayName: row.display_name,
            status: row.status,
            verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
            approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
            approvedBy: row.approved_by,
            revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
            revokedBy: row.revoked_by,
            revocationReason: row.revocation_reason,
            createdAt: new Date(row.created_at).toISOString(),
            updatedAt: new Date(row.updated_at).toISOString()
        })) });
        return true;
    }

    const communityEventsMatch = route.match(/^\/api\/admin\/community-servers\/([A-Za-z0-9._:-]{1,128})\/events$/);
    if (communityEventsMatch && req.method === "GET") {
        const result = await database.getPool().query(`
            SELECT event_id, server_id, actor, action, reason, created_at
            FROM csy_private.community_server_moderation_events
            WHERE server_id = $1
            ORDER BY created_at DESC, event_id DESC
            LIMIT 100
        `, [communityEventsMatch[1]]);
        send(res, 200, { events: result.rows.map(row => ({
            eventId: row.event_id,
            serverId: row.server_id,
            actor: row.actor,
            action: row.action,
            reason: row.reason,
            createdAt: new Date(row.created_at).toISOString()
        })) });
        return true;
    }

    const communityModerationMatch = route.match(/^\/api\/admin\/community-servers\/([A-Za-z0-9._:-]{1,128})\/(approve|revoke)$/);
    if (communityModerationMatch && req.method === "PATCH") {
        let body;
        try { body = await readJson(req); }
        catch (error) { send(res, 400, { error: error.message }); return true; }
        const [serverId, action] = communityModerationMatch.slice(1);
        if (action === "approve") {
            if (Object.keys(body || {}).length) {
                send(res, 400, { error: "Approval does not accept a request body." });
                return true;
            }
            const result = await database.getPool().query(`
                WITH changed AS (
                    UPDATE csy_private.community_servers
                    SET status = 'approved', approved_at = now(), approved_by = $2, updated_at = now()
                    WHERE server_id = $1 AND status = 'pending' AND verified_at IS NOT NULL
                    RETURNING server_id
                )
                INSERT INTO csy_private.community_server_moderation_events
                    (server_id, actor, action, reason)
                SELECT server_id, $2, 'approved', ''
                FROM changed
                RETURNING server_id
            `, [serverId, admin.username]);
            if (!result.rowCount) {
                send(res, 409, { error: "Only a verified pending server can be approved." });
                return true;
            }
            send(res, 200, { serverId, status: "approved" });
            return true;
        }
        if (!body || typeof body !== "object" || Array.isArray(body) ||
            Object.keys(body).some(key => key !== "reason") ||
            (body.reason !== undefined && !validText(body.reason, 240))) {
            send(res, 400, { error: "Revocation reason must be a string of at most 240 characters." });
            return true;
        }
        const result = await database.getPool().query(`
            WITH changed AS (
                UPDATE csy_private.community_servers
                SET status = 'revoked', revoked_at = now(), revoked_by = $2,
                    revocation_reason = $3, updated_at = now()
                WHERE server_id = $1 AND status <> 'revoked'
                RETURNING server_id
            )
            INSERT INTO csy_private.community_server_moderation_events
                (server_id, actor, action, reason)
            SELECT server_id, $2, 'revoked', $3
            FROM changed
            RETURNING server_id
        `, [serverId, admin.username, (body.reason || "").trim()]);
        if (!result.rowCount) {
            send(res, 404, { error: "Community server not found or already revoked." });
            return true;
        }
        send(res, 200, { serverId, status: "revoked" });
        return true;
    }

    if (route === "/api/admin/news" && req.method === "GET") {
        const result = await database.getPool().query(
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
        const result = await database.getPool().query(`
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
        const result = await database.getPool().query(`
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
        const result = await database.getPool().query(
            "DELETE FROM csy_private.news_posts WHERE id = $1 RETURNING id",
            [newsMatch[1]]
        );
        if (!result.rowCount) { send(res, 404, { error: "News post not found." }); return true; }
        send(res, 200, { deleted: true, id: newsMatch[1] });
        return true;
    }

    if (route.startsWith("/api/admin/players/") && route.includes("/packs/") && req.method === "PUT") {
        if (admin.rank !== "owner" && admin.rank !== "admin") { send(res, 403, { error: "Admin access required." }); return true; }
        const match = route.match(/^\/api\/admin\/players\/([A-Za-z0-9_-]+)\/packs\/([a-z0-9-]+)$/);
        const packIds = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, "card-packs.json"), "utf8")).packs.map(pack => pack.id));
        if (!match || !packIds.has(match[2])) { send(res, 400, { error: "Invalid player or pack ID." }); return true; }
        let body;
        try { body = await readJson(req); } catch (error) { send(res, 400, { error: error.message }); return true; }
        if (!Number.isInteger(body.quantity) || body.quantity < 0 || body.quantity > 999) { send(res, 400, { error: "Quantity must be an integer from 0 to 999." }); return true; }
        const result = await database.getPool().query(
            "INSERT INTO csy_private.account_pack_inventory (account_id, pack_id, quantity) SELECT id, $2, $3 FROM csy_private.accounts WHERE id = $1 ON CONFLICT (account_id, pack_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now() RETURNING account_id, pack_id, quantity",
            [match[1], match[2], body.quantity]
        );
        if (!result.rowCount) { send(res, 404, { error: "Player not found." }); return true; }
        send(res, 200, { inventory: result.rows[0] }); return true;
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
        const result = await database.getPool().query(
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
    const result = await database.getPool().query(`
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
    const route = url.pathname;
    if (!["/api/account/collection", "/api/account/packs", "/api/account/packs/open"].includes(route)) return false;
    if (!postgresAccountStorageEnabled()) { send(res, 503, { error: "Card systems require PostgreSQL account storage." }); return true; }
    const accountSession = await accountForSession(req);
    if (!accountSession) { send(res, 401, { error: "Sign in to manage your cards and packs." }); return true; }
    if (route === "/api/account/collection") {
        if (req.method !== "GET") { send(res, 405, { error: "Method not allowed." }, { Allow: "GET" }); return true; }
        const result = await database.getPool().query("SELECT card_id, quantity FROM csy_private.account_card_inventory WHERE account_id = $1 ORDER BY card_id", [accountSession.account.id]);
        const owned = new Map(result.rows.map(row => [row.card_id, row.quantity]));
        const cards = CARD_CATALOG.map(card => ({ ...card, quantity: owned.get(card.id) || 0 }));
        send(res, 200, { cards, count: cards.length, ownedCount: cards.filter(card => card.quantity > 0).length });
        return true;
    }
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, "card-packs.json"), "utf8"));
    if (route === "/api/account/packs") {
        if (req.method !== "GET") { send(res, 405, { error: "Method not allowed." }, { Allow: "GET" }); return true; }
        const result = await database.getPool().query("SELECT pack_id, quantity FROM csy_private.account_pack_inventory WHERE account_id = $1", [accountSession.account.id]);
        const owned = new Map(result.rows.map(row => [row.pack_id, row.quantity]));
        send(res, 200, { packs: config.packs.map(p => ({ id: p.id, name: p.name, description: p.description, cardsPerOpen: p.cardsPerOpen, quantity: owned.get(p.id) || 0 })) });
        return true;
    }
    if (req.method !== "POST") { send(res, 405, { error: "Method not allowed." }, { Allow: "POST" }); return true; }
    if (!isAllowedOrigin(req)) { send(res, 403, { error: "Cross-origin request rejected." }); return true; }
    let body;
    try { body = await readJson(req); } catch (error) { send(res, 400, { error: error.message }); return true; }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(k => !["packId", "requestId"].includes(k)) ||
        typeof body.packId !== "string" || typeof body.requestId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) {
        send(res, 400, { error: "Provide a valid packId and UUID requestId." }); return true;
    }
    const pack = config.packs.find(p => p.id === body.packId);
    if (!pack || !Array.isArray(pack.poolCardIds) || pack.poolCardIds.length < pack.cardsPerOpen || !pack.poolCardIds.every(id => CARD_IDS.has(id))) {
        send(res, 400, { error: "That pack is not configured correctly." }); return true;
    }
    const client = await database.getPool().connect();
    try {
        await client.query("BEGIN");
        await client.query("SELECT id FROM csy_private.accounts WHERE id = $1 FOR UPDATE", [accountSession.account.id]);
        const prior = await client.query("SELECT pack_id, cards FROM csy_private.pack_openings WHERE account_id = $1 AND request_id = $2", [accountSession.account.id, body.requestId]);
        if (prior.rowCount) {
            if (prior.rows[0].pack_id !== pack.id) { await client.query("ROLLBACK"); send(res, 409, { error: "Request ID already used for another pack." }); return true; }
            await client.query("COMMIT");
            send(res, 200, { packId: pack.id, cards: prior.rows[0].cards, replayed: true }); return true;
        }
        const spent = await client.query("UPDATE csy_private.account_pack_inventory SET quantity = quantity - 1, updated_at = now() WHERE account_id = $1 AND pack_id = $2 AND quantity > 0 RETURNING quantity", [accountSession.account.id, pack.id]);
        if (!spent.rowCount) { await client.query("ROLLBACK"); send(res, 409, { error: "You do not own an unopened copy of this pack." }); return true; }
        const pool = pack.poolCardIds.slice();
        for (let i = pool.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
        const drawn = pool.slice(0, pack.cardsPerOpen).map(id => CARD_CATALOG.find(card => card.id === id));
        for (const card of drawn) await client.query(
            "INSERT INTO csy_private.account_card_inventory (account_id, card_id, quantity) VALUES ($1, $2, 1) ON CONFLICT (account_id, card_id) DO UPDATE SET quantity = LEAST(999, csy_private.account_card_inventory.quantity + 1), updated_at = now()",
            [accountSession.account.id, card.id]);
        const resultCards = drawn.map(card => ({ id: card.id, name: card.name, symbol: card.symbol || "✦", description: card.description || "", rarity: card.rarity || "common", resource: card.resource || "astral-magik" }));
        await client.query("INSERT INTO csy_private.pack_openings (account_id, request_id, pack_id, cards) VALUES ($1, $2, $3, $4::jsonb)", [accountSession.account.id, body.requestId, pack.id, JSON.stringify(resultCards)]);
        await client.query("COMMIT");
        send(res, 200, { packId: pack.id, cards: resultCards, remaining: spent.rows[0].quantity, replayed: false });
    } catch (error) { try { await client.query("ROLLBACK"); } catch {} throw error; }
    finally { client.release(); }
    return true;
}

module.exports = { handleAdminManagement, handlePublicNews, handleAccountCollection };
