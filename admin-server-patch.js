/*
 * CARD STUFF YES — ADMIN AUTH PATCH
 *
 * Add this AFTER the normal player/session helper functions are
 * defined and BEFORE the server request handler's 404 fallback.
 *
 * Admin pages/API access is controlled by a SEPARATE cookie:
 *     adminSessionId
 *
 * A normal player session never grants admin access.
 */

const ADMIN_SESSION_LENGTH_MS = 7 * 24 * 60 * 60 * 1000;
const ADMIN_SESSION_TOKEN_BYTES = 32;
const ADMIN_RANKS = new Set(["owner", "admin"]);

/* Separate table so admin authentication does not depend on the
 * normal player's session implementation. */
db.exec(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
        tokenHash TEXT PRIMARY KEY,
        playerId INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        FOREIGN KEY (playerId)
            REFERENCES players(id)
            ON DELETE CASCADE
    )
`);

function createAdminSessionToken() {
    return crypto.randomBytes(ADMIN_SESSION_TOKEN_BYTES).toString("hex");
}

function hashAdminSessionToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function getAdminSessionTokenFromCookies(req) {
    const header = req.headers.cookie;
    if (!header) return null;

    for (const rawCookie of header.split(";")) {
        const cookie = rawCookie.trim();
        const separator = cookie.indexOf("=");
        if (separator === -1) continue;

        const name = cookie.slice(0, separator);
        const value = cookie.slice(separator + 1);

        if (name !== "adminSessionId") continue;

        try {
            return decodeURIComponent(value);
        } catch {
            return null;
        }
    }

    return null;
}

function isAdminPlayer(player) {
    return Boolean(
        player &&
        typeof player.rank === "string" &&
        ADMIN_RANKS.has(player.rank.toLowerCase())
    );
}

function getAdminFromSession(req) {
    const token = getAdminSessionTokenFromCookies(req);
    if (!token) return null;

    const tokenHash = hashAdminSessionToken(token);
    const session = db.prepare(`
        SELECT tokenHash, playerId, createdAt, expiresAt
        FROM admin_sessions
        WHERE tokenHash = ?
    `).get(tokenHash);

    if (!session) return null;

    if (new Date(session.expiresAt) <= new Date()) {
        db.prepare(`DELETE FROM admin_sessions WHERE tokenHash = ?`).run(tokenHash);
        return null;
    }

    const player = getPlayerById(session.playerId);

    if (!isAdminPlayer(player)) {
        db.prepare(`DELETE FROM admin_sessions WHERE tokenHash = ?`).run(tokenHash);
        return null;
    }

    return player;
}

function createAdminSession(playerId) {
    const token = createAdminSessionToken();
    const tokenHash = hashAdminSessionToken(token);
    const createdAt = new Date();
    const expiresAt = new Date(
        createdAt.getTime() + ADMIN_SESSION_LENGTH_MS
    );

    db.prepare(`
        INSERT INTO admin_sessions
            (tokenHash, playerId, createdAt, expiresAt)
        VALUES (?, ?, ?, ?)
    `).run(
        tokenHash,
        playerId,
        createdAt.toISOString(),
        expiresAt.toISOString()
    );

    return { token, expiresAt };
}

function destroyAdminSession(req) {
    const token = getAdminSessionTokenFromCookies(req);
    if (!token) return;

    db.prepare(`
        DELETE FROM admin_sessions
        WHERE tokenHash = ?
    `).run(hashAdminSessionToken(token));
}

function destroyAllAdminSessions(playerId) {
    db.prepare(`
        DELETE FROM admin_sessions
        WHERE playerId = ?
    `).run(playerId);
}

function sendAdminCookie(res, token, maxAgeSeconds) {
    res.setHeader(
        "Set-Cookie",
        `adminSessionId=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}; Path=/`
    );
}

function clearAdminCookie(res) {
    res.setHeader(
        "Set-Cookie",
        "adminSessionId=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/"
    );
}

/* Call this before serving admin-only files or APIs. */
function requireAdmin(req, res) {
    const admin = getAdminFromSession(req);

    if (!admin) {
        sendJSON(res, 401, { error: "Admin authentication required." });
        return null;
    }

    return admin;
}

/* ------------------------------------------------------------
   ADMIN API ROUTES
   ------------------------------------------------------------ */

async function handleAdminAPI(req, res) {
    const pathname = new URL(req.url, "http://localhost").pathname;

    if (pathname === "/api/admin/login" && req.method === "POST") {
        let body;
        try {
            body = await readJSON(req);
        } catch (error) {
            sendJSON(res, 400, { error: error.message });
            return true;
        }

        const username =
            typeof body.username === "string" ? body.username.trim() : "";
        const password =
            typeof body.password === "string" ? body.password : "";

        const player = getPlayerByUsername(username);

        if (!player || !isAdminPlayer(player) || !verifyPassword(password, player.passwordHash)) {
            sendJSON(res, 401, { error: "Invalid admin credentials." });
            return true;
        }

        destroyAllAdminSessions(player.id);
        const session = createAdminSession(player.id);
        sendAdminCookie(
            res,
            session.token,
            Math.floor(ADMIN_SESSION_LENGTH_MS / 1000)
        );

        sendJSON(res, 200, {
            message: "Admin sign in successful.",
            admin: {
                id: player.id,
                username: player.username,
                rank: player.rank
            },
            expiresAt: session.expiresAt.toISOString()
        });
        return true;
    }

    if (pathname === "/api/admin/me" && req.method === "GET") {
        const admin = getAdminFromSession(req);
        if (!admin) {
            sendJSON(res, 401, { error: "Admin authentication required." });
            return true;
        }

        sendJSON(res, 200, {
            admin: {
                id: admin.id,
                username: admin.username,
                rank: admin.rank
            }
        });
        return true;
    }

    if (pathname === "/api/admin/logout" && req.method === "POST") {
        destroyAdminSession(req);
        clearAdminCookie(res);
        sendJSON(res, 200, { message: "Admin signed out." });
        return true;
    }

    if (pathname.startsWith("/api/admin/")) {
        const admin = requireAdmin(req, res);
        if (!admin) return true;

        /* Future protected admin endpoints go here. */
        sendJSON(res, 404, { error: "Admin endpoint not implemented yet." });
        return true;
    }

    return false;
}

/* ------------------------------------------------------------
   ADMIN STATIC ROUTES
   ------------------------------------------------------------

   admin-login.html is public because it is the sign-in page.
   admin.html and admin.js are protected by adminSessionId.
   admin.css is intentionally public so the login page can use it.
*/

function serveAdminStaticFile(req, res) {
    if (req.method !== "GET" && req.method !== "HEAD") return false;

    const pathname = new URL(req.url, "http://localhost").pathname;

    if (pathname === "/admin-login.html") return false;

    const protectedFiles = new Set([
        "/admin.html",
        "/admin.js"
    ]);

    if (!protectedFiles.has(pathname)) return false;

    const admin = getAdminFromSession(req);
    if (!admin) {
        res.writeHead(302, { Location: "./admin-login.html" });
        res.end();
        return true;
    }

    const filePath = path.resolve(__dirname, pathname.slice(1));
    const extension = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || "application/octet-stream";

    fs.readFile(filePath, (error, data) => {
        if (error) {
            sendText(res, error.code === "ENOENT" ? 404 : 500, "Could not load admin file.");
            return;
        }

        res.writeHead(200, {
            "Content-Type": contentType,
            "Cache-Control": "no-store"
        });

        if (req.method === "HEAD") {
            res.end();
            return;
        }

        res.end(data);
    });

    return true;
}

/* ------------------------------------------------------------
   IMPORTANT SERVER-HANDLER INTEGRATION
   ------------------------------------------------------------

   Inside the main http.createServer callback, BEFORE public
   static-file handling and BEFORE the 404 fallback, add:

       if (await handleAdminAPI(req, res)) return;
       if (serveAdminStaticFile(req, res)) return;

   Also add /admin-login.html and /admin.css to the public static
   allowlist in serveStaticFile().
*/
