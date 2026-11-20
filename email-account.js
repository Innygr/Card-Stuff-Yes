"use strict";

const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { getPool } = require("./db");
const {
    emailConfigured,
    validRecipient,
    buildVerificationEmail,
    buildPasswordResetEmail,
    sendTransactionalEmail
} = require("./email");

const scrypt = promisify(crypto.scrypt);
const ACCOUNT_COOKIE = "csyAccountSession";
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 128;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT = 5;
const MAX_RATE_ENTRIES = 10000;
const GENERIC_RESET_MESSAGE = "If an account has a verified email address matching that information, a password reset link will be sent.";

function tokenHash(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function createToken() {
    const token = crypto.randomBytes(32).toString("hex");
    return { token, hash: tokenHash(token) };
}

function normalizeEmail(value) {
    if (typeof value !== "string") return null;
    const email = value.trim().toLowerCase();
    if (email.length > 254 || !validRecipient(email)) return null;
    return email;
}

function publicBaseUrl() {
    const value = String(process.env.CSY_PUBLIC_BASE_URL || "").trim();
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password ||
            url.pathname !== "/" || url.search || url.hash) return null;
        return url.origin;
    } catch {
        return null;
    }
}

function emailActionsReady() {
    return emailConfigured() && Boolean(publicBaseUrl());
}

function clientIp(req) {
    return String(req.headers["cf-connecting-ip"] ||
        String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
        req.socket.remoteAddress || "unknown").slice(0, 100);
}

function createScopedRateLimiter({
    windowMs = RATE_WINDOW_MS,
    limit = RATE_LIMIT,
    maxEntries = MAX_RATE_ENTRIES,
    now = Date.now,
    getClientIp = clientIp
} = {}) {
    const attempts = new Map();

    function rateLimited(req, scope) {
        const currentTime = now();
        for (const [key, value] of attempts) {
            if (value.resetAt <= currentTime) attempts.delete(key);
        }

        const key = String(scope) + ":" + getClientIp(req);
        let entry = attempts.get(key);
        if (!entry || entry.resetAt <= currentTime) {
            entry = { count: 0, resetAt: currentTime + windowMs };
        }
        entry.count += 1;
        attempts.delete(key);
        attempts.set(key, entry);

        // Keep attacker-controlled source addresses from growing this map forever.
        while (attempts.size > maxEntries) attempts.delete(attempts.keys().next().value);
        return entry.count > limit;
    }

    Object.defineProperty(rateLimited, "size", { get: () => attempts.size });
    return rateLimited;
}

const rateLimited = createScopedRateLimiter();

function trustedOrigin(req) {
    const origin = req.headers.origin;
    if (typeof origin !== "string") return false;
    try {
        const parsed = new URL(origin);
        const forwarded = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
        const protocol = req.socket.encrypted || forwarded === "https" ? "https:" : "http:";
        if (parsed.origin === protocol + "//" + req.headers.host) return true;
        return String(process.env.CSY_ALLOWED_ORIGINS || "")
            .split(",").map(value => value.trim()).filter(Boolean).includes(parsed.origin);
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

function cookies(header) {
    const result = {};
    for (const part of String(header || "").split(";")) {
        const index = part.indexOf("=");
        if (index < 0) continue;
        try { result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim()); }
        catch { result[part.slice(0, index).trim()] = ""; }
    }
    return result;
}

function setJson(res, status, body) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
    });
    res.end(JSON.stringify(body));
}

function clearSessionCookie(req, res) {
    const forwarded = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    const secure = req.socket.encrypted || forwarded === "https" ? "; Secure" : "";
    const cookie = ACCOUNT_COOKIE + "=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" + secure;
    const existing = res.getHeader("Set-Cookie");
    res.setHeader("Set-Cookie", existing ? [].concat(existing, cookie) : cookie);
}

async function currentAccount(req) {
    const token = cookies(req.headers.cookie)[ACCOUNT_COOKIE];
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const result = await getPool().query(`
        SELECT a.id, a.email, a.email_verified_at, a.pending_email, s.token_hash
        FROM csy_private.account_sessions s
        JOIN csy_private.accounts a ON a.id = s.account_id
        WHERE s.token_hash = $1 AND s.expires_at > now()
        LIMIT 1
    `, [tokenHash(token)]);
    return result.rows[0] || null;
}

async function createEmailToken(accountId, purpose, email, ttlMs) {
    const { token, hash } = createToken();
    const expiresAt = new Date(Date.now() + ttlMs);
    const client = await getPool().connect();
    try {
        await client.query("BEGIN");
        const account = await client.query(
            "SELECT id FROM csy_private.accounts WHERE id = $1 FOR UPDATE",
            [accountId]
        );
        if (!account.rowCount) throw new Error("Account no longer exists.");
        await client.query(
            "DELETE FROM csy_private.account_email_tokens WHERE account_id = $1 AND purpose = $2",
            [accountId, purpose]
        );
        await client.query(`
            INSERT INTO csy_private.account_email_tokens
                (token_hash, account_id, purpose, email, created_at, expires_at)
            VALUES ($1, $2, $3, $4, now(), $5)
        `, [hash, accountId, purpose, email, expiresAt]);
        await client.query("COMMIT");
    } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
    } finally {
        client.release();
    }
    return token;
}

async function sendEmail(to, message) {
    return sendTransactionalEmail({ to, ...message });
}

async function handleEmailAccountRoutes(req, res, url) {
    const route = url.pathname;
    const known = new Set([
        "/api/account/email/status",
        "/api/account/email/request-verification",
        "/api/account/email/verify",
        "/api/auth/password-reset/request",
        "/api/auth/password-reset/complete"
    ]);
    if (!known.has(route)) return false;
    if (String(process.env.CSY_ACCOUNT_STORAGE || "").trim().toLowerCase() !== "postgres") {
        setJson(res, 503, { error: "Account email services are temporarily unavailable." });
        return true;
    }

    const methodAllowed = route === "/api/account/email/status" ? "GET" : "POST";
    if (req.method !== methodAllowed) {
        setJson(res, 405, { error: "Method not allowed." });
        return true;
    }
    if (req.method === "POST" && !trustedOrigin(req)) {
        setJson(res, 403, { error: "A trusted website origin is required." });
        return true;
    }
    if (req.method === "POST" &&
        !String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
        setJson(res, 415, { error: "Content-Type must be application/json." });
        return true;
    }

    if (route === "/api/account/email/status") {
        const account = await currentAccount(req);
        if (!account) {
            setJson(res, 401, { error: "Sign in to manage your email address." });
            return true;
        }
        setJson(res, 200, {
            email: account.email,
            emailVerified: Boolean(account.email_verified_at),
            pendingEmail: account.pending_email,
            emailActionsAvailable: emailActionsReady()
        });
        return true;
    }

    if (route === "/api/account/email/request-verification") {
        const account = await currentAccount(req);
        if (!account) {
            setJson(res, 401, { error: "Sign in to manage your email address." });
            return true;
        }
        if (rateLimited(req, "email-link")) {
            setJson(res, 429, { error: "Too many email requests. Try again later." });
            return true;
        }
        let body;
        try { body = await readJson(req); }
        catch (error) { setJson(res, 400, { error: error.message }); return true; }
        const email = normalizeEmail(body.email);
        if (!email) {
            setJson(res, 400, { error: "Enter a valid email address." });
            return true;
        }
        if (!emailActionsReady()) {
            setJson(res, 503, { error: "Email delivery is not configured yet. Your address has not been changed." });
            return true;
        }
        if (account.email && account.email.toLowerCase() === email && account.email_verified_at) {
            setJson(res, 200, { message: "That email address is already verified.", alreadyVerified: true });
            return true;
        }

        const client = await getPool().connect();
        let token;
        try {
            await client.query("BEGIN");
            const locked = await client.query(
                "SELECT id, email, pending_email FROM csy_private.accounts WHERE id = $1 FOR UPDATE",
                [account.id]
            );
            if (!locked.rowCount) throw new Error("Account no longer exists.");
            const collision = await client.query(`
                SELECT 1 FROM csy_private.accounts
                WHERE id <> $1 AND
                    (lower(email) = $2 OR lower(pending_email) = $2)
                LIMIT 1
            `, [account.id, email]);
            if (collision.rowCount) {
                await client.query("ROLLBACK");
                setJson(res, 409, { error: "That email address cannot be used." });
                return true;
            }
            token = createToken();
            await client.query(
                "DELETE FROM csy_private.account_email_tokens WHERE account_id = $1 AND purpose = 'verify_email'",
                [account.id]
            );
            await client.query(
                "UPDATE csy_private.accounts SET pending_email = $1, updated_at = now() WHERE id = $2",
                [email, account.id]
            );
            await client.query(`
                INSERT INTO csy_private.account_email_tokens
                    (token_hash, account_id, purpose, email, created_at, expires_at)
                VALUES ($1, $2, 'verify_email', $3, now(), $4)
            `, [token.hash, account.id, email, new Date(Date.now() + VERIFY_TTL_MS)]);
            await client.query("COMMIT");
        } catch (error) {
            try { await client.query("ROLLBACK"); } catch {}
            if (error.code === "23505") {
                setJson(res, 409, { error: "That email address cannot be used." });
                return true;
            }
            throw error;
        } finally {
            client.release();
        }

        try {
            const link = publicBaseUrl() + "/verify-email.html?token=" + encodeURIComponent(token.token);
            const result = await sendEmail(email, buildVerificationEmail(link));
            if (!result.sent) throw new Error("Email delivery is not configured.");
        } catch {
            await getPool().query(
                "DELETE FROM csy_private.account_email_tokens WHERE token_hash = $1",
                [token.hash]
            );
            setJson(res, 503, { error: "The verification email could not be sent. Your current verified address has not changed; try again later." });
            return true;
        }
        setJson(res, 202, { message: "Verification email sent. Your current email remains unchanged until the new address is verified." });
        return true;
    }

    if (route === "/api/account/email/verify") {
        if (rateLimited(req, "email-verify")) {
            setJson(res, 429, { error: "Too many verification attempts. Try again later." });
            return true;
        }
        let body;
        try { body = await readJson(req); }
        catch (error) { setJson(res, 400, { error: error.message }); return true; }
        const token = typeof body.token === "string" ? body.token : "";
        if (!/^[a-f0-9]{64}$/.test(token)) {
            setJson(res, 400, { error: "This verification link is invalid or expired. Request a new one." });
            return true;
        }
        const client = await getPool().connect();
        try {
            await client.query("BEGIN");
            const found = await client.query(`
                SELECT t.account_id, t.email, a.pending_email
                FROM csy_private.account_email_tokens t
                JOIN csy_private.accounts a ON a.id = t.account_id
                WHERE t.token_hash = $1 AND t.purpose = 'verify_email'
                    AND t.consumed_at IS NULL AND t.expires_at > now()
                FOR UPDATE OF t, a
            `, [tokenHash(token)]);
            if (!found.rowCount || found.rows[0].pending_email?.toLowerCase() !== found.rows[0].email.toLowerCase()) {
                await client.query("ROLLBACK");
                setJson(res, 400, { error: "This verification link is invalid or expired. Request a new one." });
                return true;
            }
            const item = found.rows[0];
            await client.query(`
                UPDATE csy_private.accounts
                SET email = $1, email_verified_at = now(), pending_email = NULL, updated_at = now()
                WHERE id = $2
            `, [item.email, item.account_id]);
            await client.query(
                "UPDATE csy_private.account_email_tokens SET consumed_at = now() WHERE token_hash = $1",
                [tokenHash(token)]
            );
            await client.query(
                "DELETE FROM csy_private.account_email_tokens WHERE account_id = $1 AND purpose = 'verify_email' AND token_hash <> $2",
                [item.account_id, tokenHash(token)]
            );
            await client.query("COMMIT");
            setJson(res, 200, { message: "Your email address has been verified." });
        } catch (error) {
            try { await client.query("ROLLBACK"); } catch {}
            if (error.code === "23505") {
                setJson(res, 409, { error: "That email address is already linked to another account." });
            } else throw error;
        } finally {
            client.release();
        }
        return true;
    }

    if (route === "/api/auth/password-reset/request") {
        if (rateLimited(req, "password-reset")) {
            setJson(res, 202, { message: GENERIC_RESET_MESSAGE });
            return true;
        }
        let body;
        try { body = await readJson(req); }
        catch { setJson(res, 202, { message: GENERIC_RESET_MESSAGE }); return true; }
        const email = normalizeEmail(body.email);
        // Do all account lookups and provider work after sending the same
        // response, so known and unknown addresses have indistinguishable
        // response bodies and do not wait on database/provider timing.
        setJson(res, 202, { message: GENERIC_RESET_MESSAGE });
        if (email && emailActionsReady()) {
            setImmediate(async () => {
                try {
                    const found = await getPool().query(`
                        SELECT id FROM csy_private.accounts
                        WHERE lower(email) = $1 AND email_verified_at IS NOT NULL
                        LIMIT 1
                    `, [email]);
                    if (!found.rowCount) return;
                    const accountId = found.rows[0].id;
                    const token = await createEmailToken(accountId, "password_reset", email, RESET_TTL_MS);
                    const link = publicBaseUrl() + "/reset-password.html?token=" + encodeURIComponent(token);
                    try {
                        const result = await sendEmail(email, buildPasswordResetEmail(link));
                        if (!result.sent) throw new Error("Email delivery unavailable.");
                    } catch (error) {
                        await getPool().query(
                            "DELETE FROM csy_private.account_email_tokens WHERE token_hash = $1",
                            [tokenHash(token)]
                        ).catch(() => {});
                        throw error;
                    }
                } catch {
                    console.error("Password reset email delivery failed.");
                }
            });
        }
        return true;
    }

    if (route === "/api/auth/password-reset/complete") {
        if (rateLimited(req, "password-reset-complete")) {
            setJson(res, 429, { error: "Too many attempts. Try again later." });
            return true;
        }
        let body;
        try { body = await readJson(req); }
        catch (error) { setJson(res, 400, { error: error.message }); return true; }
        const token = typeof body.token === "string" ? body.token : "";
        const password = typeof body.password === "string" ? body.password : "";
        if (!/^[a-f0-9]{64}$/.test(token)) {
            setJson(res, 400, { error: "This password reset link is invalid or expired. Request another one." });
            return true;
        }
        if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
            setJson(res, 400, { error: "Password must be between 12 and 128 characters." });
            return true;
        }
        const passwordHash = await hashPassword(password);
        const client = await getPool().connect();
        try {
            await client.query("BEGIN");
            const found = await client.query(`
                SELECT t.account_id, t.email, a.email AS current_email
                FROM csy_private.account_email_tokens t
                JOIN csy_private.accounts a ON a.id = t.account_id
                WHERE t.token_hash = $1 AND t.purpose = 'password_reset'
                    AND t.consumed_at IS NULL AND t.expires_at > now()
                FOR UPDATE OF t, a
            `, [tokenHash(token)]);
            if (!found.rowCount || found.rows[0].email.toLowerCase() !== found.rows[0].current_email?.toLowerCase()) {
                await client.query("ROLLBACK");
                setJson(res, 400, { error: "This password reset link is invalid or expired. Request another one." });
                return true;
            }
            const item = found.rows[0];
            await client.query(
                "UPDATE csy_private.accounts SET password_hash = $1, updated_at = now() WHERE id = $2",
                [passwordHash, item.account_id]
            );
            await client.query(
                "UPDATE csy_private.account_email_tokens SET consumed_at = now() WHERE token_hash = $1",
                [tokenHash(token)]
            );
            await client.query("DELETE FROM csy_private.account_sessions WHERE account_id = $1", [item.account_id]);
            await client.query(
                "DELETE FROM csy_private.account_email_tokens WHERE account_id = $1 AND purpose = 'password_reset' AND token_hash <> $2",
                [item.account_id, tokenHash(token)]
            );
            await client.query("COMMIT");
            clearSessionCookie(req, res);
            setJson(res, 200, { message: "Your password has been reset. You can now sign in." });
        } catch (error) {
            try { await client.query("ROLLBACK"); } catch {}
            throw error;
        } finally {
            client.release();
        }
        return true;
    }

    return false;
}

module.exports = {
    handleEmailAccountRoutes,
    normalizeEmail,
    publicBaseUrl,
    emailActionsReady,
    tokenHash,
    createToken,
    rateLimited,
    trustedOrigin
};
