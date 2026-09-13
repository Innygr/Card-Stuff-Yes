/* ============================================================
   CARD STUFF YES — PLAYERS MODULE
   ============================================================

   This module handles player-related database operations.

   It is responsible for:

   - Finding players
   - Creating players
   - Reading player badges
   - Reading unlocked cards
   - Reading saved decks
   - Producing safe public player data

   Password hashing and sessions are handled by other modules.

   ============================================================ */


/* ============================================================
   CREATE PLAYER MODULE
   ============================================================ */

function createPlayersModule(
    db
) {

    if (!db) {

        throw new Error(
            "A database connection is required."
        );

    }


    /* ========================================================
       PLAYER LOOKUP — USERNAME
       ======================================================== */

    /*
     * Find a complete player record by username.
     */
    function getPlayerByUsername(
        username
    ) {

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


    /* ========================================================
       PLAYER LOOKUP — ID
       ======================================================== */

    /*
     * Find a complete player record by numeric ID.
     */
    function getPlayerById(
        playerId
    ) {

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


    /* ========================================================
       NEXT PLAYER ID
       ======================================================== */

    /*
     * Generate the next player ID.
     *
     * The ID is based on the current highest ID.
     */
    function getNextPlayerId() {

        const row =
            db
                .prepare(`
                    SELECT
                        MAX(id) AS maxId
                    FROM players
                `)
                .get();


        if (
            !row ||
            row.maxId === null
        ) {

            return 1;

        }


        return Number(row.maxId) + 1;

    }


    /* ========================================================
       CREATE PLAYER
       ======================================================== */

    /*
     * Insert a new player into SQLite.
     *
     * Password hashing is deliberately performed by auth.js.
     */
    function createPlayer({
        username,
        passwordHash,
        rank = "Player",
        elo = 1000,
        mustChangePassword = 0
    }) {

        const id =
            getNextPlayerId();


        const createdAt =
            new Date().toISOString();


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

            id,

            username,

            passwordHash,

            rank,

            elo,

            createdAt,

            mustChangePassword

        );


        return getPlayerById(
            id
        );

    }


    /* ========================================================
       PLAYER BADGES
       ======================================================== */

    /*
     * Return all badges belonging to a player.
     *
     * Owner and Moderator rank badges are automatically added.
     *
     * Achievement/special badges come from SQLite.
     */
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


        /* ----------------------------------------------------
           OWNER
           ---------------------------------------------------- */

        if (
            typeof player.rank === "string" &&
            player.rank.toLowerCase() === "owner"
        ) {

            badges.push({

                name: "Owner",

                image:
                    "/assets/badges/owner.png",

                type: "rank"

            });

        }


        /* ----------------------------------------------------
           MODERATOR
           ---------------------------------------------------- */

        const normalizedRank =
            typeof player.rank === "string"
                ? player.rank.toLowerCase()
                : "";


        if (
            normalizedRank === "mod" ||
            normalizedRank === "moderator"
        ) {

            badges.push({

                name: "Moderator",

                image:
                    "/assets/badges/moderator.png",

                type: "rank"

            });

        }


        /* ----------------------------------------------------
           SPECIAL BADGES
           ---------------------------------------------------- */

        const specialBadges =
            db
                .prepare(`
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
                `)
                .all(playerId);


        for (
            const badge of specialBadges
        ) {

            badges.push({

                id:
                    badge.id,

                name:
                    badge.name,

                image:
                    badge.imagePath,

                type:
                    "special"

            });

        }


        return badges;

    }


    /* ========================================================
       UNLOCKED CARDS
       ======================================================== */

    /*
     * Get every card unlocked by a player.
     */
    function getUnlockedCards(
        playerId
    ) {

        const rows =
            db
                .prepare(`
                    SELECT
                        cardId
                    FROM player_unlocked_cards
                    WHERE playerId = ?
                    ORDER BY cardId ASC
                `)
                .all(playerId);


        return rows.map(
            row =>
                row.cardId
        );

    }


    /* ========================================================
       CHECK CARD OWNERSHIP
       ======================================================== */

    /*
     * Check whether a player has unlocked a particular card.
     *
     * This is useful to deck validation.
     */
    function playerHasCard(
        playerId,
        cardId
    ) {

        const row =
            db
                .prepare(`
                    SELECT
                        1
                    FROM player_unlocked_cards
                    WHERE playerId = ?
                      AND cardId = ?
                    LIMIT 1
                `)
                .get(
                    playerId,
                    cardId
                );


        return Boolean(row);

    }


    /* ========================================================
       PLAYER DECK
       ======================================================== */

    /*
     * Get the player's saved deck.
     *
     * The database stores it as JSON.
     */
    function getPlayerDeck(
        playerId
    ) {

        const row =
            db
                .prepare(`
                    SELECT
                        cards
                    FROM player_deck
                    WHERE playerId = ?
                `)
                .get(playerId);


        if (!row) {

            return [];

        }


        try {

            const cards =
                JSON.parse(
                    row.cards
                );


            if (
                !Array.isArray(cards)
            ) {

                return [];

            }


            return cards;

        } catch {

            return [];

        }

    }


    /* ========================================================
       SAVE PLAYER DECK
       ======================================================== */

    /*
     * Save a player's deck as JSON.
     */
    function savePlayerDeck(
        playerId,
        cards
    ) {

        if (
            !Array.isArray(cards)
        ) {

            throw new Error(
                "Deck must be an array."
            );

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

            playerId,

            JSON.stringify(cards)

        );

    }


    /* ========================================================
       PUBLIC PLAYER DATA
       ======================================================== */

    /*
     * Convert a private database player record into safe data
     * that can be sent to a browser.
     *
     * The password hash is NEVER included.
     */
    function publicPlayer(
        player
    ) {

        if (!player) {

            return null;

        }


        return {

            id:
                player.id,

            username:
                player.username,

            rank:
                player.rank,

            elo:
                player.elo,

            createdAt:
                player.createdAt,

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


    /* ========================================================
       LIST PUBLIC PLAYERS
       ======================================================== */

    /*
     * Get every player in ID order.
     *
     * Only safe public data is returned.
     */
    function getPublicPlayers() {

        const players =
            db
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
                    ORDER BY id ASC
                `)
                .all();


        return players.map(
            publicPlayer
        );

    }


    /* ========================================================
       RETURN MODULE API
       ======================================================== */

    return {

        getPlayerByUsername,

        getPlayerById,

        getNextPlayerId,

        createPlayer,

        getPlayerBadges,

        getUnlockedCards,

        playerHasCard,

        getPlayerDeck,

        savePlayerDeck,

        publicPlayer,

        getPublicPlayers

    };

}


/* ============================================================
   EXPORTS
   ============================================================ */

module.exports = {

    createPlayersModule

};
