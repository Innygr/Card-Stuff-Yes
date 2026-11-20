"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");

const COOKIE = "csyAdminSession";
const SESSION_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();
const LOG_FILE = process.env.CSY_LOG_FILE || "/app/private-logs/card-stuff-yes.log";
const MAX_LOG_BYTES = 512 * 1024;
const MAX_LINES = 1000;
const loginAttempts = new Map();

function configuredAdmins() {
    let rows;
    try { rows = JSON.parse(process.env.CSY_ADMIN_USERS || "[]"); } catch { rows = []; }
    return Array.isArray(rows) ? rows.filter(row =>
        row && typeof row.username === "string" &&
        typeof row.passwordHash === "string" &&
        ["owner", "admin"].includes(String(row.rank).toLowerCase())
    ) : [];
}

function parseHash(value) {
    const parts = String(value).split(":");
    if (parts.length !== 3 || parts[0] !== "scrypt") return null;
    try {
        const salt = Buffer.from(parts[1], "hex");
        const hash = Buffer.from(parts[2], "hex");
        if (salt.length < 16 || hash.length !== 64) return null;
        return { salt, hash };
    } catch { return null; }
}

function verifyPassword(password, encoded) {
    const parsed = parseHash(encoded);
    if (!parsed || typeof password !== "string" || password.length > 256) return false;
    const actual = crypto.scryptSync(password, parsed.salt, 64);
    return crypto.timingSafeEqual(actual, parsed.hash);
}

function cookies(req) {
    const result = {};
    for (const part of String(req.headers.cookie || "").split(";")) {
        const i = part.indexOf("=");
        if (i < 0) continue;
        try { result[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch {}
    }
    return result;
}

function adminFor(req) {
    const token = cookies(req)[COOKIE];
    if (!token) return null;
    const session = sessions.get(crypto.createHash("sha256").update(token).digest("hex"));
    if (!session || session.expiresAt <= Date.now()) {
        if (session) sessions.delete(crypto.createHash("sha256").update(token).digest("hex"));
        return null;
    }
    return { username: session.username, rank: session.rank };
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

function setCookie(req, res, token, maxAge) {
    const forwarded = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    const secure = req.socket.encrypted || forwarded === "https" ? "; Secure" : "";
    res.setHeader("Set-Cookie", COOKIE + "=" + encodeURIComponent(token) +
        "; HttpOnly; SameSite=Strict; Path=/; Max-Age=" + maxAge + secure);
}

function clearCookie(res) {
    res.setHeader("Set-Cookie", COOKIE + "=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Secure");
}

function sameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return false;
    try { return new URL(origin).host === String(req.headers.host || "").toLowerCase(); }
    catch { return false; }
}

function readLogs() {
    try {
        const stat = fs.statSync(LOG_FILE);
        if (!stat.isFile() || stat.size > MAX_LOG_BYTES) {
            const fd = fs.openSync(LOG_FILE, "r");
            try {
                const buffer = Buffer.alloc(MAX_LOG_BYTES);
                const read = fs.readSync(fd, buffer, 0, MAX_LOG_BYTES, Math.max(0, stat.size - MAX_LOG_BYTES));
                return buffer.subarray(0, read).toString("utf8").split(/\r?\n/).slice(-MAX_LINES);
            } finally { fs.closeSync(fd); }
        }
        return fs.readFileSync(LOG_FILE, "utf8").split(/\r?\n/).slice(-MAX_LINES);
    } catch (error) {
        if (error.code === "ENOENT") return ["Log snapshot is not available yet. Install the host log snapshot timer."];
        throw error;
    }
}

async function handleAdminLogs(req, res, url) {
    if (!url.pathname.startsWith("/api/admin/")) return false;

    if (url.pathname === "/api/admin/login" && req.method === "POST") {
        if (!sameOrigin(req)) { send(res, 403, { error: "Cross-origin request rejected." }); return true; }
        const ip = String(req.headers["cf-connecting-ip"] || String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "unknown");
        const now = Date.now();
        const attempt = loginAttempts.get(ip) || { count: 0, until: now + 60000 };
        if (attempt.until < now) { attempt.count = 0; attempt.until = now + 60000; }
        if (attempt.count >= 8) { send(res, 429, { error: "Too many login attempts. Try again in one minute." }); return true; }
        attempt.count += 1; loginAttempts.set(ip, attempt);

        let body = "";
        for await (const chunk of req) {
            body += chunk.toString("utf8");
            if (body.length > 8192) { send(res, 413, { error: "Request too large." }); return true; }
        }
        let data;
        try { data = JSON.parse(body || "{}"); } catch { send(res, 400, { error: "Invalid JSON." }); return true; }
        const username = typeof data.username === "string" ? data.username.trim() : "";
        const password = typeof data.password === "string" ? data.password : "";
        const user = configuredAdmins().find(row => row.username.toLowerCase() === username.toLowerCase());
        if (!user || !verifyPassword(password, user.passwordHash)) {
            send(res, 401, { error: "Invalid admin credentials." }); return true;
        }
        const token = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        const rank = String(user.rank).toLowerCase();
        sessions.set(tokenHash, { username: user.username, rank, expiresAt: now + SESSION_MS });
        setCookie(req, res, token, Math.floor(SESSION_MS / 1000));
        send(res, 200, { admin: { username: user.username, rank } });
        return true;
    }

    if (url.pathname === "/api/admin/me" && req.method === "GET") {
        const admin = adminFor(req);
        if (!admin) { send(res, 401, { error: "Admin authentication required." }); return true; }
        send(res, 200, { admin }); return true;
    }

    if (url.pathname === "/api/admin/logout" && req.method === "POST") {
        const token = cookies(req)[COOKIE];
        if (token) sessions.delete(crypto.createHash("sha256").update(token).digest("hex"));
        clearCookie(res);
        send(res, 200, { message: "Signed out." }); return true;
    }

    if (url.pathname === "/api/admin/server-logs" && req.method === "GET") {
        const admin = adminFor(req);
        if (!admin || !["owner", "admin"].includes(admin.rank)) {
            send(res, 403, { error: "Owner or admin access required." }); return true;
        }
        try {
            const lines = readLogs();
            const level = String(url.searchParams.get("level") || "all").toLowerCase();
            const filtered = lines.filter(line => {
                if (level === "all") return true;
                if (level === "error") return /\b(error|fatal|exception)\b/i.test(line);
                if (level === "warning") return /\b(warn|warning)\b/i.test(line);
                return true;
            });
            send(res, 200, { lines: filtered, updatedAt: new Date().toISOString(), source: "container snapshot" });
        } catch {
            send(res, 500, { error: "Could not read the server log snapshot." });
        }
        return true;
    }

    if (url.pathname.startsWith("/api/admin/")) {
        const admin = adminFor(req);
        if (!admin) send(res, 401, { error: "Admin authentication required." });
        else send(res, 404, { error: "Admin endpoint not found." });
        return true;
    }
    return false;
}

function serveAdminPage(req, res, pathname) {
    if (!["/admin.html", "/admin.js"].includes(pathname)) return false;
    if (!adminFor(req)) {
        res.writeHead(302, { Location: "/admin-login.html", "Cache-Control": "no-store" });
        res.end();
        return true;
    }
    return false;
}

module.exports = { handleAdminLogs, serveAdminPage };
