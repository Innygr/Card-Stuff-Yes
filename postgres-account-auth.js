"use strict";

const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { getPool } = require("./db");

const scrypt = promisify(crypto.scrypt);
const ACCOUNT_COOKIE = "csyAccountSession";
const PLAYER_COOKIE = "csyPlayerId";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 128;
const loginAttempts = new Map();

function postgresAccountStorageEnabled() {
    return String(process.env.CSY_ACCOUNT_STORAGE || "").trim().toLowerCase() === "postgres";
}

function isAccountRoute(pathname) {
    return pathname === "/api/me" ||
        ["/api/auth/register", "/api/auth/login", "/api/auth/me", "/api/auth/logout",
            "/api/auth/change-password", "/api/account/profile", "/api/account/settings",
            "/api/account/decks"].includes(pathname) ||
        pathname.startsWith("/api/account/decks/");
}

function sanitizeProfile(input) {
    const profile = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    return {
        displayName: typeof profile.displayName === "string" ? profile.displayName.trim().slice(0, 24) : "",
        bio: typeof profile.bio === "string" ? profile.bio.trim().slice(0, 240) : ""
    };
}

async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const derived = await scrypt(password, salt, 64, {
        N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024
    });
    return "scrypt$16384$" + salt.toString("hex") + "$" + Buffer.from(derived).toString("hex");
}

async function burnPasswordCheck(password) {
    const value = typeof password === "string" ? password.slice(0, PASSWORD_MAX) : "";
    await scrypt(value, Buffer.alloc(16, 1), 64, {
        N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024
    });
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
    return crypto.timingSafeEqual(actual, Buffer.from(parts[3], "hex"));
}

function tokenHash(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function cookieMap(header) {
    const output = {};
    for (const part of String(header || "").split(";")) {
        const index = part.indexOf("=");
        if (index < 0) continue;
        try { output[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim()); }
        catch { output[part.slice(0, index).trim()] = ""; }
    }
    return output;
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
    const cookie = name + "=; HttpOnly; SameSite=" + sameSite + "; Path=/; Max-Age=0" + secure;
    const existing = res.getHeader("Set-Cookie");
    res.setHeader("Set-Cookie", existing ? [].concat(existing, cookie) : cookie);
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
        const allowed = new Set(String(process.env.CSY_ALLOWED_ORIGINS || "")
            .split(",").map(value => value.trim()).filter(Boolean));
        return allowed.has(parsed.origin);
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

function publicAccount(row) {
    return {
        id: row.player_id,
        accountId: row.id,
        username: row.username,
        rank: "member",
        createdAt: new Date(row.created_at).toISOString(),
        email: null,
        emailVerified: false,
        profile: sanitizeProfile({
            displayName: row.display_name,
            bio: row.bio
        })
    };
}

async function accountForSession(req) {
    const token = cookieMap(req.headers.cookie)[ACCOUNT_COOKIE];
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const hash = tokenHash(token);
    const result = await getPool().query(`
        SELECT a.id, a.player_id, a.username, a.password_hash, a.created_at,
               p.display_name, p.bio, s.expires_at
        FROM csy_private.account_sessions s
        JOIN csy_private.accounts a ON a.id = s.account_id
        LEFT JOIN csy_private.profiles p ON p.account_id = a.id
        WHERE s.token_hash = $1
        LIMIT 1
    `, [hash]);
    if (!result.rowCount) return null;
    const row = result.rows[0];
    if (new Date(row.expires_at).getTime() <= Date.now()) {
        await getPool().query("DELETE FROM csy_private.account_sessions WHERE token_hash = $1", [hash]);
        return null;
    }
    return { token, tokenHash: hash, account: row };
}

async function issueSession(req, res, accountId, playerId) {
    const now = new Date();
    const expires = new Date(now.getTime() + SESSION_MS);
    const token = crypto.randomBytes(32).toString("hex");
    await getPool().query(
        "INSERT INTO csy_private.account_sessions (token_hash, account_id, created_at, expires_at) VALUES ($1, $2, $3, $4)",
        [tokenHash(token), accountId, now, expires]
    );
    setCookie(req, res, ACCOUNT_COOKIE, token, Math.floor(SESSION_MS / 1000));
    setCookie(req, res, PLAYER_COOKIE, playerId, 30 * 24 * 60 * 60, "Lax");
}

async function handlePostgresAccountAuth(req, res, url, guestPlayer) {
    const route = url.pathname;
    if (!postgresAccountStorageEnabled() || !isAccountRoute(route)) return false;

    if (!["GET", "POST", "PUT", "DELETE"].includes(req.method)) {
        send(res, 405, { error: "Method not allowed." }, { Allow: "GET, POST, PUT, DELETE" });
        return true;
    }
    if (["POST", "PUT", "DELETE"].includes(req.method) && !trustedOrigin(req)) {
        send(res, 403, { error: "A trusted website origin is required." });
        return true;
    }
    if (["POST", "PUT"].includes(req.method) &&
        !String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
        send(res, 415, { error: "Content-Type must be application/json." });
        return true;
    }

    if (route === "/api/auth/register" && req.method === "POST") {
        if (rateLimited(req)) {
            send(res, 429, { error: "Too many attempts. Try again later." });
            return true;
        }
        let body;
        try { body = await readJson(req); }
        catch (error) { send(res, 400, { error: error.message }); return true; }
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
        if (!guestPlayer || typeof guestPlayer.id !== "string" || !/^[a-f0-9]{48}$/.test(guestPlayer.id)) {
            send(res, 400, { error: "A valid guest player is required to create an account." });
            return true;
        }
        const passwordHash = await hashPassword(password);
        const client = await getPool().connect();
        try {
            await client.query("BEGIN");
            const inserted = await client.query(`
                INSERT INTO csy_private.accounts
                    (id, player_id, username, username_key, password_hash, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, now(), now())
                RETURNING id, player_id, username, created_at
            `, ["acct_" + crypto.randomBytes(16).toString("hex"), guestPlayer.id,
                username, username.toLowerCase(), passwordHash]);
            const account = inserted.rows[0];
            await client.query(
                "INSERT INTO csy_private.profiles (account_id) VALUES ($1)",
                [account.id]
            );
            await client.query(
                "INSERT INTO csy_private.player_settings (account_id) VALUES ($1)",
                [account.id]
            );
            await client.query("COMMIT");
            await issueSession(req, res, account.id, account.player_id);
            send(res, 201, {
                player: publicAccount({ ...account, display_name: "", bio: "" }),
                linkedGuestPlayerId: guestPlayer.id
            });
        } catch (error) {
            try { await client.query("ROLLBACK"); } catch {}
            if (error.code === "23505") {
                send(res, 409, { error: error.constraint === "accounts_player_id_key"
                    ? "This player is already linked to an account. Sign in to that account instead."
                    : "That username is already in use." });
            } else {
                throw error;
            }
        } finally {
            client.release();
        }
        return true;
    }

    if (route === "/api/auth/login" && req.method === "POST") {
        if (rateLimited(req)) {
            send(res, 429, { error: "Too many attempts. Try again later." });
            return true;
        }
        let body;
        try { body = await readJson(req); }
        catch (error) { send(res, 400, { error: error.message }); return true; }
        const username = typeof body.username === "string" ? body.username.trim() : "";
        const password = typeof body.password === "string" ? body.password : "";
        const result = await getPool().query(`
            SELECT a.id, a.player_id, a.username, a.password_hash, a.created_at,
                   p.display_name, p.bio
            FROM csy_private.accounts a
            LEFT JOIN csy_private.profiles p ON p.account_id = a.id
            WHERE a.username_key = $1
            LIMIT 1
        `, [username.toLowerCase()]);
        const account = result.rows[0] || null;
        const valid = account
            ? await verifyPassword(password, account.password_hash)
            : await burnPasswordCheck(password);
        if (!valid) {
            send(res, 401, { error: "Invalid username or password." });
            return true;
        }
        await issueSession(req, res, account.id, account.player_id);
        send(res, 200, { player: publicAccount(account) });
        return true;
    }

    if ((route === "/api/auth/me" || route === "/api/me") && req.method === "GET") {
        const current = await accountForSession(req);
        if (!current) {
            send(res, 401, { error: "Sign in to view your account." });
            return true;
        }
        send(res, 200, { player: publicAccount(current.account) });
        return true;
    }

    if (route === "/api/auth/logout" && req.method === "POST") {
        const current = await accountForSession(req);
        if (current) {
            await getPool().query(
                "DELETE FROM csy_private.account_sessions WHERE token_hash = $1",
                [current.tokenHash]
            );
        }
        clearCookie(req, res, ACCOUNT_COOKIE);
        clearCookie(req, res, PLAYER_COOKIE, "Lax");
        send(res, 200, { message: "Signed out." });
        return true;
    }

    if (route === "/api/account/profile") {
        const current = await accountForSession(req);
        if (!current) {
            send(res, 401, { error: "Sign in to manage your account." });
            return true;
        }
        if (req.method === "GET") {
            send(res, 200, { profile: sanitizeProfile({
                displayName: current.account.display_name,
                bio: current.account.bio
            }) });
            return true;
        }
        if (req.method !== "PUT") {
            send(res, 405, { error: "Method not allowed." }, { Allow: "GET, PUT" });
            return true;
        }
        let body;
        try { body = await readJson(req); }
        catch (error) { send(res, 400, { error: error.message }); return true; }
        if (!body || typeof body !== "object" || Array.isArray(body) ||
            (body.displayName !== undefined && typeof body.displayName !== "string") ||
            (body.bio !== undefined && typeof body.bio !== "string") ||
            Object.keys(body).some(key => !["displayName", "bio"].includes(key))) {
            send(res, 400, { error: "Profile accepts only displayName and bio text fields." });
            return true;
        }
        if ((body.displayName || "").length > 24 || (body.bio || "").length > 240) {
            send(res, 400, { error: "Display name is limited to 24 characters and bio to 240." });
            return true;
        }
        const profile = sanitizeProfile({
            displayName: body.displayName === undefined ? current.account.display_name : body.displayName,
            bio: body.bio === undefined ? current.account.bio : body.bio
        });
        await getPool().query(`
            INSERT INTO csy_private.profiles (account_id, display_name, bio, updated_at)
            VALUES ($1, $2, $3, now())
            ON CONFLICT (account_id) DO UPDATE
            SET display_name = EXCLUDED.display_name,
                bio = EXCLUDED.bio,
                updated_at = now()
        `, [current.account.id, profile.displayName, profile.bio]);
        await getPool().query(
            "UPDATE csy_private.accounts SET updated_at = now() WHERE id = $1",
            [current.account.id]
        );
        send(res, 200, { profile });
        return true;
    }

    if (route === "/api/auth/change-password" && req.method === "POST") {
        const current = await accountForSession(req);
        if (!current) {
            send(res, 401, { error: "Sign in to change your password." });
            return true;
        }
        let body;
        try { body = await readJson(req); }
        catch (error) { send(res, 400, { error: error.message }); return true; }
        const oldPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
        const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
        if (!(await verifyPassword(oldPassword, current.account.password_hash))) {
            send(res, 401, { error: "Current password is incorrect." });
            return true;
        }
        if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX) {
            send(res, 400, { error: "New password must be between 12 and 128 characters." });
            return true;
        }
        const passwordHash = await hashPassword(newPassword);
        await getPool().query(
            "UPDATE csy_private.accounts SET password_hash = $1, updated_at = now() WHERE id = $2",
            [passwordHash, current.account.id]
        );
        await getPool().query(
            "DELETE FROM csy_private.account_sessions WHERE account_id = $1",
            [current.account.id]
        );
        clearCookie(req, res, ACCOUNT_COOKIE);
        send(res, 200, { message: "Password changed. Please sign in again." });
        return true;
    }

    if (route === "/api/account/settings" || route === "/api/account/decks" ||
        route.startsWith("/api/account/decks/")) {
        send(res, 501, {
            error: "This feature is not migrated to PostgreSQL yet. Keep CSY_ACCOUNT_STORAGE unset until settings and saved decks are migrated."
        });
        return true;
    }

    return false;
}

module.exports = {
    postgresAccountStorageEnabled,
    isAccountRoute,
    sanitizeProfile,
    hashPassword,
    verifyPassword,
    handlePostgresAccountAuth
};
