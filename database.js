/* ============================================================
   CARD STUFF YES — DATABASE MODULE
   ============================================================

   This module is responsible for:

   - Opening the SQLite database
   - Configuring SQLite
   - Creating the Card Stuff Yes tables
   - Performing small database migrations

   Other modules can import the database connection instead of
   server.js having to manage SQLite directly.

   ============================================================ */


/* ============================================================
   MODULE IMPORTS
   ============================================================ */

const Database =
    require("better-sqlite3");


/* ============================================================
   CREATE DATABASE MODULE
   ============================================================ */

/*
 * Creates and initializes a Card Stuff Yes SQLite database.
 *
 * The database path is supplied by server.js/configuration so
 * this module does not need to know where the server stores data.
 */
function createDatabase(
    databasePath
) {

    if (
        typeof databasePath !== "string" ||
        !databasePath.trim()
    ) {

        throw new Error(
            "A valid database path is required."
        );

    }


    /* ========================================================
       OPEN DATABASE
       ======================================================== */

    /*
     * better-sqlite3 automatically creates the database file if
     * it does not already exist.
     */
    const db =
        new Database(
            databasePath
        );


    /* ========================================================
       SQLITE SETTINGS
       ======================================================== */

    /*
     * WAL mode allows SQLite to handle reads and writes efficiently
     * while the server is running.
     */
    db.pragma(
        "journal_mode = WAL"
    );


    /*
     * Foreign-key enforcement makes SQLite actually enforce the
     * relationships defined by FOREIGN KEY declarations.
     */
    db.pragma(
        "foreign_keys = ON"
    );


    /* ========================================================
       PLAYERS
       ======================================================== */

    /*
     * Stores player accounts.
     *
     * ELO represents the player's current seasonal rating.
     *
     * Historical ratings are stored separately in season_results.
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


    /* ========================================================
       PLAYER ELO MIGRATION
       ======================================================== */

    /*
     * Older Card Stuff Yes databases may have been created before
     * the ELO column existed.
     *
     * Check whether the column already exists.
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
     * Add ELO to older databases if necessary.
     *
     * Existing players start at 1000 ELO.
     */
    if (!hasEloColumn) {

        db.exec(`
            ALTER TABLE players
            ADD COLUMN elo INTEGER NOT NULL DEFAULT 1000
        `);

    }


    /* ========================================================
       LOGIN SESSIONS
       ======================================================== */

    /*
     * Stores authentication sessions.
     *
     * The raw session token is never stored.
     *
     * Instead, the SHA-256 hash of the token is stored.
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


    /* ========================================================
       BADGES
       ======================================================== */

    /*
     * Stores definitions for special achievement badges.
     *
     * Rank badges such as Owner and Moderator are generated from
     * the player's rank and do not need to be stored here.
     */
    db.exec(`
        CREATE TABLE IF NOT EXISTS badges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            imagePath TEXT NOT NULL
        )
    `);


    /* ========================================================
       PLAYER BADGES
       ======================================================== */

    /*
     * Connects players to special achievement badges.
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


    /* ========================================================
       UNLOCKED CARDS
       ======================================================== */

    /*
     * Stores cards unlocked by each player.
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


    /* ========================================================
       PLAYER DECK
       ======================================================== */

    /*
     * Stores the player's currently saved deck.
     *
     * The cards column contains JSON.
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


    /* ========================================================
       SEASONS
       ======================================================== */

    /*
     * Stores monthly ELO seasons.
     *
     * Example:
     *
     *     2026-09
     */
    db.exec(`
        CREATE TABLE IF NOT EXISTS seasons (
            id TEXT PRIMARY KEY,
            startedAt TEXT NOT NULL,
            endedAt TEXT
        )
    `);


    /* ========================================================
       HISTORICAL SEASON RESULTS
       ======================================================== */

    /*
     * Stores final ELO and leaderboard position for completed
     * seasons.
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


    /* ========================================================
       RETURN DATABASE
       ======================================================== */

    return db;

}


/* ============================================================
   EXPORTS
   ============================================================ */

module.exports = {

    createDatabase

};
