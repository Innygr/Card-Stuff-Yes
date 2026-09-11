// ============================================================
// CARD STUFF YES - SERVER
// ============================================================
//
// This file handles:
//
// - Accounts
// - Passwords
// - Login sessions
// - Player ranks
// - Player badges
// - Unlocked cards
// - Player decks
// - API endpoints
// - Serving the website
//
// IMPORTANT:
// The server is authoritative for player data.
// The browser is NOT trusted to decide things like:
//
// - What rank a player has
// - What badges a player owns
// - What cards a player owns
// - What cards can be placed in their deck
//
// ============================================================


// ============================================================
// IMPORTS
// ============================================================

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const config = require("./config.json");


// ============================================================
// DATABASE
// ============================================================
//
// SQLite stores persistent player information.
//
// The database file is:
//
//     players.db
//
// This file should NOT be uploaded to GitHub.
// Your .gitignore should contain:
//
//     *.db
//
// ============================================================

const db = new Database("./players.db");


// WAL mode improves SQLite reliability when multiple
// operations happen around the same time.
db.pragma("journal_mode = WAL");


// Foreign keys are important because tables such as
// player_badges and player_deck reference players.
db.pragma("foreign_keys = ON");


// ============================================================
// PLAYERS TABLE
// ============================================================
//
// Stores the player's main account information.
//
// Rank is stored on the server and cannot be changed
// by the normal player API.
//
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
//
// Older versions of players.db may not contain
// mustChangePassword.
//
// Check for the column and add it if necessary.
// ============================================================

const playerColumns =
    db.prepare(`
        PRAGMA table_info(players)
    `).all();


const hasMustChangePassword =
    playerColumns.some(
        column =>
            column.name === "mustChangePassword"
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
//
// A session allows the player to remain signed in
// without sending their password with every request.
//
// The session ID is stored in an HttpOnly cookie.
//
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
// BADGES TABLE
// ============================================================
//
// Stores the definitions of special badges.
//
// Examples:
//
//     tournament_winner
//     beta_tester
//     event_winner
//
// Rank badges such as Owner and Mod do NOT need to be
// permanently stored here because they can be generated
// automatically from the player's rank.
//
// ============================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS badges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        image TEXT NOT NULL
    )
`);


// ============================================================
// PLAYER BADGES TABLE
// ============================================================
//
// Connects players to badges.
//
// A player can have multiple badges.
//
// Example:
//
//     Player 27
//         -> Tournament Winner
//         -> Beta Tester
//
// ============================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS player_badges (
        playerId INTEGER NOT NULL,
        badgeId INTEGER NOT NULL,
        awardedAt TEXT NOT NULL,

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


// ============================================================
// PLAYER UNLOCKED CARDS TABLE
// ============================================================
//
// Stores which cards a player owns/unlocked.
//
// Only the card ID is stored here.
//
// The actual card definition will be handled by
// the card system later.
//
// Example:
//
//     playerId = 27
//     cardId = "fireball"
//
// ============================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS player_unlocked_cards (
        playerId INTEGER NOT NULL,
        cardId TEXT NOT NULL,
        unlockedAt TEXT NOT NULL,

        PRIMARY KEY (
            playerId,
            cardId
        ),

        FOREIGN KEY (playerId)
        REFERENCES players(id)
        ON DELETE CASCADE
    )
`);


// ============================================================
// PLAYER DECK TABLE
// ============================================================
//
// Stores the cards currently placed in a player's deck.
//
// "slot" identifies where the card is located.
//
// Example:
//
//     playerId = 27
//     slot = 0
//     cardId = "fireball"
//
// The server will verify that the player actually
// owns the card before allowing it into their deck.
//
// ============================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS player_deck (
        playerId INTEGER NOT NULL,
        slot INTEGER NOT NULL,
        cardId TEXT NOT NULL,

        PRIMARY KEY (
            playerId,
            slot
        ),

        FOREIGN KEY (playerId)
        REFERENCES players(id)
        ON DELETE CASCADE
    )
`);


// ============================================================
// PASSWORD SETTINGS
// ============================================================
//
// This is the temporary password for the two initial
// Owner accounts.
//
// It is NOT intended to be used permanently.
//
// DO NOT send your real password to the server developer,
// chat, GitHub, etc.
//
// ============================================================

const TEMPORARY_OWNER_PASSWORD =
    "TEMP_CHANGE_ME";


// ============================================================
// PASSWORD FUNCTIONS
// ============================================================
//
// Passwords are never stored directly.
//
// Instead:
//
//     password
//          ↓
//       scrypt
//          ↓
//    salt + hash
//
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
// PLAYER LOOKUP FUNCTIONS
// ============================================================
//
// These functions retrieve player information from SQLite.
//
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


// ============================================================
// GET NEXT PLAYER ID
// ============================================================
//
// Owners permanently use:
//
//     0 = Innygr
//     1 = Mythic
//
// Normal players therefore begin at ID 2.
//
// ============================================================

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
// BADGE FUNCTIONS
// ============================================================
//
// These functions handle special badges.
//
// Rank badges are handled separately because rank is
// an account property rather than an achievement.
//
// ============================================================


function getSpecialBadges(playerId) {

    return db.prepare(`
        SELECT
            badges.id,
            badges.name,
            badges.image,
            player_badges.awardedAt
        FROM player_badges
        INNER JOIN badges
            ON badges.id = player_badges.badgeId
        WHERE player_badges.playerId = ?
        ORDER BY player_badges.awardedAt ASC
    `).all(playerId);
}


// ============================================================
// GET ALL PLAYER BADGES
// ============================================================
//
// This combines:
//
//     1. Automatic rank badge
//     2. Special/achievement badges
//
// A player can therefore have several badges.
//
// ============================================================

function getPlayerBadges(player) {

    const badges = [];


    // --------------------------------------------------------
    // AUTOMATIC RANK BADGE
    // --------------------------------------------------------
    //
    // Rank badges are generated from the server-side rank.
    //
    // Owner -> owner.png
    // Mod   -> moderator.png
    // Player -> no rank badge
    //
    // --------------------------------------------------------

    if (player.rank === "Owner") {

        badges.push({
            type: "rank",
            name: "Owner",
            image: "/assets/badges/owner.png"
        });

    } else if (player.rank === "Mod") {

        badges.push({
            type: "rank",
            name: "Moderator",
            image: "/assets/badges/moderator.png"
        });
    }


    // --------------------------------------------------------
    // SPECIAL BADGES
    // --------------------------------------------------------
    //
    // These come from player_badges.
    //
    // Example:
    //
    //     Tournament Winner
    //
    // --------------------------------------------------------

    const specialBadges =
        getSpecialBadges(
            player.id
        );


    for (const badge of specialBadges) {

        badges.push({
            type: "special",
            id: badge.id,
            name: badge.name,
            image: badge.image,
            awardedAt: badge.awardedAt
        });
    }


    return badges;
}


// ============================================================
// GET UNLOCKED CARDS
// ============================================================
//
// Returns the IDs of cards owned by the player.
//
// ============================================================

function getUnlockedCards(playerId) {

    return db.prepare(`
        SELECT
            cardId,
            unlockedAt
        FROM player_unlocked_cards
        WHERE playerId = ?
        ORDER BY unlockedAt ASC
    `).all(playerId);
}


// ============================================================
// GET PLAYER DECK
// ============================================================
//
// Returns the cards currently in each deck slot.
//
// ============================================================

function getPlayerDeck(playerId) {

    return db.prepare(`
        SELECT
            slot,
            cardId
        FROM player_deck
        WHERE playerId = ?
        ORDER BY slot ASC
    `).all(playerId);
}


// ============================================================
// CHECK WHETHER PLAYER OWNS A CARD
// ============================================================
//
// This is an important server-side security check.
//
// The browser cannot simply say:
//
//     "I own fireball."
//
// The server checks the database instead.
//
// ============================================================

function playerHasCard(
    playerId,
    cardId
) {

    const result =
        db.prepare(`
            SELECT 1
            FROM player_unlocked_cards
            WHERE playerId = ?
              AND cardId = ?
        `).get(
            playerId,
            cardId
        );


    return Boolean(result);
}


// ============================================================
// PUBLIC PLAYER DATA
// ============================================================
//
// Password hashes must NEVER be sent to the browser.
//
// This function also includes the player's
// non-sensitive game data.
//
// ============================================================

function publicPlayer(player) {

    return {
        id: player.id,

        username:
            player.username,

        rank:
            player.rank,

        createdAt:
            player.createdAt,

        mustChangePassword:
            Boolean(
                player.mustChangePassword
            ),

        badges:
            getPlayerBadges(
                player
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


// ============================================================
// OWNER ACCOUNTS
// ============================================================
//
// Creates the two permanent Owner accounts:
//
//     ID 0 = Innygr
//     ID 1 = Mythic
//
// If they already exist, they are left alone.
//
// If an old database contains one of these accounts
// without a password, the temporary password is assigned.
//
// ============================================================

function setupOwners() {

    // --------------------------------------------------------
    // INNYGR
    // --------------------------------------------------------

    let existingInnygr =
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
            hashPassword(
                TEMPORARY_OWNER_PASSWORD
            ),
            "Owner",
            new Date().toISOString(),
            1
        );

        console.log(
            "Created Owner account: Innygr"
        );

    } else {

        // If an older database has an Owner account
        // without a password, give it the temporary one.

        if (!existingInnygr.passwordHash) {

            db.prepare(`
                UPDATE players
                SET
                    passwordHash = ?,
                    rank = 'Owner',
                    mustChangePassword = 1
                WHERE id = 0
            `).run(
                hashPassword(
                    TEMPORARY_OWNER_PASSWORD
                )
            );

            console.log(
                "Assigned temporary password to existing Innygr account."
            );
        }
    }


    // --------------------------------------------------------
    // MYTHIC
    // --------------------------------------------------------

    let existingMythic =
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
            hashPassword(
                TEMPORARY_OWNER_PASSWORD
            ),
            "Owner",
            new Date().toISOString(),
            1
        );

        console.log(
            "Created Owner account: Mythic"
        );

    } else {

        if (!existingMythic.passwordHash) {

            db.prepare(`
                UPDATE players
                SET
                    passwordHash = ?,
                    rank = 'Owner',
                    mustChangePassword = 1
                WHERE id = 1
            `).run(
                hashPassword(
                    TEMPORARY_OWNER_PASSWORD
                )
            );

            console.log(
                "Assigned temporary password to existing Mythic account."
            );
        }
    }
}


setupOwners();


// ============================================================
// SESSION SETTINGS
// ============================================================
//
// Sessions last seven days.
//
// ============================================================

const SESSION_LENGTH_MS =
    7 * 24 * 60 * 60 * 1000;


// ============================================================
// CREATE SESSION
// ============================================================
//
// Creates a random session ID and stores it in SQLite.
//
// ============================================================

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


// ============================================================
// GET SESSION ID FROM COOKIE
// ============================================================
//
// Reads the sessionId cookie sent by the browser.
//
// ============================================================

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
// READ JSON REQUEST BODY
// ============================================================
//
// Reads the request body and parses it as JSON.
//
// ============================================================

function readJSON(req) {

    return new Promise(
        (resolve, reject) => {

            let body = "";


            req.on(
                "data",
                chunk => {

                    body +=
                        chunk.toString();


                    // ------------------------------------------------
                    // Prevent excessively large request bodies.
                    // ------------------------------------------------

                    if (
                        body.length >
                        1024 * 1024
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
// Checks whether a submitted deck is valid.
//
// The server checks card ownership rather than trusting
// information supplied by the browser.
//
// ============================================================

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


    // --------------------------------------------------------
    // Temporary maximum deck size.
    // --------------------------------------------------------

    if (cards.length > 100) {

        return {
            valid: false,
            error:
                "Deck contains too many cards."
        };

    }


    for (
        const cardId of cards
    ) {

        // ----------------------------------------------------
        // Card IDs must be strings.
        // ----------------------------------------------------

        if (
            typeof cardId !==
            "string"
        ) {

            return {
                valid: false,
                error:
                    "Every card ID must be a string."
            };

        }


        // ----------------------------------------------------
        // Prevent empty or excessively large card IDs.
        // ----------------------------------------------------

        if (
            !cardId ||
            cardId.length > 128
        ) {

            return {
                valid: false,
                error:
                    "Invalid card ID."
            };

        }


        // ----------------------------------------------------
        // The player must actually own the card.
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
                    `Player does not own card: ${cardId}`
            };

        }

    }


    return {
        valid: true
    };

}


// ============================================================
// SAVE PLAYER DECK
// ============================================================
//
// Deletes the old deck and writes the submitted deck.
//
// A transaction makes the whole operation succeed or fail
// together.
//
// ============================================================

function savePlayerDeck(
    playerId,
    cards
) {

    const validation =
        validateDeck(
            playerId,
            cards
        );


    if (!validation.valid) {

        return validation;

    }


    const saveDeck =
        db.transaction(
            () => {

                // ------------------------------------------------
                // Remove the player's previous deck.
                // ------------------------------------------------

                db.prepare(`
                    DELETE FROM player_deck
                    WHERE playerId = ?
                `).run(
                    playerId
                );


                // ------------------------------------------------
                // Prepare the insert statement once.
                // ------------------------------------------------

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


                // ------------------------------------------------
                // Insert every card using its server-generated
                // slot number.
                // ------------------------------------------------

                for (
                    let slot = 0;
                    slot < cards.length;
                    slot++
                ) {

                    insert.run(
                        playerId,
                        slot,
                        cards[slot]
                    );

                }

            }
        );


    try {

        saveDeck();


        return {
            valid: true
        };

    } catch (error) {

        console.error(
            "Failed to save deck:",
            error
        );


        return {
            valid: false,
            error:
                "Failed to save deck."
        };

    }

}


// ============================================================
// HTTP SERVER
// ============================================================
//
// This is the main request router.
//
// Requests are handled here and sent to the appropriate
// API endpoint or website file.
//
// ============================================================

const server =
    http.createServer(
        async (req, res) => {

            try {

                const requestURL =
                    new URL(
                        req.url,
                        `http://${req.headers.host || "localhost"}`
                    );


                const pathname =
                    requestURL.pathname;


                const method =
                    req.method;


                // ====================================================
                // ROOT PAGE
                // ====================================================
                //
                // The root currently loads test.html.
                //
                // ====================================================

                if (
                    method === "GET" &&
                    pathname === "/"
                ) {

                    const filePath =
                        path.join(
                            WEBSITE_DIRECTORY,
                            "test.html"
                        );


                    try {

                        const file =
                            fs.readFileSync(
                                filePath
                            );


                        res.writeHead(
                            200,
                            {
                                "Content-Type":
                                    "text/html; charset=utf-8",

                                "Cache-Control":
                                    "no-cache"
                            }
                        );


                        res.end(file);

                    } catch (error) {

                        console.error(
                            "Failed to serve test.html:",
                            error
                        );


                        sendText(
                            res,
                            500,
                            "Could not load the website."
                        );

                    }


                    return;

                }


                // ====================================================
                // PROFILE PAGE
                // ====================================================
                //
                // /profile loads profile.html.
                //
                // ====================================================

                if (
                    method === "GET" &&
                    pathname === "/profile"
                ) {

                    const filePath =
                        path.join(
                            WEBSITE_DIRECTORY,
                            "profile.html"
                        );


                    try {

                        const file =
                            fs.readFileSync(
                                filePath
                            );


                        res.writeHead(
                            200,
                            {
                                "Content-Type":
                                    "text/html; charset=utf-8",

                                "Cache-Control":
                                    "no-cache"
                            }
                        );


                        res.end(file);

                    } catch (error) {

                        console.error(
                            "Failed to serve profile.html:",
                            error
                        );


                        sendText(
                            res,
                            500,
                            "Could not load the profile page."
                        );

                    }


                    return;

                }


                // ====================================================
                // STATIC FILES
                // ====================================================
                //
                // Handles:
                //
                //     /colors.css
                //     /profile.css
                //     /profile.js
                //     /cardgame.css
                //     /cardgame.js
                //     /assets/...
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
                // API: SERVER STATUS
                // ====================================================
                //
                // Lets the website check whether Card Stuff Yes
                // is currently online.
                //
                // ====================================================

                if (
                    method === "GET" &&
                    pathname === "/api/status"
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
                // API: PLAYERS
                // ====================================================
                //
                // Returns public information about all players.
                //
                // Password hashes are removed by publicPlayer().
                //
                // ====================================================

                if (
                    method === "GET" &&
                    pathname === "/api/players"
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


                // ====================================================
                // API: REGISTER
                // ====================================================
                //
                // Creates a normal Player account.
                //
                // The client cannot choose its own rank.
                //
                // ====================================================

                if (
                    method === "POST" &&
                    pathname === "/api/auth/register"
                ) {

                    let body;


                    try {

                        body =
                            await readJSON(req);

                    } catch {

                        sendJSON(
                            res,
                            400,
                            {
                                error:
                                    "Invalid JSON."
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


                    // ------------------------------------------------
                    // Validate username.
                    // ------------------------------------------------

                    if (
                        !username ||
                        username.length > 32
                    ) {

                        sendJSON(
                            res,
                            400,
                            {
                                error:
                                    "Username must be between 1 and 32 characters."
                            }
                        );


                        return;

                    }


                    // ------------------------------------------------
                    // Validate password.
                    // ------------------------------------------------

                    if (
                        !password ||
                        password.length < 8
                    ) {

                        sendJSON(
                            res,
                            400,
                            {
                                error:
                                    "Password must be at least 8 characters."
                            }
                        );


                        return;

                    }


                    // ------------------------------------------------
                    // Check whether the username is already used.
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
                                    "Username is already taken."
                            }
                        );


                        return;

                    }


                    // ------------------------------------------------
                    // Assign the next available player ID.
                    // ------------------------------------------------

                    const playerId =
                        getNextPlayerId();


                    const createdAt =
                        new Date().toISOString();


                    const passwordHash =
                        hashPassword(
                            password
                        );


                    // ------------------------------------------------
                    // Create the player.
                    //
                    // Every normal registered account starts as
                    // Player.
                    // ------------------------------------------------

                    try {

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
                            VALUES
                            (
                                ?,
                                ?,
                                ?,
                                'Player',
                                ?,
                                0
                            )
                        `).run(
                            playerId,
                            username,
                            passwordHash,
                            createdAt
                        );

                    } catch (error) {

                        console.error(
                            "Registration error:",
                            error
                        );


                        sendJSON(
                            res,
                            500,
                            {
                                error:
                                    "Could not create account."
                            }
                        );


                        return;

                    }


                    const player =
                        getPlayerById(
                            playerId
                        );


                    sendJSON(
                        res,
                        201,
                        {
                            player:
                                publicPlayer(
                                    player
                                )
                        }
                    );


                    return;

                }                                    "Not signed in."
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
k
                        return;
                    }                    // ------------------------------------------------
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
