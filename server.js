const http = require("http");
const fs = require("fs");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const config = require("./config.json");


// ============================================================
// DATABASE
// ============================================================

const db = new Database("./players.db");

db.pragma("journal_mode = WAL");


// ============================================================
// PLAYERS TABLE
// ============================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        passwordHash TEXT,
        rank TEXT NOT NULL DEFAULT 'Player',
        createdAt TEXT NOT NULL,
        mustChangePassword INTEGER NOT NULL DEFAULT 0
    )
`);


// ============================================================
// DATABASE MIGRATION
// ============================================================

// If players.db was created using an older version of the server,
// it won't have the mustChangePassword column.
//
// Check whether it exists and add it if necessary.

const playerColumns =
    db.prepare(`
        PRAGMA table_info(players)
    `).all();

const hasMustChangePassword =
    playerColumns.some(
        column =>
            column.name ===
            "mustChangePassword"
    );

if (!hasMustChangePassword) {

    db.exec(`
        ALTER TABLE players
        ADD COLUMN mustChangePassword
        INTEGER NOT NULL DEFAULT 0
    `);

    console.log(
        "Database updated: added mustChangePassword column."
    );
}


// ============================================================
// SESSIONS TABLE
// ============================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
        sessionId TEXT PRIMARY KEY,
        playerId INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL,

        FOREIGN KEY (playerId)
        REFERENCES players(id)
        ON DELETE CASCADE
    )
`);


// ============================================================
// PASSWORD SETTINGS
// ============================================================

// Temporary password for the two initial Owner accounts.
//
// IMPORTANT:
// This is only intended for the initial setup.
// Change the password immediately after signing in.
const TEMPORARY_OWNER_PASSWORD =
    "TEMP_CHANGE_ME";


// ============================================================
// PASSWORD FUNCTIONS
// ============================================================

function hashPassword(password) {

    const salt =
        crypto.randomBytes(16).toString("hex");

    const hash =
        crypto.scryptSync(
            password,
            salt,
            64
        ).toString("hex");

    return `${salt}:${hash}`;
}


function checkPassword(
    password,
    storedHash
) {

    if (!storedHash) {
        return false;
    }

    const parts =
        storedHash.split(":");

    if (parts.length !== 2) {
        return false;
    }

    const salt =
        parts[0];

    const storedKey =
        Buffer.from(
            parts[1],
            "hex"
        );

    const derivedKey =
        crypto.scryptSync(
            password,
            salt,
            64
        );

    if (
        storedKey.length !==
        derivedKey.length
    ) {
        return false;
    }

    return crypto.timingSafeEqual(
        storedKey,
        derivedKey
    );
}


// ============================================================
// PLAYER FUNCTIONS
// ============================================================

function getPlayerByUsername(username) {

    return db.prepare(`
        SELECT
            id,
            username,
            passwordHash,
            rank,
            createdAt,
            mustChangePassword
        FROM players
        WHERE username = ?
    `).get(username);
}


function getPlayerById(id) {

    return db.prepare(`
        SELECT
            id,
            username,
            passwordHash,
            rank,
            createdAt,
            mustChangePassword
        FROM players
        WHERE id = ?
    `).get(id);
}


function getNextPlayerId() {

    const result =
        db.prepare(`
            SELECT MAX(id) AS maxId
            FROM players
        `).get();

    if (result.maxId === null) {
        return 2;
    }

    return Math.max(
        2,
        result.maxId + 1
    );
}


// ============================================================
// PUBLIC PLAYER DATA
// ============================================================

// Never send password hashes to the client.

function publicPlayer(player) {

    return {
        id: player.id,
        username: player.username,
        rank: player.rank,
        createdAt: player.createdAt,
        mustChangePassword:
            Boolean(
                player.mustChangePassword
            )
    };
}


// ============================================================
// OWNER ACCOUNTS
// ============================================================

function setupOwners() {

    const temporaryHash =
        hashPassword(
            TEMPORARY_OWNER_PASSWORD
        );


    // --------------------------------------------------------
    // INNYGR
    // --------------------------------------------------------

    const existingInnygr =
        getPlayerById(0);


    if (!existingInnygr) {

        db.prepare(`
            INSERT INTO players
            (
                id,
                username,
                passwordHash,
                rank,
                createdAt,
                mustChangePassword
            )
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            0,
            "Innygr",
            temporaryHash,
            "Owner",
            new Date().toISOString(),
            1
        );

        console.log(
            "Created Owner account: Innygr"
        );
    }


    // --------------------------------------------------------
    // MYTHIC
    // --------------------------------------------------------

    const existingMythic =
        getPlayerById(1);


    if (!existingMythic) {

        db.prepare(`
            INSERT INTO players
            (
                id,
                username,
                passwordHash,
                rank,
                createdAt,
                mustChangePassword
            )
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            1,
            "Mythic",
            temporaryHash,
            "Owner",
            new Date().toISOString(),
            1
        );

        console.log(
            "Created Owner account: Mythic"
        );
    }
}


setupOwners();


// ============================================================
// SESSIONS
// ============================================================

const SESSION_LENGTH_MS =
    7 * 24 * 60 * 60 * 1000;


// ------------------------------------------------------------
// CREATE SESSION
// ------------------------------------------------------------

function createSession(playerId) {

    const sessionId =
        crypto.randomBytes(32).toString("hex");

    const createdAt =
        new Date();

    const expiresAt =
        new Date(
            createdAt.getTime() +
            SESSION_LENGTH_MS
        );


    db.prepare(`
        INSERT INTO sessions
        (
            sessionId,
            playerId,
            createdAt,
            expiresAt
        )
        VALUES (?, ?, ?, ?)
    `).run(
        sessionId,
        playerId,
        createdAt.toISOString(),
        expiresAt.toISOString()
    );


    return {
        sessionId,
        expiresAt
    };
}


// ------------------------------------------------------------
// GET SESSION ID FROM COOKIE
// ------------------------------------------------------------

function getSessionIdFromCookies(req) {

    const cookieHeader =
        req.headers.cookie;

    if (!cookieHeader) {
        return null;
    }


    const cookies =
        cookieHeader
            .split(";")
            .map(
                cookie =>
                    cookie.trim()
            );


    for (const cookie of cookies) {

        const separator =
            cookie.indexOf("=");

        if (separator === -1) {
            continue;
        }


        const name =
            cookie.substring(
                0,
                separator
            );

        const value =
            cookie.substring(
                separator + 1
            );


        if (name === "sessionId") {

            try {

                return decodeURIComponent(
                    value
                );

            } catch {

                return null;
            }
        }
    }


    return null;
}


// ------------------------------------------------------------
// GET PLAYER FROM SESSION
// ------------------------------------------------------------

function getPlayerFromSession(req) {

    const sessionId =
        getSessionIdFromCookies(req);

    if (!sessionId) {
        return null;
    }


    const session =
        db.prepare(`
            SELECT
                sessionId,
                playerId,
                createdAt,
                expiresAt
            FROM sessions
            WHERE sessionId = ?
        `).get(sessionId);


    if (!session) {
        return null;
    }


    const now =
        new Date();

    const expiresAt =
        new Date(
            session.expiresAt
        );


    // Session expired.
    if (expiresAt <= now) {

        db.prepare(`
            DELETE FROM sessions
            WHERE sessionId = ?
        `).run(sessionId);

        return null;
    }


    const player =
        getPlayerById(
            session.playerId
        );


    if (!player) {

        db.prepare(`
            DELETE FROM sessions
            WHERE sessionId = ?
        `).run(sessionId);

        return null;
    }


    return player;
}


// ------------------------------------------------------------
// DESTROY CURRENT SESSION
// ------------------------------------------------------------

function destroySession(req) {

    const sessionId =
        getSessionIdFromCookies(req);

    if (!sessionId) {
        return;
    }


    db.prepare(`
        DELETE FROM sessions
        WHERE sessionId = ?
    `).run(sessionId);
}


// ------------------------------------------------------------
// DESTROY ALL SESSIONS FOR PLAYER
// ------------------------------------------------------------

function destroyAllPlayerSessions(
    playerId
) {

    db.prepare(`
        DELETE FROM sessions
        WHERE playerId = ?
    `).run(playerId);
}


// ------------------------------------------------------------
// CLEAN EXPIRED SESSIONS
// ------------------------------------------------------------

function cleanExpiredSessions() {

    db.prepare(`
        DELETE FROM sessions
        WHERE expiresAt <= ?
    `).run(
        new Date().toISOString()
    );
}


setInterval(
    cleanExpiredSessions,
    60 * 60 * 1000
);


// ============================================================
// HTTP RESPONSE FUNCTIONS
// ============================================================

function sendJSON(
    res,
    statusCode,
    data
) {

    res.writeHead(
        statusCode,
        {
            "Content-Type":
                "application/json",

            "Cache-Control":
                "no-store"
        }
    );

    res.end(
        JSON.stringify(data)
    );
}


function sendText(
    res,
    statusCode,
    text
) {

    res.writeHead(
        statusCode,
        {
            "Content-Type":
                "text/plain"
        }
    );

    res.end(text);
}


// ============================================================
// READ JSON BODY
// ============================================================

function readJSON(req) {

    return new Promise(
        (resolve, reject) => {

            let body = "";


            req.on(
                "data",
                chunk => {

                    body += chunk;


                    // Prevent enormous request bodies.
                    if (
                        body.length >
                        100000
                    ) {

                        reject(
                            new Error(
                                "Request body too large."
                            )
                        );

                        req.destroy();
                    }
                }
            );


            req.on(
                "end",
                () => {

                    if (!body) {

                        resolve({});

                        return;
                    }


                    try {

                        resolve(
                            JSON.parse(body)
                        );

                    } catch {

                        reject(
                            new Error(
                                "Invalid JSON."
                            )
                        );
                    }
                }
            );


            req.on(
                "error",
                reject
            );
        }
    );
}


// ============================================================
// SERVER
// ============================================================

const server =
    http.createServer(
        async (req, res) => {

            try {

                // ====================================================
                // TEST PAGE
                // ====================================================

                if (
                    req.url === "/" &&
                    req.method === "GET"
                ) {

                    fs.readFile(
                        "./test.html",
                        (err, data) => {

                            if (err) {

                                sendText(
                                    res,
                                    500,
                                    "Could not load test page."
                                );

                                return;
                            }


                            res.writeHead(
                                200,
                                {
                                    "Content-Type":
                                        "text/html"
                                }
                            );

                            res.end(data);
                        }
                    );

                    return;
                }


                // ====================================================
                // PROFILE PAGE
                // ====================================================

                if (
                    req.url === "/profile" &&
                    req.method === "GET"
                ) {

                    fs.readFile(
                        "./profile.html",
                        (err, data) => {

                            if (err) {

                                sendText(
                                    res,
                                    500,
                                    "Could not load profile page."
                                );

                                return;
                            }


                            res.writeHead(
                                200,
                                {
                                    "Content-Type":
                                        "text/html"
                                }
                            );

                            res.end(data);
                        }
                    );

                    return;
                }


                // ====================================================
                // SERVER STATUS
                // ====================================================

                if (
                    req.url === "/api/status" &&
                    req.method === "GET"
                ) {

                    sendJSON(
                        res,
                        200,
                        {
                            online: true,
                            game: "Card Stuff Yes"
                        }
                    );

                    return;
                }


                // ====================================================
                // PLAYER LIST
                // ====================================================

                if (
                    req.url === "/api/players" &&
                    req.method === "GET"
                ) {

                    const players =
                        db.prepare(`
                            SELECT
                                id,
                                username,
                                rank,
                                createdAt,
                                mustChangePassword
                            FROM players
                            ORDER BY id ASC
                        `).all();


                    const safePlayers =
                        players.map(
                            publicPlayer
                        );


                    sendJSON(
                        res,
                        200,
                        {
                            players:
                                safePlayers
                        }
                    );

                    return;
                }


                // ====================================================
                // REGISTER
                // ====================================================

                if (
                    req.url ===
                        "/api/auth/register" &&
                    req.method === "POST"
                ) {

                    let body;


                    try {

                        body =
                            await readJSON(req);

                    } catch (error) {

                        sendJSON(
                            res,
                            400,
                            {
                                error:
                                    error.message
                            }
                        );

                        return;
                    }


                    const username =
                        typeof body.username ===
                        "string"
                            ? body.username.trim()
                            : "";


                    const password =
                        typeof body.password ===
                        "string"
                            ? body.password
                            : "";


                    if (
                        !username ||
                        !password
                    ) {

                        sendJSON(
                            res,
                            400,
                            {
                                error:
                                    "Username and password are required."
                            }
                        );

                        return;
                    }


                    if (
                        username.length < 3
                    ) {

                        sendJSON(
                            res,
                            400,
                            {
                                error:
                                    "Username must be at least 3 characters."
                            }
                        );

                        return;
                    }


                    if (
                        username.length > 32
                    ) {

                        sendJSON(
                            res,
                            400,
                            {
                                error:
                                    "Username must be 32 characters or less."
                            }
                        );

                        return;
                    }


                    if (
                        password.length < 6
                    ) {

                        sendJSON(
                            res,
                            400,
                            {
                                error:
                                    "Password must be at least 6 characters."
                            }
                        );

                        return;
                    }


                    const existing =
                        getPlayerByUsername(
                            username
                        );


                    if (existing) {

                        sendJSON(
                            res,
                            409,
                            {
                                error:
                                    "Username already exists. Please sign in."
                            }
                        );

                        return;
                    }


                    const id =
                        getNextPlayerId();


                    const passwordHash =
                        hashPassword(
                            password
                        );


                    const createdAt =
                        new Date().toISOString();


                    db.prepare(`
                        INSERT INTO players
                        (
                            id,
                            username,
                            passwordHash,
                            rank,
                            createdAt,
                            mustChangePassword
                        )
                        VALUES (?, ?, ?, ?, ?, ?)
                    `).run(
                        id,
                        username,
                        passwordHash,
                        "Player",
                        createdAt,
                        0
                    );


                    const player =
                        getPlayerById(id);


                    sendJSON(
                        res,
                        201,
                        {
                            message:
                                "Account created.",

                            player:
                                publicPlayer(
                                    player
                                )
                        }
                    );

                    return;
                }


                // ====================================================
                // LOGIN
                // ====================================================

                if (
                    req.url ===
                        "/api/auth/login" &&
                    req.method === "POST"
                ) {

                    let body;


                    try {

                        body =
                            await readJSON(req);

                    } catch (error) {

                        sendJSON(
                            res,
                            400,
                            {
                                error:
                                    error.message
                            }
                        );

                        return;
                    }


                    const username =
                        typeof body.username ===
                        "string"
                            ? body.username.trim()
                            : "";


                    const password =
                        typeof body.password ===
                        "string"
                            ? body.password
                            : "";


                    if (
                        !username ||
                        !password
                    ) {

                        sendJSON(
                            res,
                            400,
                            {
                                error:
                                    "Username and password are required."
                            }
                        );

                        return;
                    }


                    const player =
                        getPlayerByUsername(
                            username
                        );


                    if (!player) {

                        sendJSON(
                            res,
                            401,
                            {
                                error:
                                    "Invalid username or password."
                            }
                        );

                        return;
                    }


                    const valid =
                        checkPassword(
                            password,
                            player.passwordHash
                        );


                    if (!valid) {

                        sendJSON(
                            res,
                            401,
                            {
                                error:
                                    "Invalid username or password."
                            }
                        );

                        return;
                    }


                    // =================================================
                    // CREATE SESSION
                    // =================================================

                    const session =
                        createSession(
                            player.id
                        );


                    // The cookie is:
                    //
                    // HttpOnly
                    // Secure
                    // SameSite=Lax
                    //
                    // Your Cloudflare Quick Tunnel uses HTTPS,
                    // so Secure works for remote access.
                    //
                    // If we later test directly over HTTP on the
                    // LAN, we can make this configurable.

                    res.setHeader(
                        "Set-Cookie",
                        `sessionId=${encodeURIComponent(session.sessionId)}; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_LENGTH_MS / 1000}; Path=/`
                    );


                    sendJSON(
                        res,
                        200,
                        {
                            message:
                                "Signed in.",

                            player:
                                publicPlayer(
                                    player
                                ),

                            expiresAt:
                                session.expiresAt
                                    .toISOString()
                        }
                    );

                    return;
                }


                // ====================================================
                // CURRENT USER
                // ====================================================

                if (
                    req.url === "/api/me" &&
                    req.method === "GET"
                ) {

                    const player =
                        getPlayerFromSession(
                            req
                        );


                    if (!player) {

                        sendJSON(
                            res,
                            401,
                            {
                                error:
                                    "Not signed in."
                            }
                        );

                        return;
                    }


                    sendJSON(
                        res,
                        200,
                        {
                            player:
                                publicPlayer(
                                    player
                                )
                        }
                    );

                    return;
                }


                // ====================================================
                // CHANGE PASSWORD
                // ====================================================

                if (
                    req.url ===
                        "/api/auth/change-password" &&
                    req.method === "POST"
                ) {

                    // The user MUST already be signed in.
                    const player =
                        getPlayerFromSession(
                            req
                        );


                    if (!player) {

                        sendJSON(
                            res,
                            401,
                            {
                                error:
                                    "You must be signed in to change your password."
                            }
                        );

                        return;
                    }


                    let body;


                    try {

                        body =
                            await readJSON(req);

                    } catch (error) {

                        sendJSON(
                            res,
                            400,
                            {
                                error:
                                    error.message
                            }
                        );

                        return;
                    }


                    const currentPassword =
                        typeof body.currentPassword ===
                        "string"
                            ? body.currentPassword
                            : "";


                    const newPassword =
                        typeof body.newPassword ===
                        "string"
                            ? body.newPassword
                            : "";


                    if (
                        !currentPassword ||
                        !newPassword
                    ) {

                        sendJSON(
                            res,
                            400,
                            {
                                error:
                                    "Current password and new password are required."
                            }
                        );

                        return;
                    }


                    // Verify the current password.
                    const valid =
                        checkPassword(
                            currentPassword,
                            player.passwordHash
                        );


                    if (!valid) {

                        sendJSON(
                            res,
                            401,
                            {
                                error:
                                    "Current password is incorrect."
                            }
                        );

                        return;
                    }


                    if (
                        newPassword.length < 6
                    ) {

                        sendJSON(
                            res,
                            400,
                            {
                                error:
                                    "New password must be at least 6 characters."
                            }
                        );

                        return;
                    }


                    if (
                        newPassword.length > 256
                    ) {

                        sendJSON(
                            res,
                            400,
                            {
                                error:
                                    "New password is too long."
                            }
                        );

                        return;
                    }


                    // Don't allow the temporary password
                    // to be used as the new permanent password.
                    if (
                        newPassword ===
                        TEMPORARY_OWNER_PASSWORD
                    ) {

                        sendJSON(
                            res,
                            400,
                            {
                                error:
                                    "You must choose a different password."
                            }
                        );

                        return;
                    }


                    const newPasswordHash =
                        hashPassword(
                            newPassword
                        );


                    // Update password and remove the
                    // temporary-password requirement.
                    db.prepare(`
                        UPDATE players
                        SET
                            passwordHash = ?,
                            mustChangePassword = 0
                        WHERE id = ?
                    `).run(
                        newPasswordHash,
                        player.id
                    );


                    // Invalidate every session belonging
                    // to this account.
                    //
                    // This means changing the password
                    // logs the account out everywhere.
                    destroyAllPlayerSessions(
                        player.id
                    );


                    sendJSON(
                        res,
                        200,
                        {
                            message:
                                "Password changed successfully. Please sign in again."
                        }
                    );

                    return;
                }


                // ====================================================
                // LOGOUT
                // ====================================================

                if (
                    req.url ===
                        "/api/auth/logout" &&
                    req.method === "POST"
                ) {

                    destroySession(req);


                    res.setHeader(
                        "Set-Cookie",
                        "sessionId=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/"
                    );


                    sendJSON(
                        res,
                        200,
                        {
                            message:
                                "Signed out."
                        }
                    );

                    return;
                }


                // ====================================================
                // 404
                // ====================================================

                sendJSON(
                    res,
                    404,
                    {
                        error:
                            "Not found."
                    }
                );

            } catch (error) {

                console.error(error);


                if (!res.headersSent) {

                    sendJSON(
                        res,
                        500,
                        {
                            error:
                                "Internal server error."
                        }
                    );
                }
            }
        }
    );


// ============================================================
// START SERVER
// ============================================================

server.listen(
    config.port,
    config.host,
    () => {

        console.log(
            `Card Stuff Yes server running at http://${config.host}:${config.port}`
        );

        console.log(
            "SQLite database: players.db"
        );
    }
);
