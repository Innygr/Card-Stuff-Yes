/* ============================================================
   CARD STUFF YES — SERVER
   ============================================================

   This file runs the Card Stuff Yes multiplayer server.

   Main responsibilities:
   - Serve the website.
   - Manage player accounts.
   - Manage login sessions.
   - Store player data in SQLite.
   - Manage badges.
   - Manage unlocked cards.
   - Manage player decks.
   - Track online players.
   - Track matchmaking queues.
   - Track players currently in battles.
   - Manage monthly ELO seasons.
   - Provide the homepage API.
   - Provide the leaderboard API.

   The server is authoritative for player data such as:
   - Username
   - Rank
   - ELO
   - Badges
   - Unlocked cards
   - Deck ownership

   Client-side JavaScript must NOT be trusted to change these values.
   ============================================================ */


/* ============================================================
   MODULE IMPORTS
   ============================================================ */

/*
 * Node's built-in HTTP module.
 *
 * This is used to create the web server without requiring
 * Express or another web framework.
 */
const http = require("http");


/*
 * Node's filesystem module.
 *
 * Used for reading website files and assets from disk.
 */
const fs = require("fs");


/*
 * Node's path module.
 *
 * Used to safely construct filesystem paths.
 */
const path = require("path");


/*
 * Node's crypto module.
 *
 * Used for password hashing and secure session tokens.
 */
const crypto = require("crypto");


/*
 * SQLite database library.
 *
 * Card Stuff Yes uses SQLite for persistent player data.
 */
const Database = require("better-sqlite3");


/* ============================================================
   CONFIGURATION
   ============================================================ */

/*
 * Load the server configuration from config.json.
 *
 * The configuration file contains values such as:
 *
 * {
 *     "host": "127.0.0.1",
 *     "port": 6565,
 *     "maxPlayersPerGame": 4
 * }
 */
const CONFIG_PATH =
    path.resolve(__dirname, "config.json");


let config;


/*
 * Attempt to load config.json.
 *
 * If it cannot be read, sensible defaults are used so the server
 * can still start.
 */
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
        "Could not load config.json. Using default configuration."
    );


    config = {};
}


/*
 * Server hostname/interface.
 *
 * 127.0.0.1 means the server only listens locally, which is useful
 * when Cloudflare Tunnel or another reverse proxy is being used.
 */
const HOST =
    typeof config.host === "string"
        ? config.host
        : "127.0.0.1";


/*
 * Server port.
 */
const PORT =
    Number.isInteger(config.port)
        ? config.port
        : 6565;


/*
 * Maximum number of players in one game.
 *
 * This is currently configuration groundwork for matchmaking.
 */
const MAX_PLAYERS_PER_GAME =
    Number.isInteger(config.maxPlayersPerGame)
        ? config.maxPlayersPerGame
        : 4;


/* ============================================================
   FILESYSTEM PATHS
   ============================================================ */

/*
 * The directory containing this server.js file is also the root
 * of the website files on the Server branch.
 */
const WEBSITE_DIRECTORY =
    path.resolve(__dirname);


/*
 * General website assets are stored in /assets.
 *
 * Examples:
 *
 * assets/
 * ├── badges/
 * │   ├── owner.png
 * │   └── moderator.png
 * └── ...
 */
const ASSETS_DIRECTORY =
    path.resolve(
        __dirname,
        "assets"
    );


/*
 * SQLite database containing player information.
 *
 * This file is intentionally local to the server and should NOT
 * be committed to GitHub.
 */
const DATABASE_PATH =
    path.resolve(
        __dirname,
        "players.db"
    );


/* ============================================================
   DATABASE INITIALIZATION
   ============================================================ */

/*
 * Open the SQLite database.
 *
 * better-sqlite3 automatically creates the file if it does not
 * already exist.
 */
const db =
    new Database(
        DATABASE_PATH
    );


/*
 * WAL mode allows SQLite to handle reads and writes efficiently
 * while the server is running.
 */
db.pragma("journal_mode = WAL");


/*
 * Enable SQLite foreign-key enforcement.
 *
 * Without this, foreign-key definitions would not automatically
 * enforce relationships between tables.
 */
db.pragma("foreign_keys = ON");


/* ============================================================
   DATABASE TABLES
   ============================================================ */

/*
 * Main player table.
 *
 * ELO is stored directly on the player because it represents the
 * player's CURRENT seasonal rating.
 *
 * Previous seasonal ratings are preserved separately in
 * season_results.
 */
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
   PLAYER TABLE MIGRATION
   ============================================================ */

/*
 * Older Card Stuff Yes databases were created before ELO existed.
 *
 * Check whether the elo column already exists.
 */
const playerColumns =
    db.prepare(
        "PRAGMA table_info(players)"
    ).all();


const hasEloColumn =
    playerColumns.some(
        column =>
            column.name === "elo"
    );


/*
 * Add ELO to an older database if necessary.
 *
 * Existing players start at 1000 ELO.
 */
if (!hasEloColumn) {

    db.exec(`
        ALTER TABLE players
        ADD COLUMN elo INTEGER NOT NULL DEFAULT 1000
    `);

}


/* ============================================================
   LOGIN SESSIONS
   ============================================================ */

/*
 * Stores authentication sessions.
 *
 * The token itself is stored as a hash rather than storing the
 * raw session token in the database.
 */
db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
        tokenHash TEXT PRIMARY KEY,
        playerId INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (playerId)
            REFERENCES players(id)
            ON DELETE CASCADE
    )
`);


/* ============================================================
   BADGES
   ============================================================ */

/*
 * Stores definitions for special player badges.
 *
 * Rank badges such as Owner and Mod are handled automatically
 * from the player's rank.
 *
 * This table is intended for additional badges, such as:
 * - Tournament winner
 * - Event participant
 * - Other special achievements
 */
db.exec(`
    CREATE TABLE IF NOT EXISTS badges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        imagePath TEXT NOT NULL
    )
`);


/* ============================================================
   PLAYER BADGES
   ============================================================ */

/*
 * Connects players to special badges.
 *
 * A player can have multiple badges.
 */
db.exec(`
    CREATE TABLE IF NOT EXISTS player_badges (
        playerId INTEGER NOT NULL,
        badgeId INTEGER NOT NULL,
        PRIMARY KEY (playerId, badgeId),
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

/*
 * Stores which cards each player owns/unlocked.
 *
 * Card ownership is checked by the server when a deck is saved.
 */
db.exec(`
    CREATE TABLE IF NOT EXISTS player_unlocked_cards (
        playerId INTEGER NOT NULL,
        cardId TEXT NOT NULL,
        PRIMARY KEY (playerId, cardId),
        FOREIGN KEY (playerId)
            REFERENCES players(id)
            ON DELETE CASCADE
    )
`);


/* ============================================================
   PLAYER DECKS
   ============================================================ */

/*
 * Stores each player's currently saved deck.
 *
 * The deck itself is represented as a list of card IDs in the
 * database.
 */
db.exec(`
    CREATE TABLE IF NOT EXISTS player_deck (
        playerId INTEGER PRIMARY KEY,
        cards TEXT NOT NULL,
        FOREIGN KEY (playerId)
            REFERENCES players(id)
            ON DELETE CASCADE
    )
`);


/* ============================================================
   SEASONS
   ============================================================ */

/*
 * Every month has its own ELO season.
 *
 * The season ID uses UTC year-month format:
 *
 *     2026-09
 *
 * This avoids ambiguity caused by different players being in
 * different time zones.
 */
db.exec(`
    CREATE TABLE IF NOT EXISTS seasons (
        id TEXT PRIMARY KEY,
        startedAt TEXT NOT NULL,
        endedAt TEXT
    )
`);


/* ============================================================
   HISTORICAL SEASON RESULTS
   ============================================================ */

/*
 * When a season ends, every player's final ELO and leaderboard
 * position is copied here.
 *
 * This means resetting current ELO does NOT erase previous
 * monthly results.
 */
db.exec(`
    CREATE TABLE IF NOT EXISTS season_results (
        seasonId TEXT NOT NULL,
        playerId INTEGER NOT NULL,
        finalElo INTEGER NOT NULL,
        finalRank INTEGER NOT NULL,
        PRIMARY KEY (seasonId, playerId),
        FOREIGN KEY (seasonId)
            REFERENCES seasons(id)
            ON DELETE CASCADE,
        FOREIGN KEY (playerId)
            REFERENCES players(id)
            ON DELETE CASCADE
    )
`);


/* ============================================================
   PASSWORD HASHING SETTINGS
   ============================================================ */

/*
 * Passwords are hashed using Node's scrypt implementation.
 *
 * Passwords are never stored as plaintext.
 */
const PASSWORD_HASH_BYTES = 64;


/*
 * Number of random bytes used for password salts.
 */
const PASSWORD_SALT_BYTES = 16;


/*
 * Number of random bytes used for session tokens.
 *
 * 32 bytes provides a large amount of randomness for sessions.
 */
const SESSION_TOKEN_BYTES = 32;


/* ============================================================
   PASSWORD HASHING
   ============================================================ */

/*
 * Hash a password using scrypt.
 *
 * The resulting string contains:
 *
 *     scrypt:salt:hash
 *
 * so the salt can be recovered later when verifying the password.
 */
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

/*
 * Verify a plaintext password against a stored password hash.
 */
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

    } catch (error) {

        return false;
    }
}


/* ============================================================
   SESSION TOKEN CREATION
   ============================================================ */

/*
 * Generate a cryptographically random session token.
 *
 * The raw token is sent to the browser.
 * Only its SHA-256 hash is stored in SQLite.
 */
function createSessionToken() {

    return crypto
        .randomBytes(
            SESSION_TOKEN_BYTES
        )
        .toString("hex");
}


/* ============================================================
   SESSION TOKEN HASHING
   ============================================================ */

/*
 * Hash a session token before putting it in the database.
 */
function hashSessionToken(token) {

    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
}


/* ============================================================
   CURRENT TIME
   ============================================================ */

/*
 * Return the current time as an ISO 8601 string.
 *
 * Using ISO timestamps keeps database timestamps consistent and
 * easy to sort.
 */
function nowISO() {

    return new Date().toISOString();
}


/* ============================================================
   PLAYER LOOKUP — USERNAME
   ============================================================ */

/*
 * Get a complete player record by username.
 */
function getPlayerByUsername(username) {

    return db
        .prepare(`
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
        `)
        .get(username);
}


/* ============================================================
   PLAYER LOOKUP — ID
   ============================================================ */

/*
 * Get a complete player record by numeric player ID.
 */
function getPlayerById(playerId) {

    return db
        .prepare(`
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
        `)
        .get(playerId);
}


/* ============================================================
   BADGE LOOKUP
   ============================================================ */

/*
 * Return the badges that a player has.
 *
 * Owner and Moderator rank badges are automatically included
 * based on the player's rank.
 *
 * Additional achievement/special badges are then added from
 * player_badges.
 */
function getPlayerBadges(playerId) {

    const player =
        getPlayerById(playerId);


    if (!player) {
        return [];
    }


    const badges = [];


    /* --------------------------------------------------------
       OWNER RANK BADGE
       -------------------------------------------------------- */

    if (
        player.rank.toLowerCase() ===
        "owner"
    ) {

        badges.push({
            name: "Owner",
            image: "/assets/badges/owner.png",
            type: "rank"
        });

    }


    /* --------------------------------------------------------
       MODERATOR RANK BADGE
       -------------------------------------------------------- */

    if (
        player.rank.toLowerCase() ===
            "mod" ||
        player.rank.toLowerCase() ===
            "moderator"
    ) {

        badges.push({
            name: "Moderator",
            image: "/assets/badges/moderator.png",
            type: "rank"
        });

    }


    /* --------------------------------------------------------
       SPECIAL / ACHIEVEMENT BADGES
       -------------------------------------------------------- */

    const specialBadges =
        db.prepare(`
            SELECT
                badges.id,
                badges.name,
                badges.imagePath
            FROM player_badges
            INNER JOIN badges
                ON badges.id = player_badges.badgeId
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
   UNLOCKED CARD LOOKUP
   ============================================================ */

/*
 * Get every card currently unlocked by a player.
 */
function getUnlockedCards(playerId) {

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


/* ============================================================
   PLAYER DECK LOOKUP
   ============================================================ */

/*
 * Get the player's saved deck.
 *
 * The cards are stored as JSON in SQLite.
 */
function getPlayerDeck(playerId) {

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
            JSON.parse(row.cards);


        if (!Array.isArray(cards)) {
            return [];
        }


        return cards;

    } catch (error) {

        return [];
    }
}


/* ============================================================
   PUBLIC PLAYER DATA
   ============================================================ */

/*
 * Convert a private database player record into data safe to send
 * to the browser.
 *
 * The password hash is deliberately NOT included.
 */
function publicPlayer(player) {

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
}// ============================================================

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


// ============================================================
// GET PLAYER FROM SESSION
// ============================================================
//
// Turns:
//
//     session cookie
//
// into:
//
//     player database record
//
// ============================================================

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


    // --------------------------------------------------------
    // DELETE EXPIRED SESSION
    // --------------------------------------------------------

    if (expiresAt <= now) {

        db.prepare(`
            DELETE FROM sessions
            WHERE sessionId = ?
        `).run(sessionId);


        return null;
    }


    // --------------------------------------------------------
    // FIND PLAYER
    // --------------------------------------------------------

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


// ============================================================
// DESTROY CURRENT SESSION
// ============================================================
//
// Used when the player logs out.
//
// ============================================================

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


// ============================================================
// DESTROY ALL PLAYER SESSIONS
// ============================================================
//
// Used after changing a password.
//
// This forces the account to sign in again everywhere.
//
// ============================================================

function destroyAllPlayerSessions(
    playerId
) {

    db.prepare(`
        DELETE FROM sessions
        WHERE playerId = ?
    `).run(playerId);
}


// ============================================================
// CLEAN EXPIRED SESSIONS
// ============================================================
//
// Removes old sessions from SQLite every hour.
//
// ============================================================

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
//
// sendJSON = JSON API response
// sendText = plain text response
//
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
// STATIC FILE SERVING
// ============================================================
//
// Serves the website's public files, including:
//
//     /colors.css
//     /profile.css
//     /profile.js
//
// It also serves files inside:
//
//     /assets/
//
// Only explicitly allowed website files and files inside the
// assets directory can be served.
//
// Path resolution is checked so a URL cannot escape the
// intended website/assets directories.
//
// ============================================================

const WEBSITE_DIRECTORY =
    path.resolve(__dirname);


const ASSETS_DIRECTORY =
    path.resolve(
        __dirname,
        "assets"
    );


// ============================================================
// MIME TYPES
// ============================================================
//
// Tells the browser what kind of file it received.
//
// ============================================================

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


// ============================================================
// SERVE STATIC FILE
// ============================================================
//
// Returns true when the request was handled.
//
// Returns false when the request is not a static file request,
// allowing the API routes below to handle it.
//
// ============================================================

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


    // --------------------------------------------------------
    // GET ONLY THE URL PATH
    // --------------------------------------------------------
    //
    // This removes query strings such as:
    //
    //     /profile.css?v=2
    //
    // --------------------------------------------------------

    let pathname;

    try {

        pathname =
            new URL(
                req.url,
                "http://localhost"
            ).pathname;

    } catch {

        sendText(
            res,
            400,
            "Invalid file path."
        );

        return true;

    }


    // --------------------------------------------------------
    // DECODE URL
    // --------------------------------------------------------
    //
    // Decode URL-encoded characters before checking the path.
    //
    // --------------------------------------------------------

    try {

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


    // ========================================================
    // WEBSITE FILES
    // ========================================================
    //
    // Only these direct website files are exposed.
    //
    // This prevents arbitrary server files such as players.db
    // from being requested through the browser.
    //
    // ========================================================

    const allowedWebsiteFiles = new Set([

        "/colors.css",
        "/profile.css",
        "/profile.js",

        "/cardgame.css",
        "/cardgame.js",
        "/cardgame.html",

        "/test.html"

    ]);


    if (
        allowedWebsiteFiles.has(
            pathname
        )
    ) {

        filePath =
            path.resolve(
                WEBSITE_DIRECTORY,
                pathname.substring(1)
            );

    }


    // ========================================================
    // ASSETS
    // ========================================================
    //
    // Files under /assets/ are allowed.
    //
    // Example:
    //
    //     /assets/badges/owner.png
    //
    // ========================================================

    else if (
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


        // ----------------------------------------------------
        // PATH TRAVERSAL PROTECTION
        // ----------------------------------------------------
        //
        // The resolved file must remain inside ./assets.
        //
        // ----------------------------------------------------

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

    }


    // --------------------------------------------------------
    // NOT A STATIC FILE
    // --------------------------------------------------------

    else {

        return false;

    }


    // ========================================================
    // FILE EXTENSION
    // ========================================================

    const extension =
        path.extname(
            filePath
        ).toLowerCase();


    const contentType =
        MIME_TYPES[extension];


    if (!contentType) {

        sendText(
            res,
            415,
            "Unsupported file type."
        );

        return true;

    }


    // ========================================================
    // READ FILE
    // ========================================================

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


            // ------------------------------------------------
            // RESPONSE HEADERS
            // ------------------------------------------------

            res.writeHead(
                200,
                {
                    "Content-Type":
                        contentType,

                    "Cache-Control":
                        "no-cache"
                }
            );


            // ------------------------------------------------
            // HEAD REQUEST
            // ------------------------------------------------
            //
            // HEAD returns the headers without the file body.
            //
            // ------------------------------------------------

            if (
                req.method === "HEAD"
            ) {

                res.end();

                return;

            }


            res.end(data);

        }
    );


    return true;

}


// ============================================================
// READ JSON BODY
// ============================================================
//
// Reads POST request data.
//
// A size limit prevents enormous requests.
//
// ============================================================

function readJSON(req) {

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
// DECK VALIDATION
// ============================================================
//
// Checks whether a requested deck is valid.
//
// Rules currently:
//
// - Deck must be an array
// - Each card ID must be a string
// - Card IDs must not be empty
// - Every card must be unlocked
// - Slots are generated by the server
//
// We will add actual deck-size/card-copy rules when
// the card-game rules are finalized.
//
// ============================================================

function validateDeck(
    playerId,
    cards
) {

    if (!Array.isArray(cards)) {

        return {
            valid: false,
            error: "Deck must be an array."
        };
    }


    // Current temporary maximum.
    //
    // We can change this when the actual game rules
    // define the deck size.

    if (cards.length > 100) {

        return {
            valid: false,
            error: "Deck cannot contain more than 100 cards."
        };
    }


    for (const cardId of cards) {

        if (
            typeof cardId !== "string" ||
            !cardId.trim()
        ) {

            return {
                valid: false,
                error: "Every deck card must have a valid card ID."
            };
        }


        if (
            cardId.length > 128
        ) {

            return {
                valid: false,
                error: "A card ID is too long."
            };
        }


        // ----------------------------------------------------
        // IMPORTANT:
        //
        // The server checks ownership.
        //
        // The client cannot simply submit a card it
        // doesn't own.
        // ----------------------------------------------------

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
}    };

}


// ============================================================
// SERVER
// ============================================================

const server =
    http.createServer(
        async (req, res) => {

            try {

                // ====================================================
                // ROOT PAGE
                // ====================================================
                //
                // Currently loads test.html.
                //
                // Later this can become the actual game homepage.
                //
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
                //
                // The profile page uses /api/me to determine
                // who is signed in.
                //
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
                // STATIC WEBSITE FILES
                // ====================================================
                //
                // Serves the CSS, JavaScript, and public assets used
                // by the website.
                //
                // Examples:
                //
                //     /colors.css
                //     /profile.css
                //     /profile.js
                //     /assets/badges/owner.png
                //
                // ====================================================

                if (
                    serveStaticFile(
                        req,
                        res
                    )
                ) {

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
                //
                // Returns basic public information about
                // every player.
                //
                // Password hashes are never included.
                //
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


                    // ------------------------------------------------
                    // USERNAME UNIQUENESS
                    // ------------------------------------------------

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


                    // ------------------------------------------------
                    // CREATE PLAYER
                    // ------------------------------------------------

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


                    // ------------------------------------------------
                    // CREATE SESSION
                    // ------------------------------------------------

                    const session =
                        createSession(
                            player.id
                        );


                    // ------------------------------------------------
                    // SESSION COOKIE
                    // ------------------------------------------------
                    //
                    // HttpOnly:
                    // JavaScript cannot directly read the cookie.
                    //
                    // Secure:
                    // Cookie is sent over HTTPS.
                    //
                    // SameSite=Lax:
                    // Helps protect against unwanted cross-site
                    // requests.
                    //
                    // Max-Age:
                    // Seven-day session.
                    //
                    // ------------------------------------------------

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
                //
                // GET /api/me
                //
                // Returns the currently signed-in player.
                //
                // This is what profile.html uses.
                //
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
                // CURRENT USER - CARDS
                // ====================================================
                //
                // GET /api/me/cards
                //
                // Returns only the player's unlocked cards.
                //
                // ====================================================

                if (
                    req.url === "/api/me/cards" &&
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


                // ====================================================
                // CURRENT USER - DECK
                // ====================================================
                //
                // GET /api/me/deck
                //
                // Returns the player's current deck.
                //
                // ====================================================

                if (
                    req.url === "/api/me/deck" &&
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


                // ====================================================
                // SAVE CURRENT USER DECK
                // ====================================================
                //
                // POST /api/me/deck
                //
                // Body:
                //
                // {
                //     "cards": [
                //         "card_one",
                //         "card_two",
                //         "card_three"
                //     ]
                // }
                //
                // The server checks every card before saving it.
                //
                // ====================================================

                if (
                    req.url === "/api/me/deck" &&
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


                    let body;                    try {
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



                    const validation =
                        validateDeck(
                            player.id,
                            body.cards
                        );


                    if (!validation.valid) {

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



                    const cards =
                        body.cards;



                    // ------------------------------------------------
                    // TRANSACTION
                    // ------------------------------------------------
                    //
                    // Delete the old deck and replace it with
                    // the newly validated deck as one operation.
                    //
                    // ------------------------------------------------

                    const saveDeck =
                        db.transaction(
                            () => {

                                db.prepare(`
                                    DELETE FROM player_deck
                                    WHERE playerId = ?
                                `).run(
                                    player.id
                                );


                                const insert =
                                    db.prepare(`
                                        INSERT INTO player_deck
                                        (
                                            playerId,
                                            slot,
                                            cardId
                                        )
                                        VALUES (?, ?, ?)
                                    `);


                                for (
                                    let i = 0;
                                    i < cards.length;
                                    i++
                                ) {

                                    insert.run(
                                        player.id,
                                        i,
                                        cards[i]
                                    );
                                }
                            }
                        );


                    saveDeck();



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



                // ====================================================
                // CHANGE PASSWORD
                // ====================================================

                if (
                    req.url ===
                        "/api/auth/change-password" &&
                    req.method === "POST"
                ) {

                    // ------------------------------------------------
                    // PLAYER MUST BE SIGNED IN
                    // ------------------------------------------------

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



                    // ------------------------------------------------
                    // VERIFY CURRENT PASSWORD
                    // ------------------------------------------------

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



                    // ------------------------------------------------
                    // PREVENT TEMPORARY PASSWORD
                    // ------------------------------------------------

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



                    // ------------------------------------------------
                    // UPDATE PASSWORD
                    // ------------------------------------------------

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



                    // ------------------------------------------------
                    // LOG OUT EVERYWHERE
                    // ------------------------------------------------
                    //
                    // Every existing session becomes invalid.
                    //
                    // The user will need to sign in again.
                    //
                    // ------------------------------------------------

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


                    // Delete the browser's cookie.
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
//
// Uses the host and port from config.json.
//
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


        console.log(
            "Player data tables loaded:"
        );


        console.log(
            "  - players"
        );


        console.log(
            "  - sessions"
        );


        console.log(
            "  - badges"
        );


        console.log(
            "  - player_badges"
        );


        console.log(
            "  - player_unlocked_cards"
        );


        console.log(
            "  - player_deck"
        );
    }
);
