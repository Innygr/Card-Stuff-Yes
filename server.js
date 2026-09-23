/* ============================================================
   CARD STUFF YES — SERVER
   ============================================================

   Server foundation.

   Responsibilities currently implemented:
   - Serve website files
   - Player accounts
   - Password hashing
   - Login sessions
   - Player lookup
   - Badges
   - Unlocked cards
   - Player decks
   - Basic server status
   - Profile API
   - Secure static-file serving

   Card-library / Set Manager rules are intentionally kept
   separate and will be added during #3.
   ============================================================ */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");


/* ============================================================
   CONFIGURATION
   ============================================================ */

const CONFIG_PATH =
    path.resolve(
        __dirname,
        "config.json"
    );


let config = {};

try {

    config =
        JSON.parse(
            fs.readFileSync(
                CONFIG_PATH,
                "utf8"
            )
        );

} catch (error) {

    console.warn(
        "Could not load config.json. Using defaults."
    );

}


const HOST =
    typeof config.host === "string"
        ? config.host
        : "127.0.0.1";


const PORT =
    Number.isInteger(config.port)
        ? config.port
        : 6565;


const MAX_PLAYERS_PER_GAME =
    Number.isInteger(
        config.maxPlayersPerGame
    )
        ? config.maxPlayersPerGame
        : 4;


/* ============================================================
   PATHS
   ============================================================ */

const WEBSITE_DIRECTORY =
    path.resolve(__dirname);


const ASSETS_DIRECTORY =
    path.resolve(
        __dirname,
        "assets"
    );


const DATABASE_PATH =
    path.resolve(
        __dirname,
        "players.db"
    );


/* ============================================================
   DATABASE
   ============================================================ */

const db =
    new Database(
        DATABASE_PATH
    );


db.pragma(
    "journal_mode = WAL"
);


db.pragma(
    "foreign_keys = ON"
);


/* ============================================================
   PLAYER TABLE
   ============================================================ */

db.exec(`
    CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        passwordHash TEXT NOT NULL,
        rank TEXT NOT NULL DEFAULT 'Player',
        elo INTEGER NOT NULL DEFAULT 1000,
        createdAt TEXT NOT NULL,
        mustChangePassword INTEGER NOT NULL DEFAULT 0
    )
`);


/* ============================================================
   PLAYER MIGRATION
   ============================================================ */

const playerColumns =
    db.prepare(
        "PRAGMA table_info(players)"
    ).all();


if (
    !playerColumns.some(
        column =>
            column.name === "elo"
    )
) {

    db.exec(`
        ALTER TABLE players
        ADD COLUMN elo INTEGER NOT NULL DEFAULT 1000
    `);

}


if (
    !playerColumns.some(
        column =>
            column.name ===
            "mustChangePassword"
    )
) {

    db.exec(`
        ALTER TABLE players
        ADD COLUMN mustChangePassword
        INTEGER NOT NULL DEFAULT 0
    `);

}


/* ============================================================
   SESSIONS
   ============================================================ */

db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
        tokenHash TEXT PRIMARY KEY,
        playerId INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL,

        FOREIGN KEY (playerId)
            REFERENCES players(id)
            ON DELETE CASCADE
    )
`);


/* ============================================================
   BADGES
   ============================================================ */

db.exec(`
    CREATE TABLE IF NOT EXISTS badges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        imagePath TEXT NOT NULL
    )
`);


db.exec(`
    CREATE TABLE IF NOT EXISTS player_badges (
        playerId INTEGER NOT NULL,
        badgeId INTEGER NOT NULL,

        PRIMARY KEY (
            playerId,
            badgeId
        ),

        FOREIGN KEY (playerId)
            REFERENCES players(id)
            ON DELETE CASCADE,

        FOREIGN KEY (badgeId)
            REFERENCES badges(id)
            ON DELETE CASCADE
    )
`);


/* ============================================================
   UNLOCKED CARDS
   ============================================================ */

db.exec(`
    CREATE TABLE IF NOT EXISTS player_unlocked_cards (
        playerId INTEGER NOT NULL,
        cardId TEXT NOT NULL,

        PRIMARY KEY (
            playerId,
            cardId
        ),

        FOREIGN KEY (playerId)
            REFERENCES players(id)
            ON DELETE CASCADE
    )
`);


/* ============================================================
   PLAYER DECK
   ============================================================ */

db.exec(`
    CREATE TABLE IF NOT EXISTS player_deck (
        playerId INTEGER PRIMARY KEY,
        cards TEXT NOT NULL DEFAULT '[]',

        FOREIGN KEY (playerId)
            REFERENCES players(id)
            ON DELETE CASCADE
    )
`);


/* ============================================================
   SEASONS
   ============================================================ */

db.exec(`
    CREATE TABLE IF NOT EXISTS seasons (
        id TEXT PRIMARY KEY,
        startedAt TEXT NOT NULL,
        endedAt TEXT
    )
`);


db.exec(`
    CREATE TABLE IF NOT EXISTS season_results (
        seasonId TEXT NOT NULL,
        playerId INTEGER NOT NULL,
        finalElo INTEGER NOT NULL,
        finalRank INTEGER NOT NULL,

        PRIMARY KEY (
            seasonId,
            playerId
        ),

        FOREIGN KEY (seasonId)
            REFERENCES seasons(id)
            ON DELETE CASCADE,

        FOREIGN KEY (playerId)
            REFERENCES players(id)
            ON DELETE CASCADE
    )
`);


/* ============================================================
   PASSWORD SETTINGS
   ============================================================ */

const PASSWORD_HASH_BYTES = 64;
const PASSWORD_SALT_BYTES = 16;
const SESSION_TOKEN_BYTES = 32;

const SESSION_LENGTH_MS =
    7 * 24 * 60 * 60 * 1000;


/* ============================================================
   PASSWORD HASHING
   ============================================================ */

function hashPassword(password) {

    if (
        typeof password !== "string" ||
        password.length === 0
    ) {

        throw new Error(
            "Password must be a non-empty string."
        );

    }


    const salt =
        crypto.randomBytes(
            PASSWORD_SALT_BYTES
        );


    const hash =
        crypto.scryptSync(
            password,
            salt,
            PASSWORD_HASH_BYTES
        );


    return [
        "scrypt",
        salt.toString("hex"),
        hash.toString("hex")
    ].join(":");
}


/* ============================================================
   PASSWORD VERIFICATION
   ============================================================ */

function verifyPassword(
    password,
    storedHash
) {

    if (
        typeof password !== "string" ||
        typeof storedHash !== "string"
    ) {

        return false;

    }


    const parts =
        storedHash.split(":");


    if (
        parts.length !== 3 ||
        parts[0] !== "scrypt"
    ) {

        return false;

    }


    try {

        const salt =
            Buffer.from(
                parts[1],
                "hex"
            );


        const expectedHash =
            Buffer.from(
                parts[2],
                "hex"
            );


        const actualHash =
            crypto.scryptSync(
                password,
                salt,
                expectedHash.length
            );


        if (
            actualHash.length !==
            expectedHash.length
        ) {

            return false;

        }


        return crypto.timingSafeEqual(
            actualHash,
            expectedHash
        );

    } catch {

        return false;

    }

}


/* ============================================================
   SESSION TOKENS
   ============================================================ */

function createSessionToken() {

    return crypto
        .randomBytes(
            SESSION_TOKEN_BYTES
        )
        .toString("hex");

}


function hashSessionToken(token) {

    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

}


function createSession(playerId) {

    const token =
        createSessionToken();


    const tokenHash =
        hashSessionToken(
            token
        );


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
            tokenHash,
            playerId,
            createdAt,
            expiresAt
        )
        VALUES (?, ?, ?, ?)
    `).run(
        tokenHash,
        playerId,
        createdAt.toISOString(),
        expiresAt.toISOString()
    );


    return {
        token,
        expiresAt
    };

}


/* ============================================================
   TIME
   ============================================================ */

function nowISO() {

    return new Date().toISOString();

}


/* ============================================================
   PLAYER LOOKUPS
   ============================================================ */

function getPlayerByUsername(
    username
) {

    return db.prepare(`
        SELECT
            id,
            username,
            passwordHash,
            rank,
            elo,
            createdAt,
            mustChangePassword
        FROM players
        WHERE username = ?
    `).get(username);

}


function getPlayerById(
    playerId
) {

    return db.prepare(`
        SELECT
            id,
            username,
            passwordHash,
            rank,
            elo,
            createdAt,
            mustChangePassword
        FROM players
        WHERE id = ?
    `).get(playerId);

}


/* ============================================================
   PLAYER ID
   ============================================================ */

function getNextPlayerId() {

    const row =
        db.prepare(`
            SELECT
                COALESCE(
                    MAX(id),
                    0
                ) + 1 AS nextId
            FROM players
        `).get();


    return row.nextId;

}


/* ============================================================
   BADGES
   ============================================================ */

function getPlayerBadges(
    playerId
) {

    const player =
        getPlayerById(
            playerId
        );


    if (!player) {
        return [];
    }


    const badges = [];


    const normalizedRank =
        player.rank.toLowerCase();


    if (
        normalizedRank ===
        "owner"
    ) {

        badges.push({
            name: "Owner",
            image:
                "./assets/badges/owner.png",
            type: "rank"
        });

    }


    if (
        normalizedRank === "mod" ||
        normalizedRank === "moderator"
    ) {

        badges.push({
            name: "Moderator",
            image:
                "./assets/badges/moderator.png",
            type: "rank"
        });

    }


    const specialBadges =
        db.prepare(`
            SELECT
                badges.id,
                badges.name,
                badges.imagePath
            FROM player_badges
            INNER JOIN badges
                ON badges.id =
                   player_badges.badgeId
            WHERE player_badges.playerId = ?
            ORDER BY badges.id ASC
        `).all(playerId);


    for (
        const badge of specialBadges
    ) {

        badges.push({
            id: badge.id,
            name: badge.name,
            image: badge.imagePath,
            type: "special"
        });

    }


    return badges;

}


/* ============================================================
   UNLOCKED CARDS
   ============================================================ */

function getUnlockedCards(
    playerId
) {

    const rows =
        db.prepare(`
            SELECT cardId
            FROM player_unlocked_cards
            WHERE playerId = ?
            ORDER BY cardId ASC
        `).all(playerId);


    return rows.map(
        row => row.cardId
    );

}


function playerHasCard(
    playerId,
    cardId
) {

    const row =
        db.prepare(`
            SELECT 1
            FROM player_unlocked_cards
            WHERE playerId = ?
              AND cardId = ?
            LIMIT 1
        `).get(
            playerId,
            cardId
        );


    return Boolean(row);

}


/* ============================================================
   DECK
   ============================================================ */

function getPlayerDeck(
    playerId
) {

    const row =
        db.prepare(`
            SELECT cards
            FROM player_deck
            WHERE playerId = ?
        `).get(playerId);


    if (!row) {
        return [];
    }


    try {

        const cards =
            JSON.parse(
                row.cards
            );


        return Array.isArray(cards)
            ? cards
            : [];

    } catch {

        return [];

    }

}


/* ============================================================
   DECK VALIDATION
   ============================================================ */

function validateDeck(
    playerId,
    cards
) {

    if (!Array.isArray(cards)) {

        return {
            valid: false,
            error:
                "Deck must be an array."
        };

    }


    /* --------------------------------------------------------
       ACTUAL BASE DECK RULE
       -------------------------------------------------------- */

    if (cards.length !== 60) {

        return {
            valid: false,
            error:
                "Deck must contain exactly 60 cards."
        };

    }


    const copies =
        new Map();


    for (
        const cardId of cards
    ) {

        if (
            typeof cardId !== "string" ||
            !cardId.trim()
        ) {

            return {
                valid: false,
                error:
                    "Every deck card must have a valid card ID."
            };

        }


        if (
            cardId.length > 128
        ) {

            return {
                valid: false,
                error:
                    "A card ID is too long."
            };

        }


        const count =
            (copies.get(cardId) || 0) + 1;


        if (count > 4) {

            return {
                valid: false,
                error:
                    `Card "${cardId}" cannot appear more than 4 times.`
            };

        }


        copies.set(
            cardId,
            count
        );


        if (
            !playerHasCard(
                playerId,
                cardId
            )
        ) {

            return {
                valid: false,
                error:
                    `You have not unlocked card "${cardId}".`
            };

        }

    }


    return {
        valid: true
    };

}


/* ============================================================
   PUBLIC PLAYER DATA
   ============================================================ */

function publicPlayer(
    player
) {

    if (!player) {
        return null;
    }


    return {
        id: player.id,
        username: player.username,
        rank: player.rank,
        elo: player.elo,
        createdAt: player.createdAt,

        mustChangePassword:
            Boolean(
                player.mustChangePassword
            ),

        badges:
            getPlayerBadges(
                player.id
            ),

        unlockedCards:
            getUnlockedCards(
                player.id
            ),

        deck:
            getPlayerDeck(
                player.id
            )
    };

}


/* ============================================================
   COOKIES
   ============================================================ */

function getSessionTokenFromCookies(
    req
) {

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


    for (
        const cookie of cookies
    ) {

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


        if (
            name !== "sessionId"
        ) {

            continue;

        }


        try {

            return decodeURIComponent(
                value
            );

        } catch {

            return null;

        }

    }


    return null;

}


/* ============================================================
   SESSION LOOKUP
   ============================================================ */

function getPlayerFromSession(
    req
) {

    const token =
        getSessionTokenFromCookies(
            req
        );


    if (!token) {
        return null;
    }


    const tokenHash =
        hashSessionToken(
            token
        );


    const session =
        db.prepare(`
            SELECT
                tokenHash,
                playerId,
                createdAt,
                expiresAt
            FROM sessions
            WHERE tokenHash = ?
        `).get(tokenHash);


    if (!session) {
        return null;
    }


    const expiresAt =
        new Date(
            session.expiresAt
        );


    if (
        Number.isNaN(
            expiresAt.getTime()
        ) ||
        expiresAt <= new Date()
    ) {

        db.prepare(`
            DELETE FROM sessions
            WHERE tokenHash = ?
        `).run(tokenHash);


        return null;

    }


    const player =
        getPlayerById(
            session.playerId
        );


    if (!player) {

        db.prepare(`
            DELETE FROM sessions
            WHERE tokenHash = ?
        `).run(tokenHash);


        return null;

    }


    return player;

}


/* ============================================================
   SESSION DESTRUCTION
   ============================================================ */

function destroySession(
    req
) {

    const token =
        getSessionTokenFromCookies(
            req
        );


    if (!token) {
        return;
    }


    const tokenHash =
        hashSessionToken(
            token
        );


    db.prepare(`
        DELETE FROM sessions
        WHERE tokenHash = ?
    `).run(tokenHash);

}


function destroyAllPlayerSessions(
    playerId
) {

    db.prepare(`
        DELETE FROM sessions
        WHERE playerId = ?
    `).run(playerId);

}


/* ============================================================
   SESSION CLEANUP
   ============================================================ */

function cleanExpiredSessions() {

    db.prepare(`
        DELETE FROM sessions
        WHERE expiresAt <= ?
    `).run(
        nowISO()
    );

}


setInterval(
    cleanExpiredSessions,
    60 * 60 * 1000
);


/* ============================================================
   RESPONSES
   ============================================================ */

function sendJSON(
    res,
    statusCode,
    data
) {

    res.writeHead(
        statusCode,
        {
            "Content-Type":
                "application/json; charset=utf-8",

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
                "text/plain; charset=utf-8"
        }
    );


    res.end(text);

}


/* ============================================================
   MIME TYPES
   ============================================================ */

const MIME_TYPES = {

    ".html":
        "text/html; charset=utf-8",

    ".css":
        "text/css; charset=utf-8",

    ".js":
        "application/javascript; charset=utf-8",

    ".json":
        "application/json; charset=utf-8",

    ".png":
        "image/png",

    ".jpg":
        "image/jpeg",

    ".jpeg":
        "image/jpeg",

    ".webp":
        "image/webp",

    ".gif":
        "image/gif",

    ".svg":
        "image/svg+xml",

    ".ico":
        "image/x-icon"

};


/* ============================================================
   STATIC WEBSITE FILES
   ============================================================ */

const ALLOWED_WEBSITE_FILES =
    new Set([

        "/index.html",

        "/colors.css",

        "/profile.html",
        "/profile.css",
        "/profile.js",

        "/cardgame.html",
        "/cardgame.css",
        "/cardgame.js",

        "/test.html"

    ]);


/* ============================================================
   STATIC FILE SERVING
   ============================================================ */

function serveStaticFile(
    req,
    res
) {

    if (
        req.method !== "GET" &&
        req.method !== "HEAD"
    ) {

        return false;

    }


    let pathname;


    try {

        pathname =
            new URL(
                req.url,
                "http://localhost"
            ).pathname;


        pathname =
            decodeURIComponent(
                pathname
            );

    } catch {

        sendText(
            res,
            400,
            "Invalid file path."
        );


        return true;

    }


    let filePath = null;


    if (
        ALLOWED_WEBSITE_FILES.has(
            pathname
        )
    ) {

        filePath =
            path.resolve(
                WEBSITE_DIRECTORY,
                pathname.substring(1)
            );

    } else if (
        pathname.startsWith(
            "/assets/"
        )
    ) {

        const relativeAssetPath =
            pathname.substring(
                "/assets/".length
            );


        filePath =
            path.resolve(
                ASSETS_DIRECTORY,
                relativeAssetPath
            );


        const assetsPrefix =
            ASSETS_DIRECTORY +
            path.sep;


        if (
            !filePath.startsWith(
                assetsPrefix
            )
        ) {

            sendText(
                res,
                403,
                "Forbidden."
            );


            return true;

        }

    } else {

        return false;

    }


    const extension =
        path.extname(
            filePath
        ).toLowerCase();


    const contentType =
        MIME_TYPES[
            extension
        ];


    if (!contentType) {

        sendText(
            res,
            415,
            "Unsupported file type."
        );


        return true;

    }


    fs.readFile(
        filePath,
        (error, data) => {

            if (error) {

                if (
                    error.code ===
                    "ENOENT"
                ) {

                    sendText(
                        res,
                        404,
                        "File not found."
                    );

                } else {

                    console.error(
                        "Static file error:",
                        error
                    );


                    sendText(
                        res,
                        500,
                        "Could not load file."
                    );

                }


                return;

            }


            res.writeHead(
                200,
                {
                    "Content-Type":
                        contentType,

                    "Cache-Control":
                        "no-cache"
                }
            );


            if (
                req.method ===
                "HEAD"
            ) {

                res.end();

                return;

            }


            res.end(data);

        }
    );


    return true;

}


/* ============================================================
   JSON BODY
   ============================================================ */

function readJSON(
    req
) {

    return new Promise(
        (resolve, reject) => {

            let body = "";


            req.on(
                "data",
                chunk => {

                    body += chunk;


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
                            JSON.parse(
                                body
                            )
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


/* ============================================================
   SERVER
   ============================================================ */

const server =
    http.createServer(
        async (
            req,
            res
        ) => {

            try {

                const url =
                    new URL(
                        req.url,
                        `http://${HOST}:${PORT}`
                    );


                const pathname =
                    url.pathname;


                /* =================================================
                   PROFILE
                   ================================================= */

                if (
                    (
                        pathname ===
                        "/profile" ||
                        pathname ===
                        "/profile.html"
                    ) &&
                    req.method === "GET"
                ) {

                    const filePath =
                        path.resolve(
                            WEBSITE_DIRECTORY,
                            "profile.html"
                        );


                    fs.readFile(
                        filePath,
                        (error, data) => {

                            if (error) {

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
                                        "text/html; charset=utf-8"
                                }
                            );


                            res.end(data);

                        }
                    );


                    return;

                }


                /* =================================================
                   ROOT
                   ================================================= */

                if (
                    pathname === "/" &&
                    req.method === "GET"
                ) {

                    const filePath =
                        path.resolve(
                            WEBSITE_DIRECTORY,
                            "index.html"
                        );


                    fs.readFile(
                        filePath,
                        (error, data) => {

                            if (error) {

                                sendText(
                                    res,
                                    500,
                                    "Could not load homepage."
                                );


                                return;

                            }


                            res.writeHead(
                                200,
                                {
                                    "Content-Type":
                                        "text/html; charset=utf-8"
                                }
                            );


                            res.end(data);

                        }
                    );


                    return;

                }


                /* =================================================
                   STATIC FILES
                   ================================================= */

                if (
                    serveStaticFile(
                        req,
                        res
                    )
                ) {

                    return;

                }


                /* =================================================
                   STATUS
                   ================================================= */

                if (
                    pathname ===
                        "/api/status" &&
                    req.method === "GET"
                ) {

                    sendJSON(
                        res,
                        200,
                        {
                            online: true,
                            game:
                                "Card Stuff Yes"
                        }
                    );


                    return;

                }


                /* =================================================
                   REGISTER
                   ================================================= */

                if (
                    pathname ===
                        "/api/auth/register" &&
                    req.method === "POST"
                ) {

                    let body;


                    try {

                        body =
                            await readJSON(
                                req
                            );

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
                        username.length < 3 ||
                        username.length > 32
                    ) {

                        sendJSON(
                            res,
                            400,
                            {
                                error:
                                    "Username must be between 3 and 32 characters."
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


                    if (
                        getPlayerByUsername(
                            username
                        )
                    ) {

                        sendJSON(
                            res,
                            409,
                            {
                                error:
                                    "Username already exists."
                            }
                        );


                        return;

                    }


                    const playerId =
                        getNextPlayerId();


                    db.prepare(`
                        INSERT INTO players
                        (
                            id,
                            username,
                            passwordHash,
                            rank,
                            elo,
                            createdAt,
                            mustChangePassword
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        playerId,
                        username,
                        hashPassword(
                            password
                        ),
                        "Player",
                        1000,
                        nowISO(),
                        0
                    );


                    sendJSON(
                        res,
                        201,
                        {
                            message:
                                "Account created.",

                            player:
                                publicPlayer(
                                    getPlayerById(
                                        playerId
                                    )
                                )
                        }
                    );


                    return;

                }


                /* =================================================
                   LOGIN
                   ================================================= */

                if (
                    pathname ===
                        "/api/auth/login" &&
                    req.method === "POST"
                ) {

                    let body;


                    try {

                        body =
                            await readJSON(
                                req
                            );

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


                    const player =
                        getPlayerByUsername(
                            username
                        );


                    if (
                        !player ||
                        !verifyPassword(
                            password,
                            player.passwordHash
                        )
                    ) {

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


                    const session =
                        createSession(
                            player.id
                        );


                    res.setHeader(
                        "Set-Cookie",
                        [
                            `sessionId=${encodeURIComponent(session.token)}`,
                            "HttpOnly",
                            "Secure",
                            "SameSite=Lax",
                            `Max-Age=${Math.floor(
                                SESSION_LENGTH_MS /
                                1000
                            )}`,
                            "Path=/"
                        ].join("; ")
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


                /* =================================================
                   CURRENT PLAYER
                   ================================================= */

                if (
                    pathname ===
                        "/api/me" &&
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


                /* =================================================
                   CURRENT PLAYER CARDS
                   ================================================= */

                if (
                    pathname ===
                        "/api/me/cards" &&
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
                            cards:
                                getUnlockedCards(
                                    player.id
                                )
                        }
                    );


                    return;

                }


                /* =================================================
                   CURRENT PLAYER DECK — GET
                   ================================================= */

                if (
                    pathname ===
                        "/api/me/deck" &&
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
                            deck:
                                getPlayerDeck(
                                    player.id
                                )
                        }
                    );


                    return;

                }


                /* =================================================
                   CURRENT PLAYER DECK — SAVE
                   ================================================= */

                if (
                    pathname ===
                        "/api/me/deck" &&
                    req.method === "POST"
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
                                    "You must be signed in."
                            }
                        );


                        return;

                    }


                    let body;


                    try {

                        body =
                            await readJSON(
                                req
                            );

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


                    const validation =
                        validateDeck(
                            player.id,
                            body.cards
                        );


                    if (
                        !validation.valid
                    ) {

                        sendJSON(
                            res,
                            400,
                            {
                                error:
                                    validation.error
                            }
                        );


                        return;

                    }


                    db.prepare(`
                        INSERT INTO player_deck
                        (
                            playerId,
                            cards
                        )
                        VALUES (?, ?)
                        ON CONFLICT(playerId)
                        DO UPDATE SET
                            cards = excluded.cards
                    `).run(
                        player.id,
                        JSON.stringify(
                            body.cards
                        )
                    );


                    sendJSON(
                        res,
                        200,
                        {
                            message:
                                "Deck saved.",

                            deck:
                                getPlayerDeck(
                                    player.id
                                )
                        }
                    );


                    return;

                }


                /* =================================================
                   LOGOUT
                   ================================================= */

                if (
                    pathname ===
                        "/api/auth/logout" &&
                    req.method === "POST"
                ) {

                    destroySession(
                        req
                    );


                    res.setHeader(
                        "Set-Cookie",
                        [
                            "sessionId=",
                            "HttpOnly",
                            "Secure",
                            "SameSite=Lax",
                            "Max-Age=0",
                            "Path=/"
                        ].join("; ")
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


                /* =================================================
                   PLAYERS
                   ================================================= */

                if (
                    pathname ===
                        "/api/players" &&
                    req.method === "GET"
                ) {

                    const players =
                        db.prepare(`
                            SELECT
                                id,
                                username,
                                rank,
                                elo,
                                createdAt,
                                mustChangePassword
                            FROM players
                            ORDER BY id ASC
                        `).all();


                    sendJSON(
                        res,
                        200,
                        {
                            players:
                                players.map(
                                    publicPlayer
                                )
                        }
                    );


                    return;

                }


                /* =================================================
                   404
                   ================================================= */

                sendJSON(
                    res,
                    404,
                    {
                        error:
                            "Not found."
                    }
                );

            } catch (error) {

                console.error(
                    "Server error:",
                    error
                );


                if (
                    !res.headersSent
                ) {

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


/* ============================================================
   START
   ============================================================ */

server.listen(
    PORT,
    HOST,
    () => {

        console.log(
            `Card Stuff Yes server running at http://${HOST}:${PORT}`
        );


        console.log(
            `Website directory: ${WEBSITE_DIRECTORY}`
        );


        console.log(
            `Database: ${DATABASE_PATH}`
        );


        console.log(
            `Max players per game: ${MAX_PLAYERS_PER_GAME}`
        );

    }
);
