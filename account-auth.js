"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);
const ACCOUNT_COOKIE = "csyAccountSession";
const PLAYER_COOKIE = "csyPlayerId";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 128;
const ACCOUNT_FILE = path.resolve(
    process.env.CSY_ACCOUNT_FILE || path.join(__dirname, "private-data", "accounts.json")
);
const allowedOrigins = new Set(
    String(process.env.CSY_ALLOWED_ORIGINS || "")
        .split(",")
        .map(value => value.trim())
        .filter(Boolean)
);
const loginAttempts = new Map();
const MAX_DECKS = 25;
const MAX_DECK_CARDS = 60;
const CARD_IDS = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, "cards.json"), "utf8")).map(card => card.id));

function readStore() {
    try {
        const data = JSON.parse(fs.readFileSync(ACCOUNT_FILE, "utf8"));
        if (!data || data.version !== 1 || !Array.isArray(data.accounts) || !Array.isArray(data.sessions)) {
            throw new Error("Account store has an unsupported format.");
        }
        return data;
    } catch (error) {
        if (error.code === "ENOENT") return { version: 1, accounts: [], sessions: [] };
        throw new Error("Could not safely load account storage: " + error.message);
    }
}

const postgresAccountStorage = String(process.env.CSY_ACCOUNT_STORAGE || "").trim().toLowerCase() === "postgres";
const store = postgresAccountStorage ? { version: 1, accounts: [], sessions: [] } : readStore();

const DEFAULT_SETTINGS = Object.freeze({
    animations:"full", battleAnimationSpeed:"1", cardZoomBehaviour:"hold",
    autoEndTurn:false, confirmActions:true, showDamageNumbers:true, showResourceChanges:true, showAbilityNames:true,
    graphicsQuality:"auto", compatibilityMode:"auto", renderingEngine:"auto", textureQuality:"auto",
    pack3DQuality:"auto", packDisplay:"auto", vfxQuality:"high", particleEffects:"on", screenEffects:"on",
    shadows:"on", antiAliasing:"auto", frameRateLimit:"auto", resolutionScale:"auto",
    memoryBudget:"1024", assetCaching:true, keep3DAssetsCached:true, backgroundRendering:true,
    performanceMode:false, lowPowerMode:false,
    masterVolume:100, musicVolume:100, sfxVolume:100, attackSfxVolume:100, uiVolume:100,
    cardPackSounds:true, battleSounds:true, muteWhenUnfocused:false,
    uiScale:"100", compactUI:false, showCardIDs:false, showRarity:true, showIllustrator:true,
    reducedMotion:false, highContrast:false, colorblindMode:"off", largerText:false, screenShake:true, flashingEffects:"on",
    showPing:true, showConnectionStatus:true, autoReconnect:true, autoDownloadAssets:true,
    inputDevice:"auto", controllerVibration:true, vibrationStrength:100, mouseSensitivity:100,
    gamepadSensitivity:100, invertX:false, invertY:false,
    onlineStatus:"online", friendRequests:"everyone", tradeRequests:true, donationRequests:true,
    battleInvites:true, showElo:true,
    showFPS:false, showDebug:false, showRendererInfo:false, showAssetStats:false
});

const STRING_SETTING_OPTIONS = Object.freeze({
    animations: ["full", "reduced", "off"],
    battleAnimationSpeed: ["0.5", "1", "1.5", "2"],
    cardZoomBehaviour: ["hold", "toggle"],
    graphicsQuality: ["auto", "low", "medium", "high", "ultra"],
    compatibilityMode: ["auto", "maximumCompatibility", "balanced", "maximumQuality"],
    renderingEngine: ["auto", "webgpu", "webgl2", "compatibility"],
    textureQuality: ["auto", "low", "medium", "high"],
    pack3DQuality: ["auto", "low", "medium", "high"],
    packDisplay: ["auto", "3d", "2d"],
    vfxQuality: ["low", "medium", "high"],
    particleEffects: ["on", "reduced", "off"],
    screenEffects: ["on", "reduced", "off"],
    shadows: ["on", "low", "off"],
    antiAliasing: ["auto", "low", "high", "off"],
    frameRateLimit: ["auto", "30", "60", "120", "unlimited"],
    resolutionScale: ["auto", "50", "75", "100"],
    memoryBudget: ["512", "768", "1024", "1536", "2048"],
    uiScale: ["75", "90", "100", "110", "125", "150"],
    colorblindMode: ["off", "protanopia", "deuteranopia", "tritanopia"],
    flashingEffects: ["on", "reduced", "off"],
    inputDevice: ["auto", "keyboard", "controller", "touch"],
    onlineStatus: ["online", "away", "invisible"],
    friendRequests: ["everyone", "friendsOfFriends", "nobody"]
});
const NUMBER_SETTING_RANGES = Object.freeze({
    masterVolume: [0, 100], musicVolume: [0, 100], sfxVolume: [0, 100],
    attackSfxVolume: [0, 100], uiVolume: [0, 100], vibrationStrength: [0, 100],
    mouseSensitivity: [25, 200], gamepadSensitivity: [25, 200]
});

function sanitizeSettings(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return {};
    const output = {};
    for (const [key, value] of Object.entries(input)) {
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) continue;
        const expected = DEFAULT_SETTINGS[key];
        if (typeof expected === "boolean" && typeof value === "boolean") output[key] = value;
        else if (typeof expected === "number" && Number.isFinite(value) && NUMBER_SETTING_RANGES[key] && value >= NUMBER_SETTING_RANGES[key][0] && value <= NUMBER_SETTING_RANGES[key][1]) output[key] = value;
        else if (typeof expected === "string" && typeof value === "string" && STRING_SETTING_OPTIONS[key]?.includes(value)) output[key] = value;
    }
    return output;
}

function sanitizeProfile(input) {
    const profile = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    return {
        displayName: typeof profile.displayName === "string" ? profile.displayName.trim().slice(0, 24) : "",
        bio: typeof profile.bio === "string" ? profile.bio.trim().slice(0, 240) : ""
    };
}

function sanitizeDecks(input) {
    if (!Array.isArray(input)) return [];
    const seen = new Set();
    return input.filter(deck => {
        if (!deck || typeof deck !== "object" || Array.isArray(deck) ||
            typeof deck.id !== "string" || !/^deck_[a-f0-9]{32}$/.test(deck.id) ||
            seen.has(deck.id) || typeof deck.name !== "string" || !deck.name.trim() ||
            deck.name.length > 40 || !Array.isArray(deck.cards) || deck.cards.length > MAX_DECK_CARDS ||
            !deck.cards.every(cardId => typeof cardId === "string" && CARD_IDS.has(cardId)) ||
            typeof deck.createdAt !== "string" || !Number.isFinite(Date.parse(deck.createdAt)) ||
            typeof deck.updatedAt !== "string" || !Number.isFinite(Date.parse(deck.updatedAt))) return false;
        seen.add(deck.id);
        deck.name = deck.name.trim();
        return true;
    }).slice(0, MAX_DECKS);
}

function validDeckCards(cards) {
    return Array.isArray(cards) && cards.length <= MAX_DECK_CARDS &&
        cards.every(cardId => typeof cardId === "string" && CARD_IDS.has(cardId));
}

function sanitizeStore() {
    const originalAccounts = store.accounts.length;
    const originalSessions = store.sessions.length;
    store.accounts = store.accounts.filter(account =>
        account && typeof account === "object" &&
        typeof account.id === "string" && /^acct_[a-f0-9]{32}$/.test(account.id) &&
        typeof account.username === "string" && /^[A-Za-z0-9_]{3,20}$/.test(account.username) &&
        account.usernameKey === account.username.toLowerCase() &&
        typeof account.playerId === "string" && /^[a-f0-9]{48}$/.test(account.playerId) &&
        typeof account.passwordHash === "string" && /^scrypt\$16384\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(account.passwordHash) &&
        typeof account.createdAt === "string" && Number.isFinite(Date.parse(account.createdAt))
    );
    for (const account of store.accounts) {
        account.profile = sanitizeProfile(account.profile);
        account.settings = sanitizeSettings(account.settings);
        account.decks = sanitizeDecks(account.decks);
    }
    const accountIds = new Set(store.accounts.map(account => account.id));
    store.sessions = store.sessions.filter(session =>
        session && typeof session.tokenHash === "string" && /^[a-f0-9]{64}$/.test(session.tokenHash) &&
        accountIds.has(session.accountId) && Number.isFinite(session.createdAt) &&
        Number.isFinite(session.expiresAt) && session.expiresAt > Date.now()
    );
    if (store.accounts.length !== originalAccounts || store.sessions.length !== originalSessions) saveStore();
}

function saveStore() {
    const temporary = ACCOUNT_FILE + ".tmp";
    fs.mkdirSync(path.dirname(ACCOUNT_FILE), { recursive: true, mode: 0o700 });
    fs.writeFileSync(temporary, JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        accounts: store.accounts,
        sessions: store.sessions
    }), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, ACCOUNT_FILE);
    try { fs.chmodSync(ACCOUNT_FILE, 0o600); } catch {}
}

function cookieMap(header) {
    const result = {};
    for (const part of String(header || "").split(";")) {
        const index = part.indexOf("=");
        if (index < 0) continue;
        const key = part.slice(0, index).trim();
        try { result[key] = decodeURIComponent(part.slice(index + 1).trim()); } catch { result[key] = ""; }
    }
    return result;
}

function isSecure(req) {
    const forwarded = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    return Boolean(req.socket.encrypted || forwarded === "https");
}

function setCookie(req, res, name, value, maxAge, sameSite = "Strict") {
    const secure = isSecure(req) ? "; Secure" : "";
    const cookie = name + "=" + encodeURIComponent(value) +
        "; HttpOnly; SameSite=" + sameSite + "; Path=/; Max-Age=" + maxAge + secure;
    const existing = res.getHeader("Set-Cookie");
    res.setHeader("Set-Cookie", existing ? [].concat(existing, cookie) : cookie);
}

function clearCookie(req, res, name, sameSite = "Strict") {
    const secure = isSecure(req) ? "; Secure" : "";
    res.setHeader("Set-Cookie", name + "=; HttpOnly; SameSite=" + sameSite +
        "; Path=/; Max-Age=0" + secure);
}

function send(res, status, data, headers = {}) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...headers
    });
    res.end(JSON.stringify(data));
}

function trustedOrigin(req) {
    const origin = req.headers.origin;
    if (typeof origin !== "string") return false;
    try {
        const parsed = new URL(origin);
        const forwarded = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
        const protocol = req.socket.encrypted || forwarded === "https" ? "https:" : "http:";
        if (parsed.origin === protocol + "//" + req.headers.host) return true;
        return allowedOrigins.has(parsed.origin);
    } catch {
        return false;
    }
}

function readJson(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        let size = 0;
        let failed = false;
        req.on("data", chunk => {
            if (failed) return;
            size += chunk.length;
            if (size > 8192) {
                failed = true;
                reject(new Error("Request body is too large."));
                return;
            }
            body += chunk.toString("utf8");
        });
        req.on("end", () => {
            if (failed) return;
            try { resolve(body.trim() ? JSON.parse(body) : {}); }
            catch { reject(new Error("Request body must be valid JSON.")); }
        });
        req.on("error", error => { if (!failed) reject(error); });
    });
}

function tokenHash(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return "scrypt$16384$" + salt.toString("hex") + "$" + Buffer.from(derived).toString("hex");
}

async function burnPasswordCheck(password) {
    const value = typeof password === "string" ? password.slice(0, PASSWORD_MAX) : "";
    await scrypt(value, Buffer.alloc(16, 1), 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return false;
}

async function verifyPassword(password, encoded) {
    if (typeof password !== "string" || password.length > PASSWORD_MAX || typeof encoded !== "string") return false;
    const parts = encoded.split("$");
    if (parts.length !== 4 || parts[0] !== "scrypt" || parts[1] !== "16384" ||
        !/^[a-f0-9]{32}$/.test(parts[2]) || !/^[a-f0-9]{128}$/.test(parts[3])) return false;
    const actual = Buffer.from(await scrypt(password, Buffer.from(parts[2], "hex"), 64, {
        N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024
    }));
    const expected = Buffer.from(parts[3], "hex");
    return crypto.timingSafeEqual(actual, expected);
}

function accountByUsername(username) {
    const key = username.toLowerCase();
    return store.accounts.find(account => account.usernameKey === key) || null;
}

function publicAccount(account) {
    return {
        id: account.playerId,
        accountId: account.id,
        username: account.username,
        rank: "member",
        createdAt: account.createdAt,
        email: null,
        emailVerified: false,
        profile: sanitizeProfile(account.profile)
    };
}

function sessionFor(req) {
    const token = cookieMap(req.headers.cookie)[ACCOUNT_COOKIE];
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const hash = tokenHash(token);
    const session = store.sessions.find(item => item.tokenHash === hash);
    if (!session) return null;
    if (!Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) {
        store.sessions = store.sessions.filter(item => item !== session);
        saveStore();
        return null;
    }
    const account = store.accounts.find(item => item.id === session.accountId);
    if (!account) return null;
    return { token, session, account };
}

function pruneSessions() {
    const before = store.sessions.length;
    store.sessions = store.sessions.filter(item =>
        item && typeof item.tokenHash === "string" &&
        Number.isFinite(item.expiresAt) && item.expiresAt > Date.now() &&
        store.accounts.some(account => account.id === item.accountId)
    );
    if (store.sessions.length !== before) saveStore();
}

function issueSession(req, res, account) {
    const now = Date.now();
    const token = crypto.randomBytes(32).toString("hex");
    store.sessions.push({
        tokenHash: tokenHash(token),
        accountId: account.id,
        createdAt: now,
        expiresAt: now + SESSION_MS
    });
    saveStore();
    setCookie(req, res, ACCOUNT_COOKIE, token, Math.floor(SESSION_MS / 1000));
    setCookie(req, res, PLAYER_COOKIE, account.playerId, 30 * 24 * 60 * 60, "Lax");
}

function rateLimited(req) {
    const ip = String(req.headers["cf-connecting-ip"] ||
        String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
        req.socket.remoteAddress || "unknown");
    const now = Date.now();
    let entry = loginAttempts.get(ip);
    if (!entry || entry.resetAt <= now) entry = { count: 0, resetAt: now + 15 * 60 * 1000 };
    entry.count += 1;
    loginAttempts.set(ip, entry);
    for (const [key, value] of loginAttempts) if (value.resetAt <= now) loginAttempts.delete(key);
    return entry.count > 10;
}

async function handleAccountAuth(req, res, url, guestPlayer) {
    const route = url.pathname;
    const isAccountRoute = route === "/api/me" ||
        ["/api/auth/register", "/api/auth/login", "/api/auth/me", "/api/auth/logout", "/api/auth/change-password", "/api/account/profile", "/api/account/settings", "/api/account/decks"].includes(route) ||
        /^\/api\/account\/decks\/deck_[a-f0-9]{32}$/.test(route);
    if (!isAccountRoute) return false;

    if (req.method !== "GET" && req.method !== "POST" && req.method !== "PUT" && req.method !== "DELETE") {
        send(res, 405, { error: "Method not allowed." }, { Allow: "GET, POST, PUT, DELETE" });
        return true;
    }

    if ((req.method === "POST" || req.method === "PUT" || req.method === "DELETE") && !trustedOrigin(req)) {
        send(res, 403, { error: "A trusted website origin is required." });
        return true;
    }
    if ((req.method === "POST" || req.method === "PUT") && !String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
        send(res, 415, { error: "Content-Type must be application/json." });
        return true;
    }

    if (route === "/api/auth/register" && req.method === "POST") {
        if (rateLimited(req)) { send(res, 429, { error: "Too many attempts. Try again later." }); return true; }
        let body;
        try { body = await readJson(req); } catch (error) { send(res, 400, { error: error.message }); return true; }
        const username = typeof body.username === "string" ? body.username.trim() : "";
        const password = typeof body.password === "string" ? body.password : "";
        if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
            send(res, 400, { error: "Username must be 3–20 characters and use only letters, numbers, or underscores." });
            return true;
        }
        if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
            send(res, 400, { error: "Password must be between 12 and 128 characters." });
            return true;
        }
        if (accountByUsername(username)) { send(res, 409, { error: "That username is already in use." }); return true; }
        if (store.accounts.some(item => item.playerId === guestPlayer.id)) {
            send(res, 409, { error: "This player is already linked to an account. Sign in to that account instead." });
            return true;
        }
        const passwordHash = await hashPassword(password);
        // Re-check after the asynchronous hash to prevent concurrent duplicate registrations.
        if (accountByUsername(username)) { send(res, 409, { error: "That username is already in use." }); return true; }
        if (store.accounts.some(item => item.playerId === guestPlayer.id)) {
            send(res, 409, { error: "This player is already linked to an account. Sign in to that account instead." });
            return true;
        }
        const now = new Date().toISOString();
        const account = {
            id: "acct_" + crypto.randomBytes(16).toString("hex"),
            username,
            usernameKey: username.toLowerCase(),
            passwordHash,
            playerId: guestPlayer.id,
            profile: { displayName: "", bio: "" },
            settings: {},
            decks: [],
            createdAt: now,
            updatedAt: now
        };
        store.accounts.push(account);
        issueSession(req, res, account);
        send(res, 201, { player: publicAccount(account), linkedGuestPlayerId: guestPlayer.id });
        return true;
    }

    if (route === "/api/auth/login" && req.method === "POST") {
        if (rateLimited(req)) { send(res, 429, { error: "Too many attempts. Try again later." }); return true; }
        let body;
        try { body = await readJson(req); } catch (error) { send(res, 400, { error: error.message }); return true; }
        const username = typeof body.username === "string" ? body.username.trim() : "";
        const password = typeof body.password === "string" ? body.password : "";
        const account = accountByUsername(username);
        const validPassword = account
            ? await verifyPassword(password, account.passwordHash)
            : await burnPasswordCheck(password);
        if (!validPassword) {
            send(res, 401, { error: "Invalid username or password." });
            return true;
        }
        issueSession(req, res, account);
        send(res, 200, { player: publicAccount(account) });
        return true;
    }

    if (route === "/api/auth/me" || route === "/api/me") {
        if (req.method !== "GET") { send(res, 405, { error: "Method not allowed." }); return true; }
        const current = sessionFor(req);
        if (!current) { send(res, 401, { error: "Sign in to view your account." }); return true; }
        send(res, 200, { player: publicAccount(current.account) });
        return true;
    }

    if (route === "/api/auth/logout" && req.method === "POST") {
        const current = sessionFor(req);
        if (current) {
            store.sessions = store.sessions.filter(item => item.tokenHash !== tokenHash(current.token));
            saveStore();
        }
        clearCookie(req, res, ACCOUNT_COOKIE);
        clearCookie(req, res, PLAYER_COOKIE, "Lax");
        send(res, 200, { message: "Signed out." });
        return true;
    }

    if (route === "/api/account/decks" || route.startsWith("/api/account/decks/")) {
        const current = sessionFor(req);
        if (!current) { send(res, 401, { error: "Sign in to manage saved decks." }); return true; }
        const deckId = route === "/api/account/decks" ? null : route.slice("/api/account/decks/".length);
        if (req.method === "GET" && !deckId) {
            send(res, 200, { decks: sanitizeDecks(current.account.decks) });
            return true;
        }
        if (req.method === "POST" && !deckId) {
            let body;
            try { body = await readJson(req); } catch (error) { send(res, 400, { error: error.message }); return true; }
            if (current.account.decks.length >= MAX_DECKS) {
                send(res, 409, { error: "You have reached the saved deck limit." });
                return true;
            }
            const name = typeof body.name === "string" ? body.name.trim() : "";
            if (!name || name.length > 40 || !validDeckCards(body.cards)) {
                send(res, 400, { error: "A deck needs a name of 1–40 characters and up to 60 valid card IDs." });
                return true;
            }
            const now = new Date().toISOString();
            const deck = {
                id: "deck_" + crypto.randomBytes(16).toString("hex"),
                name,
                cards: body.cards.slice(),
                createdAt: now,
                updatedAt: now
            };
            current.account.decks.push(deck);
            current.account.updatedAt = now;
            saveStore();
            send(res, 201, { deck });
            return true;
        }
        if (!deckId || !/^deck_[a-f0-9]{32}$/.test(deckId)) {
            send(res, 400, { error: "Invalid saved deck ID." });
            return true;
        }
        const deck = current.account.decks.find(item => item.id === deckId);
        if (!deck) { send(res, 404, { error: "Saved deck not found." }); return true; }
        if (req.method === "GET") { send(res, 200, { deck }); return true; }
        if (req.method === "PUT") {
            let body;
            try { body = await readJson(req); } catch (error) { send(res, 400, { error: error.message }); return true; }
            if (!body || typeof body !== "object" || Array.isArray(body) ||
                Object.keys(body).some(key => !["name", "cards"].includes(key))) {
                send(res, 400, { error: "Only deck name and cards can be updated." });
                return true;
            }
            if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 40)) {
                send(res, 400, { error: "Deck name must be 1–40 characters." });
                return true;
            }
            if (body.cards !== undefined && !validDeckCards(body.cards)) {
                send(res, 400, { error: "Deck cards must contain up to 60 valid card IDs." });
                return true;
            }
            if (body.name !== undefined) deck.name = body.name.trim();
            if (body.cards !== undefined) deck.cards = body.cards.slice();
            deck.updatedAt = new Date().toISOString();
            current.account.updatedAt = deck.updatedAt;
            saveStore();
            send(res, 200, { deck });
            return true;
        }
        if (req.method === "DELETE") {
            current.account.decks = current.account.decks.filter(item => item.id !== deckId);
            current.account.updatedAt = new Date().toISOString();
            saveStore();
            send(res, 200, { message: "Saved deck deleted." });
            return true;
        }
        send(res, 405, { error: "Method not allowed." }, { Allow: "GET, PUT, DELETE" });
        return true;
    }

    if (route === "/api/account/profile" || route === "/api/account/settings") {
        const current = sessionFor(req);
        if (!current) { send(res, 401, { error: "Sign in to manage your account." }); return true; }
        const isProfile = route.endsWith("/profile");
        const key = isProfile ? "profile" : "settings";
        if (req.method === "GET") {
            send(res, 200, isProfile
                ? { profile: sanitizeProfile(current.account.profile) }
                : { settings: sanitizeSettings(current.account.settings) });
            return true;
        }
        if (req.method !== "PUT") {
            send(res, 405, { error: "Method not allowed." }, { Allow: "GET, PUT" });
            return true;
        }
        let body;
        try { body = await readJson(req); } catch (error) { send(res, 400, { error: error.message }); return true; }
        if (isProfile) {
            if (!body || typeof body !== "object" || Array.isArray(body) ||
                (body.displayName !== undefined && typeof body.displayName !== "string") ||
                (body.bio !== undefined && typeof body.bio !== "string") ||
                Object.keys(body).some(name => !["displayName", "bio"].includes(name))) {
                send(res, 400, { error: "Profile accepts only displayName and bio text fields." });
                return true;
            }
            if ((body.displayName || "").length > 24 || (body.bio || "").length > 240) {
                send(res, 400, { error: "Display name is limited to 24 characters and bio to 240." });
                return true;
            }
            current.account.profile = sanitizeProfile({ ...current.account.profile, ...body });
            current.account.updatedAt = new Date().toISOString();
            saveStore();
            send(res, 200, { profile: current.account.profile });
            return true;
        }
        if (!body || typeof body !== "object" || Array.isArray(body) ||
            Object.keys(body).some(name => !Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, name))) {
            send(res, 400, { error: "One or more setting names are not supported." });
            return true;
        }
        const cleaned = sanitizeSettings(body);
        if (Object.keys(cleaned).length !== Object.keys(body).length) {
            send(res, 400, { error: "One or more setting values have an invalid type or format." });
            return true;
        }
        current.account.settings = { ...sanitizeSettings(current.account.settings), ...cleaned };
        current.account.updatedAt = new Date().toISOString();
        saveStore();
        send(res, 200, { settings: current.account.settings });
        return true;
    }

    if (route === "/api/auth/change-password" && req.method === "POST") {
        const current = sessionFor(req);
        if (!current) { send(res, 401, { error: "Sign in to change your password." }); return true; }
        let body;
        try { body = await readJson(req); } catch (error) { send(res, 400, { error: error.message }); return true; }
        const oldPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
        const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
        if (!(await verifyPassword(oldPassword, current.account.passwordHash))) {
            send(res, 401, { error: "Current password is incorrect." });
            return true;
        }
        if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX) {
            send(res, 400, { error: "New password must be between 12 and 128 characters." });
            return true;
        }
        current.account.passwordHash = await hashPassword(newPassword);
        current.account.updatedAt = new Date().toISOString();
        store.sessions = store.sessions.filter(item => item.accountId !== current.account.id);
        saveStore();
        clearCookie(req, res, ACCOUNT_COOKIE);
        send(res, 200, { message: "Password changed. Please sign in again." });
        return true;
    }

    return false;
}

if (!postgresAccountStorage) {
    sanitizeStore();
    pruneSessions();
}

module.exports = { handleAccountAuth, sanitizeSettings, validDeckCards, MAX_DECKS, MAX_DECK_CARDS };
