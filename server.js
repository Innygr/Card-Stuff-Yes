"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { handleAdminLogs, serveAdminPage } = require("./admin-logs");
const { handleAccountAuth } = require("./account-auth");
const { handlePostgresAccountAuth, postgresAccountStorageEnabled } = require("./postgres-account-auth");
const { handleEmailAccountRoutes } = require("./email-account");
const { handleAdminManagement, handlePublicNews, handleAccountCollection } = require("./admin-management");

const ROOT = __dirname;
let config = { host: "127.0.0.1", port: 6565 };
try {
    config = { ...config, ...JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8")) };
} catch {
    console.warn("Using default host and port.");
}
const HOST = process.env.HOST || config.host || "127.0.0.1";
const PORT = Number(process.env.PORT || config.port || 6565);
const ALLOWED_ORIGINS = new Set(
    String(process.env.CSY_ALLOWED_ORIGINS || "")
        .split(",")
        .map(origin => origin.trim())
        .filter(Boolean)
);
const COOKIE_SAMESITE = ["Strict", "Lax", "None"].includes(process.env.CSY_COOKIE_SAMESITE)
    ? process.env.CSY_COOKIE_SAMESITE
    : "Lax";
const MAX_HEALTH = 30;
const MAX_ENERGY = 6;
const MAX_HAND = 10;
const COOKIE = "csyPlayerId";
const MATCH_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_GUEST_PLAYERS = 10000;
const MAX_MATCHES = 5000;
const players = new Map();
const matches = new Map();

// Match/player state survives server restarts. Keep the snapshot outside the
// public site tree and replace it atomically so a crash cannot leave half JSON.
const STATE_FILE = path.resolve(
    process.env.CSY_STATE_FILE || path.join(ROOT, "private-data", "multiplayer-state.json")
);
const ACCOUNT_FILE = path.resolve(
    process.env.CSY_ACCOUNT_FILE || path.join(ROOT, "private-data", "accounts.json")
);

function saveState() {
    const snapshot = JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        players: [...players.values()],
        matches: [...matches.values()]
    });

    const temporaryFile = STATE_FILE + ".tmp";
    try {
        fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true, mode: 0o700 });
        fs.writeFileSync(temporaryFile, snapshot, { encoding: "utf8", mode: 0o600 });
        fs.renameSync(temporaryFile, STATE_FILE);
    } catch (error) {
        console.error("Could not persist multiplayer state:", error.message);
        try { fs.rmSync(temporaryFile, { force: true }); } catch {}
    }
}

function loadState() {
    let snapshot;
    try {
        snapshot = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    } catch (error) {
        if (error.code !== "ENOENT") {
            console.error("Could not load multiplayer state:", error.message);
        }
        return;
    }

    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.players) || !Array.isArray(snapshot.matches)) {
        console.error("Ignoring invalid multiplayer state snapshot.");
        return;
    }

    for (const player of snapshot.players) {
        if (player && typeof player.id === "string" && typeof player.name === "string") {
            players.set(player.id, { id: player.id, name: cleanName(player.name) || "Guest" });
        }
    }

    for (const match of snapshot.matches) {
        if (!match || typeof match.id !== "string" ||
            !["waiting", "active", "finished"].includes(match.status) ||
            !Array.isArray(match.players) || match.players.length !== 2 ||
            !Array.isArray(match.log)) {
            continue;
        }

        // Waiting matches intentionally have one empty player slot. Active and
        // finished matches must contain both combatants.
        const [first, second] = match.players;
        const statusShapeValid =
            (match.status === "waiting" && first && second === null) ||
            ((match.status === "active" || match.status === "finished") && first && second);
        if (!statusShapeValid) continue;

        const combatants = match.players.filter(Boolean);
        const playerIds = combatants.map(item => item.playerId);
        if (new Set(playerIds).size !== playerIds.length) continue;

        const combatantsValid = combatants.length === (match.status === "waiting" ? 1 : 2) &&
            combatants.every(item => {
                if (!item || typeof item.playerId !== "string" || !players.has(item.playerId) ||
                    !Array.isArray(item.deck) || !Array.isArray(item.hand) || !Array.isArray(item.discard)) {
                    return false;
                }
                const cards = [...item.deck, ...item.hand, ...item.discard];
                return cards.every(card =>
                    card && typeof card.instanceId === "string" && CARD_BY_ID.has(card.cardId)
                );
            });
        if (!combatantsValid) continue;

        if (match.status === "active" && !playerIds.includes(match.activePlayerId)) continue;
        if (match.status !== "active" && match.activePlayerId !== null) continue;

        // A card instance can occupy only one zone across the whole match.
        const instanceIds = combatants
            .flatMap(item => [...item.deck, ...item.hand, ...item.discard])
            .map(card => card.instanceId);
        if (new Set(instanceIds).size !== instanceIds.length) continue;

        const timestampsValid = [match.createdAt, match.updatedAt].every(value =>
            typeof value === "string" && Number.isFinite(Date.parse(value))
        );
        if (!timestampsValid) continue;

        matches.set(match.id, match);
    }

    // Expire old matches before the server accepts requests. Also rewrite the
    // snapshot if validation rejected any entries, so corrupt records do not
    // linger on disk and get reconsidered at every restart.
    const expiredChanged = pruneExpiredMatches();
    if (expiredChanged || players.size !== snapshot.players.length || matches.size !== snapshot.matches.length) saveState();
}

function pruneExpiredMatches(now = Date.now()) {
    const cutoff = now - MATCH_TTL_MS;
    let changed = false;
    for (const [id, match] of matches) {
        const updatedAt = Date.parse(match.updatedAt || match.createdAt || "");
        if (!Number.isFinite(updatedAt) || updatedAt < cutoff) {
            matches.delete(id);
            changed = true;
        }
    }
    return changed;
}

let CARDS;
try {
    const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "cards.json"), "utf8"));
    const validTypes = new Set(["attack", "guard", "heal", "draw"]);
    if (!Array.isArray(catalog) || catalog.length === 0) throw new Error("cards.json must contain at least one card.");
    const ids = new Set();
    for (const card of catalog) {
        if (!card || typeof card.id !== "string" || !/^[a-z0-9-]+$/.test(card.id) ||
            ids.has(card.id) || typeof card.name !== "string" ||
            !validTypes.has(card.type) || !Number.isInteger(card.cost) || card.cost < 0 ||
            !Number.isInteger(card.value) || card.value < 0 ||
            typeof card.symbol !== "string" || typeof card.description !== "string" ||
            typeof card.effect !== "string") {
            throw new Error("Invalid or duplicate card definition in cards.json.");
        }
        ids.add(card.id);
    }
    CARDS = catalog;
} catch (error) {
    console.error("Card catalog could not be loaded:", error.message);
    process.exit(1);
}
const CARD_BY_ID = new Map(CARDS.map(card => [card.id, card]));

// Load only after card definitions exist, so saved card instances can be checked.
loadState();

function sendJson(res, status, data, headers = {}) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers });
    res.end(JSON.stringify(data));
}

function applyCors(req, res) {
    const origin = req.headers.origin;
    if (!origin) return true;

    // Same-origin requests do not need CORS headers.
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    const requestProtocol = req.socket.encrypted || forwardedProto === "https" ? "https:" : "http:";
    try {
        const parsedOrigin = new URL(origin);
        if (parsedOrigin.origin === requestProtocol + "//" + req.headers.host) return true;
    } catch {
        return false;
    }

    if (!ALLOWED_ORIGINS.has(origin)) return false;
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Max-Age", "600");
    res.setHeader("Vary", "Origin");
    return true;
}

function readJson(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        let size = 0;
        let failed = false;

        req.on("data", chunk => {
            if (failed) return;
            size += chunk.length;
            if (size > 16384) {
                failed = true;
                reject(new Error("Request body is too large."));
                // Keep consuming the request so the server can return a 400
                // response instead of destroying the socket mid-response.
                return;
            }
            body += chunk.toString("utf8");
        });

        req.on("end", () => {
            if (failed) return;
            if (!body.trim()) return resolve({});
            try { resolve(JSON.parse(body)); } catch { reject(new Error("Request body must be valid JSON.")); }
        });

        req.on("error", error => {
            if (!failed) reject(error);
        });
    });
}

function cookieMap(header) {
    const output = {};
    for (const part of String(header || "").split(";")) {
        const index = part.indexOf("=");
        if (index < 0) continue;
        try { output[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim()); } catch { output[part.slice(0, index).trim()] = ""; }
    }
    return output;
}

function pruneUnreferencedPlayers() {
    const activePlayerIds = new Set();
    for (const match of matches.values()) {
        if (match.status !== "finished") {
            for (const combatant of match.players) {
                if (combatant) activePlayerIds.add(combatant.playerId);
            }
        }
    }
    let changed = false;
    for (const id of players.keys()) {
        if (!activePlayerIds.has(id)) {
            players.delete(id);
            changed = true;
        }
    }
    return changed;
}

function getPlayer(req, res) {
    const cookies = cookieMap(req.headers.cookie);
    let id = cookies[COOKIE];
    let player = id && players.get(id);
    if (!id || !player) {
        if (pruneExpiredMatches()) saveState();
        if (players.size >= MAX_GUEST_PLAYERS && pruneUnreferencedPlayers()) saveState();
        if (players.size >= MAX_GUEST_PLAYERS) return null;
        id = crypto.randomBytes(24).toString("hex");
        player = { id, name: "Guest-" + id.slice(0, 4).toUpperCase() };
        players.set(id, player);
        saveState();
        const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
        const secure = req.socket.encrypted || proto === "https" || COOKIE_SAMESITE === "None" ? "; Secure" : "";
        res.setHeader("Set-Cookie", COOKIE + "=" + id + "; HttpOnly; SameSite=" + COOKIE_SAMESITE + "; Path=/; Max-Age=2592000" + secure);
    }
    return player;
}

function cleanName(value) {
    return typeof value === "string" ? value.replace(/[<>\u0000-\u001f\u007f]/g, "").trim().replace(/\s+/g, " ").slice(0, 20) : "";
}

function shuffle(items) {
    for (let i = items.length - 1; i > 0; i -= 1) {
        const j = crypto.randomInt(i + 1);
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}

function newDeck() {
    const deck = [];
    for (const card of CARDS) for (let i = 0; i < 4; i += 1) deck.push({ instanceId: crypto.randomUUID(), cardId: card.id });
    return shuffle(deck);
}

function newCombatant(player) {
    return { playerId: player.id, name: player.name, health: MAX_HEALTH, shield: 0, energy: 0, maxEnergy: 0, magik: 1, turnCount: 0, deck: newDeck(), hand: [], discard: [] };
}

function draw(combatant, count) {
    let amount = 0;
    for (let i = 0; i < count && combatant.hand.length < MAX_HAND; i += 1) {
        if (!combatant.deck.length) {
            if (!combatant.discard.length) break;
            combatant.deck = shuffle(combatant.discard);
            combatant.discard = [];
        }
        combatant.hand.push(combatant.deck.pop());
        amount += 1;
    }
    return amount;
}

function log(match, message) {
    match.log.unshift({ id: crypto.randomUUID(), message, at: new Date().toISOString() });
    match.log = match.log.slice(0, 40);
}

function startTurn(match, combatant, drawOne) {
    match.activePlayerId = combatant.playerId;
    combatant.turnCount += 1;
    combatant.shield = 0;
    combatant.maxEnergy = Math.min(MAX_ENERGY, combatant.turnCount);
    combatant.energy = combatant.maxEnergy;
    combatant.magik = 1;
    if (drawOne) log(match, combatant.name + (draw(combatant, 1) ? " draws a card." : " has no cards left to draw."));
}

function combatantFor(match, playerId) {
    return match.players.find(item => item && item.playerId === playerId) || null;
}

function findMatch(id, playerId) {
    const match = matches.get(id);
    if (!match) return { error: "Match not found.", status: 404 };
    if (!match.players.some(item => item && item.playerId === playerId)) return { error: "You are not a player in this match.", status: 403 };
    return { match };
}

function damage(target, amount) {
    const blocked = Math.min(target.shield, amount);
    target.shield -= blocked;
    const healthDamage = amount - blocked;
    target.health = Math.max(0, target.health - healthDamage);
    return { blocked, healthDamage };
}

function finish(match) {
    if (match.status !== "active" || match.players.every(item => item.health > 0)) return false;
    match.status = "finished";
    match.activePlayerId = null;
    if (match.players.every(item => item.health <= 0)) {
        match.result = "draw";
        log(match, "Both challengers fall. The match is a draw.");
    } else {
        const winner = match.players.find(item => item.health > 0);
        match.result = winner.playerId;
        log(match, winner.name + " wins the match!");
    }
    match.updatedAt = new Date().toISOString();
    return true;
}

function publicPlayer(item) {
    return { playerId: item.playerId, name: item.name, health: item.health, shield: item.shield, energy: item.energy, maxEnergy: item.maxEnergy, magik: item.magik, deckCount: item.deck.length, handCount: item.hand.length, discardCount: item.discard.length };
}

function view(match, viewerId) {
    const own = combatantFor(match, viewerId);
    const opponent = match.players.find(item => item && item.playerId !== viewerId) || null;
    return {
        id: match.id, status: match.status, createdAt: match.createdAt, updatedAt: match.updatedAt,
        activePlayerId: match.activePlayerId, turn: match.turn, result: match.result,
        you: publicPlayer(own),
        yourHand: own.hand.map(item => ({ instanceId: item.instanceId, ...CARD_BY_ID.get(item.cardId) })),
        opponent: opponent ? publicPlayer(opponent) : null,
        players: match.players.filter(Boolean).map(item => ({ playerId: item.playerId, name: item.name })),
        log: match.log.slice(0, 20)
    };
}

function playCard(match, own, opponent, instanceId) {
    const index = own.hand.findIndex(item => item.instanceId === instanceId);
    if (index < 0) return "That card is not in your hand.";
    const instance = own.hand[index];
    const card = CARD_BY_ID.get(instance.cardId);
    if (!card) return "Unknown card.";
    if (own.energy < card.cost) return "Not enough Astral Magik for that card.";
    own.energy -= card.cost;
    own.hand.splice(index, 1);
    own.discard.push(instance);
    if (card.type === "attack") {
        const hit = damage(opponent, card.value);
        let message = own.name + " plays " + card.name + " for " + hit.healthDamage + " health damage";
        if (hit.blocked) message += " (" + hit.blocked + " blocked)";
        log(match, message + ".");
        if (card.selfDamage) log(match, own.name + " loses " + damage(own, card.selfDamage).healthDamage + " health to Blood Price.");
        if (card.selfShield) { own.shield += card.selfShield; log(match, own.name + " gains " + card.selfShield + " shield."); }
    } else if (card.type === "guard") {
        own.shield += card.value;
        log(match, own.name + " plays " + card.name + " and gains " + card.value + " shield.");
    } else if (card.type === "heal") {
        const before = own.health;
        own.health = Math.min(MAX_HEALTH, own.health + card.value);
        log(match, own.name + " plays " + card.name + " and restores " + (own.health - before) + " health.");
    } else if (card.type === "draw") {
        log(match, own.name + " plays " + card.name + " and draws " + draw(own, card.value) + " card(s).");
    }
    match.updatedAt = new Date().toISOString();
    finish(match);
    return null;
}

async function handleApi(req, res, url, player) {
    const p = url.pathname.split("/").filter(Boolean);
    if (url.pathname === "/api/multiplayer/me" && req.method === "GET") {
        sendJson(res, 200, { player: { id: player.id, name: player.name } }); return;
    }
    if (url.pathname === "/api/multiplayer/current" && req.method === "GET") {
        const match = [...matches.values()]
            .filter(item => item.status !== "finished" && item.players.some(combatant => combatant && combatant.playerId === player.id))
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];

        sendJson(res, 200, { match: match ? view(match, player.id) : null });
        return;
    }
    if (url.pathname === "/api/multiplayer/name" && req.method === "POST") {
        let body;
        try { body = await readJson(req); } catch (error) { sendJson(res, 400, { error: error.message }); return; }
        const name = cleanName(body.name);
        if (name.length < 2) { sendJson(res, 400, { error: "Choose a name with at least 2 characters." }); return; }
        player.name = name;
        for (const match of matches.values()) {
            const own = combatantFor(match, player.id);
            if (own) { own.name = name; match.updatedAt = new Date().toISOString(); }
        }
        saveState();
        sendJson(res, 200, { player: { id: player.id, name } }); return;
    }
    if (url.pathname === "/api/multiplayer/matches" && req.method === "GET") {
        const open = [...matches.values()].filter(match => match.status === "waiting" && match.players[0].playerId !== player.id).map(match => ({ id: match.id, hostName: match.players[0].name, createdAt: match.createdAt })).slice(-50).reverse();
        sendJson(res, 200, { matches: open }); return;
    }
    if (url.pathname === "/api/multiplayer/matches" && req.method === "POST") {
        if (pruneExpiredMatches()) saveState();
        if (matches.size >= MAX_MATCHES) {
            sendJson(res, 503, { error: "The match service is at capacity. Please try again later." }); return;
        }
        if ([...matches.values()].some(match => match.status !== "finished" && match.players.some(item => item && item.playerId === player.id))) {
            sendJson(res, 409, { error: "Finish or leave your current match before creating another." }); return;
        }
        const match = { id: crypto.randomBytes(6).toString("hex").toUpperCase(), status: "waiting", players: [newCombatant(player), null], activePlayerId: null, turn: 1, result: null, log: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        matches.set(match.id, match);
        log(match, player.name + " created a match. Waiting for another player.");
        saveState();
        sendJson(res, 201, { match: view(match, player.id) }); return;
    }
    if (p[0] === "api" && p[1] === "multiplayer" && p[2] === "matches" && p[3] && p.length === 4 && req.method === "GET") {
        const found = findMatch(p[3].toUpperCase(), player.id);
        if (found.error) { sendJson(res, found.status, { error: found.error }); return; }
        sendJson(res, 200, { match: view(found.match, player.id) }); return;
    }
    if (p[0] === "api" && p[1] === "multiplayer" && p[2] === "matches" && p[3] && p[4] === "join" && req.method === "POST") {
        const match = matches.get(p[3].toUpperCase());
        if (!match) { sendJson(res, 404, { error: "Match not found." }); return; }
        if (match.status !== "waiting") { sendJson(res, 409, { error: "That match has already started." }); return; }
        if (match.players[0].playerId === player.id) { sendJson(res, 400, { error: "You cannot join your own match." }); return; }
        if ([...matches.values()].some(other => other.status !== "finished" && other.players.some(item => item && item.playerId === player.id))) {
            sendJson(res, 409, { error: "You are already in another match. Leave it before joining this one." }); return;
        }
        match.players[1] = newCombatant(player);
        match.players.forEach(item => draw(item, 5));
        match.status = "active";
        startTurn(match, match.players[0], false);
        match.updatedAt = new Date().toISOString();
        log(match, player.name + " joined. The battle begins!");
        saveState();
        sendJson(res, 200, { match: view(match, player.id) }); return;
    }
    if (p[0] === "api" && p[1] === "multiplayer" && p[2] === "matches" && p[3] && p[4] === "leave" && req.method === "POST") {
        const found = findMatch(p[3].toUpperCase(), player.id);
        if (found.error) { sendJson(res, found.status, { error: found.error }); return; }
        const match = found.match;
        if (match.status === "waiting") {
            matches.delete(match.id);
            saveState();
            sendJson(res, 200, { message: "Waiting match cancelled." });
            return;
        }
        if (match.status === "active") {
            const other = match.players.find(item => item && item.playerId !== player.id);
            match.status = "finished";
            match.activePlayerId = null;
            match.result = other ? other.playerId : "draw";
            log(match, player.name + " left the match. " + (other ? other.name + " wins by forfeit." : "The match ended."));
            match.updatedAt = new Date().toISOString();
        }
        saveState();
        sendJson(res, 200, { message: "You left the match." });
        return;
    }
    if (p[0] === "api" && p[1] === "multiplayer" && p[2] === "matches" && p[3] && p[4] === "action" && req.method === "POST") {
        const found = findMatch(p[3].toUpperCase(), player.id);
        if (found.error) { sendJson(res, found.status, { error: found.error }); return; }
        const match = found.match;
        if (match.status !== "active") { sendJson(res, 409, { error: "This match is not active." }); return; }
        if (match.activePlayerId !== player.id) { sendJson(res, 409, { error: "It is not your turn." }); return; }
        let body;
        try { body = await readJson(req); } catch (error) { sendJson(res, 400, { error: error.message }); return; }

        // Re-check after reading the request body. Another request from this
        // player may have ended the turn while this request was awaiting I/O.
        if (match.status !== "active") { sendJson(res, 409, { error: "This match is not active." }); return; }
        if (match.activePlayerId !== player.id) { sendJson(res, 409, { error: "It is not your turn." }); return; }

        const own = combatantFor(match, player.id);
        const opponent = match.players.find(item => item.playerId !== player.id);
        let error = null;
        if (body.type === "play_card") {
            if (typeof body.instanceId !== "string") error = "Choose a card to play.";
            else error = playCard(match, own, opponent, body.instanceId);
        } else if (body.type === "draw") {
            if (own.magik < 1) error = "You have already used your Magik draw this turn.";
            else { own.magik -= 1; log(match, player.name + (draw(own, 1) ? " spends 1 Magik to draw a card." : " has no cards left to draw.")); match.updatedAt = new Date().toISOString(); }
        } else if (body.type === "end_turn") {
            log(match, player.name + " ends their turn.");
            match.turn += 1;
            startTurn(match, opponent, true);
            match.updatedAt = new Date().toISOString();
        } else error = "Unknown action.";
        if (error) { sendJson(res, 400, { error }); return; }
        saveState();
        sendJson(res, 200, { match: view(match, player.id) }); return;
    }
    sendJson(res, 404, { error: "Multiplayer endpoint not found." });
}

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".ico": "image/x-icon" };
const PRIVATE = new Set(["server.js", "package.json", "config.json", "admin-server-patch.js", "admin-logs.js", "account-auth.js", "email-account.js", "email.js", "server-set-manager-module.js", "security=lockdown-api.js"]);

function serveStatic(req, res, pathname) {
    if (req.method !== "GET" && req.method !== "HEAD") { sendJson(res, 405, { error: "Method not allowed." }, { Allow: "GET, HEAD" }); return; }
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { sendJson(res, 400, { error: "Invalid URL path." }); return; }
    if (decoded.includes("\\") || decoded.split("/").some(part => part.startsWith("."))) { sendJson(res, 404, { error: "Not found." }); return; }
    const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
    const filePath = path.resolve(ROOT, relative);
    if (PRIVATE.has(relative) || relative.startsWith("private-data/") || relative.startsWith("node_modules/") ||
        filePath === STATE_FILE || filePath === STATE_FILE + ".tmp" ||
        filePath === ACCOUNT_FILE || filePath === ACCOUNT_FILE + ".tmp") {
        sendJson(res, 404, { error: "Not found." });
        return;
    }
    if (!filePath.startsWith(ROOT + path.sep)) { sendJson(res, 404, { error: "Not found." }); return; }
    const type = MIME[path.extname(filePath).toLowerCase()];
    if (!type) { sendJson(res, 404, { error: "Not found." }); return; }
    fs.readFile(filePath, (error, data) => {
        if (error) { sendJson(res, error.code === "ENOENT" ? 404 : 500, { error: error.code === "ENOENT" ? "Not found." : "Could not read file." }); return; }
        res.writeHead(200, { "Content-Type": type, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", "Cache-Control": path.extname(filePath) === ".html" ? "no-cache" : "public, max-age=300" });
        res.end(req.method === "HEAD" ? undefined : data);
    });
}

const DOMAIN = String(process.env.CSY_DOMAIN || "cardstuffyes.ca").trim().toLowerCase();
const SUBDOMAIN_ENTRYPOINTS = Object.freeze({
    play: "/cardgame.html",
    pvp: "/multiplayer.html",
    cards: "/set-manager.html",
    decks: "/deckbuild.html",
    account: "/account.html",
    profile: "/profile.html",
    settings: "/settings.html",
    news: "/news.html",
    help: "/how-to-play.html",
    admin: "/admin-login.html"
});

function applyDomainRouting(req, res, url) {
    const rawHost = String(req.headers.host || "").toLowerCase();
    const host = rawHost.replace(/:\d+$/, "");
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    const protocol = req.socket.encrypted || forwardedProto === "https" ? "https:" : "http:";

    if (host === "www." + DOMAIN) {
        res.writeHead(308, {
            Location: protocol + "//" + DOMAIN + url.pathname + url.search,
            "Cache-Control": "no-store"
        });
        res.end();
        return false;
    }

    if (host === DOMAIN) {
        if (url.pathname === "/") url.pathname = "/homepage.html";
        return true;
    }

    const suffix = "." + DOMAIN;
    if (!host.endsWith(suffix)) return true;

    const subdomain = host.slice(0, -suffix.length);
    if (subdomain === "api") {
        if (!url.pathname.startsWith("/api/")) {
            sendJson(res, 404, { error: "The API subdomain only serves API routes." });
            return false;
        }
        return true;
    }

    const entrypoint = SUBDOMAIN_ENTRYPOINTS[subdomain];
    if (!entrypoint) {
        sendJson(res, 404, { error: "Unknown Card Stuff Yes subdomain." });
        return false;
    }

    if (url.pathname === "/") url.pathname = entrypoint;
    return true;
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
        if (!applyDomainRouting(req, res, url)) return;

        if (url.pathname.startsWith("/api/")) {
            // Apply the API's exact-origin CORS policy before any API handler,
            // including admin login. Otherwise cross-origin preflights never
            // reach this layer and admin login can bypass the shared policy.
            if (!applyCors(req, res)) {
                sendJson(res, 403, { error: "Origin is not allowed." });
                return;
            }
            if (req.method === "OPTIONS") {
                res.writeHead(204, { "Cache-Control": "no-store" });
                res.end();
                return;
            }
            if (await handleAdminManagement(req, res, url)) return;
            if (await handleAdminLogs(req, res, url)) return;
            if (await handleEmailAccountRoutes(req, res, url)) return;
            if (await handlePublicNews(req, res, url)) return;
            if (await handleAccountCollection(req, res, url)) return;
        }

        if ((url.pathname === "/api/health" || url.pathname === "/api/status") &&
            req.method === "GET") {
            sendJson(res, 200, {
                ok: true,
                online: true,
                service: "card-stuff-yes-api",
                timestamp: new Date().toISOString()
            });
            return;
        }

        if (url.pathname === "/api/cards" && req.method === "GET") {
            sendJson(res, 200, { cards: CARDS, count: CARDS.length });
            return;
        }

        if (url.pathname === "/api/me" || url.pathname.startsWith("/api/auth/") || url.pathname.startsWith("/api/account/")) {
            const guestPlayer = url.pathname === "/api/auth/register" ? getPlayer(req, res) : null;
            if (postgresAccountStorageEnabled()) {
                if (await handlePostgresAccountAuth(req, res, url, guestPlayer)) return;
            } else if (await handleAccountAuth(req, res, url, guestPlayer)) return;
        }

        if (url.pathname.startsWith("/api/multiplayer/")) {
            const player = getPlayer(req, res);
            if (!player) {
                sendJson(res, 503, { error: "The guest player service is at capacity. Please try again later." });
                return;
            }
            await handleApi(req, res, url, player);
            return;
        }
        if (url.pathname.startsWith("/api/")) { sendJson(res, 404, { error: "API endpoint not implemented on this server." }); return; }
        if (serveAdminPage(req, res, url.pathname)) return;
        serveStatic(req, res, url.pathname);
    } catch (error) {
        console.error("Request failed:", error);
        if (!res.headersSent) sendJson(res, 500, { error: "Internal server error." });
        else res.end();
    }
});
server.listen(PORT, HOST, () => console.log("Card Stuff Yes listening on http://" + HOST + ":" + PORT));
setInterval(() => {
    if (pruneExpiredMatches()) saveState();
}, 15 * 60 * 1000).unref();
