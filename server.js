"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
let config = { host: "127.0.0.1", port: 6565 };
try {
    config = { ...config, ...JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8")) };
} catch {
    console.warn("Using default host and port.");
}
const HOST = process.env.HOST || config.host || "127.0.0.1";
const PORT = Number(process.env.PORT || config.port || 6565);
const MAX_HEALTH = 30;
const MAX_ENERGY = 6;
const MAX_HAND = 10;
const COOKIE = "csyPlayerId";
const players = new Map();
const matches = new Map();

const CARDS = [
    { id: "spark", name: "Astral Spark", type: "attack", cost: 1, value: 3, symbol: "✦", description: "A quick burst of astral energy.", effect: "Deal 3 damage." },
    { id: "flare", name: "Solar Flare", type: "attack", cost: 2, value: 6, symbol: "☀", description: "A concentrated blast of light.", effect: "Deal 6 damage." },
    { id: "void-lance", name: "Void Lance", type: "attack", cost: 3, value: 9, symbol: "➶", description: "Pierce through the rival's guard.", effect: "Deal 9 damage." },
    { id: "meteor", name: "Falling Meteor", type: "attack", cost: 4, value: 13, symbol: "☄", description: "A heavy strike from the sky.", effect: "Deal 13 damage." },
    { id: "nova", name: "Nova Burst", type: "attack", cost: 5, value: 18, symbol: "✹", description: "Spend big for a huge hit.", effect: "Deal 18 damage." },
    { id: "guard", name: "Astral Guard", type: "guard", cost: 1, value: 4, symbol: "⬡", description: "Shape energy into a shield.", effect: "Gain 4 shield." },
    { id: "wall", name: "Prism Wall", type: "guard", cost: 2, value: 8, symbol: "▥", description: "A sturdy protective barrier.", effect: "Gain 8 shield." },
    { id: "fortress", name: "Crystal Fortress", type: "guard", cost: 4, value: 14, symbol: "◈", description: "Brace for the rival's next turn.", effect: "Gain 14 shield." },
    { id: "mend", name: "Gentle Mend", type: "heal", cost: 1, value: 4, symbol: "✚", description: "Recover a little health.", effect: "Restore 4 health." },
    { id: "renew", name: "Renewal", type: "heal", cost: 3, value: 9, symbol: "❈", description: "Recover from a rough round.", effect: "Restore 9 health." },
    { id: "lifebloom", name: "Life Bloom", type: "heal", cost: 4, value: 13, symbol: "❋", description: "A powerful wave of restoration.", effect: "Restore 13 health." },
    { id: "insight", name: "Magik Insight", type: "draw", cost: 1, value: 2, symbol: "⌕", description: "Find two more options.", effect: "Draw 2 cards." },
    { id: "study", name: "Deep Study", type: "draw", cost: 2, value: 3, symbol: "⌘", description: "Look deeper into your deck.", effect: "Draw 3 cards." },
    { id: "blood-price", name: "Blood Price", type: "attack", cost: 2, value: 8, symbol: "♦", description: "A risky, forceful hit.", effect: "Deal 8 damage; lose 2 health.", selfDamage: 2 },
    { id: "dark-surge", name: "Dark Surge", type: "attack", cost: 3, value: 7, symbol: "◐", description: "A steady hit with extra impact.", effect: "Deal 7 damage and gain 3 shield.", selfShield: 3 }
];
const CARD_BY_ID = new Map(CARDS.map(card => [card.id, card]));

function sendJson(res, status, data, headers = {}) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers });
    res.end(JSON.stringify(data));
}

function readJson(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        let size = 0;
        req.on("data", chunk => {
            size += chunk.length;
            if (size > 16384) {
                reject(new Error("Request body is too large."));
                req.destroy();
                return;
            }
            body += chunk.toString("utf8");
        });
        req.on("end", () => {
            if (!body.trim()) return resolve({});
            try { resolve(JSON.parse(body)); } catch { reject(new Error("Request body must be valid JSON.")); }
        });
        req.on("error", reject);
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

function getPlayer(req, res) {
    const cookies = cookieMap(req.headers.cookie);
    let id = cookies[COOKIE];
    let player = id && players.get(id);
    if (!id || !player) {
        id = crypto.randomBytes(24).toString("hex");
        player = { id, name: "Guest-" + id.slice(0, 4).toUpperCase() };
        players.set(id, player);
        const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
        const secure = req.socket.encrypted || proto === "https" ? "; Secure" : "";
        res.setHeader("Set-Cookie", COOKIE + "=" + id + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000" + secure);
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
        sendJson(res, 200, { player: { id: player.id, name } }); return;
    }
    if (url.pathname === "/api/multiplayer/matches" && req.method === "GET") {
        const open = [...matches.values()].filter(match => match.status === "waiting" && match.players[0].playerId !== player.id).map(match => ({ id: match.id, hostName: match.players[0].name, createdAt: match.createdAt })).slice(-50).reverse();
        sendJson(res, 200, { matches: open }); return;
    }
    if (url.pathname === "/api/multiplayer/matches" && req.method === "POST") {
        if ([...matches.values()].some(match => match.status !== "finished" && match.players.some(item => item && item.playerId === player.id))) {
            sendJson(res, 409, { error: "Finish or leave your current match before creating another." }); return;
        }
        const match = { id: crypto.randomBytes(6).toString("hex").toUpperCase(), status: "waiting", players: [newCombatant(player), null], activePlayerId: null, turn: 1, result: null, log: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        matches.set(match.id, match);
        log(match, player.name + " created a match. Waiting for another player.");
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
        if ([...matches.values()].some(other => other.status === "active" && other.players.some(item => item && item.playerId === player.id))) {
            sendJson(res, 409, { error: "You are already in an active match." }); return;
        }
        match.players[1] = newCombatant(player);
        match.players.forEach(item => draw(item, 5));
        match.status = "active";
        startTurn(match, match.players[0], false);
        match.updatedAt = new Date().toISOString();
        log(match, player.name + " joined. The battle begins!");
        sendJson(res, 200, { match: view(match, player.id) }); return;
    }
    if (p[0] === "api" && p[1] === "multiplayer" && p[2] === "matches" && p[3] && p[4] === "action" && req.method === "POST") {
        const found = findMatch(p[3].toUpperCase(), player.id);
        if (found.error) { sendJson(res, found.status, { error: found.error }); return; }
        const match = found.match;
        if (match.status !== "active") { sendJson(res, 409, { error: "This match is not active." }); return; }
        if (match.activePlayerId !== player.id) { sendJson(res, 409, { error: "It is not your turn." }); return; }
        let body;
        try { body = await readJson(req); } catch (error) { sendJson(res, 400, { error: error.message }); return; }
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
        sendJson(res, 200, { match: view(match, player.id) }); return;
    }
    sendJson(res, 404, { error: "Multiplayer endpoint not found." });
}

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".ico": "image/x-icon" };
const PRIVATE = new Set(["server.js", "package.json", "config.json", "admin-server-patch.js", "security=lockdown-api.js"]);

function serveStatic(req, res, pathname) {
    if (req.method !== "GET" && req.method !== "HEAD") { sendJson(res, 405, { error: "Method not allowed." }, { Allow: "GET, HEAD" }); return; }
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { sendJson(res, 400, { error: "Invalid URL path." }); return; }
    if (decoded.includes("\\") || decoded.split("/").some(part => part.startsWith("."))) { sendJson(res, 404, { error: "Not found." }); return; }
    const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
    if (PRIVATE.has(relative) || relative.startsWith("private-data/") || relative.startsWith("node_modules/")) { sendJson(res, 404, { error: "Not found." }); return; }
    const filePath = path.resolve(ROOT, relative);
    if (!filePath.startsWith(ROOT + path.sep)) { sendJson(res, 404, { error: "Not found." }); return; }
    const type = MIME[path.extname(filePath).toLowerCase()];
    if (!type) { sendJson(res, 404, { error: "Not found." }); return; }
    fs.readFile(filePath, (error, data) => {
        if (error) { sendJson(res, error.code === "ENOENT" ? 404 : 500, { error: error.code === "ENOENT" ? "Not found." : "Could not read file." }); return; }
        res.writeHead(200, { "Content-Type": type, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", "Cache-Control": path.extname(filePath) === ".html" ? "no-cache" : "public, max-age=300" });
        res.end(req.method === "HEAD" ? undefined : data);
    });
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
        if (url.pathname.startsWith("/api/multiplayer/")) {
            await handleApi(req, res, url, getPlayer(req, res));
            return;
        }
        if (url.pathname.startsWith("/api/")) { sendJson(res, 404, { error: "API endpoint not implemented on this server." }); return; }
        serveStatic(req, res, url.pathname);
    } catch (error) {
        console.error("Request failed:", error);
        if (!res.headersSent) sendJson(res, 500, { error: "Internal server error." });
        else res.end();
    }
});
server.listen(PORT, HOST, () => console.log("Card Stuff Yes listening on http://" + HOST + ":" + PORT));
setInterval(() => {
    const cutoff = Date.now() - 12 * 60 * 60 * 1000;
    for (const [id, match] of matches) if (new Date(match.updatedAt).getTime() < cutoff) matches.delete(id);
}, 15 * 60 * 1000).unref();
