/* ============================================================
   CARD STUFF YES — LEADERBOARD MODULE
   ============================================================

   This module handles leaderboard queries.

   It is responsible for:

   - Current ELO leaderboard
   - Player rankings
   - Seasonal leaderboard results

   It does NOT modify ELO.

   ELO changes belong in elo.js.

   ============================================================ */


/* ============================================================
   CREATE LEADERBOARD MODULE
   ============================================================ */

function createLeaderboardModule(
    db,
    players,
    elo = null
) {

    if (!db) {

        throw new Error(
            "A database connection is required."
        );

    }


    if (!players) {

        throw new Error(
            "The players module is required."
        );

    }


    /* ========================================================
       DEFAULT LIMIT
       ======================================================== */

    const DEFAULT_LIMIT =
        100;


    const MAX_LIMIT =
        100;


    /* ========================================================
       NORMALIZE LIMIT
       ======================================================== */

    function normalizeLimit(
        limit
    ) {

        const number =
            Number(limit);


        if (
            !Number.isInteger(number) ||
            number <= 0
        ) {

            return DEFAULT_LIMIT;

        }


        return Math.min(
            number,
            MAX_LIMIT
        );

    }


    /* ========================================================
       CURRENT LEADERBOARD
       ======================================================== */

    /*
     * Return players ordered by current ELO.
     */
    function getLeaderboard(
        limit = DEFAULT_LIMIT
    ) {

        const normalizedLimit =
            normalizeLimit(
                limit
            );


        const rows =
            db
                .prepare(`
                    SELECT
                        id,
                        username,
                        rank,
                        elo
                    FROM players
                    ORDER BY
                        elo DESC,
                        id ASC
                    LIMIT ?
                `)
                .all(
                    normalizedLimit
                );


        return rows.map(
            (player, index) => ({

                position:
                    index + 1,

                id:
                    player.id,

                username:
                    player.username,

                rank:
                    player.rank,

                elo:
                    player.elo

            })
        );

    }


    /* ========================================================
       GET PLAYER POSITION
       ======================================================== */

    /*
     * Calculate a player's current leaderboard position.
     *
     * Players with higher ELO are ranked above them.
     *
     * ID is used as the tie-breaker.
     */
    function getPlayerPosition(
        playerId
    ) {

        const player =
            players.getPlayerById(
                playerId
            );


        if (!player) {

            return null;

        }


        const row =
            db
                .prepare(`
                    SELECT
                        COUNT(*) AS playersAhead
                    FROM players
                    WHERE
                        elo > ?
                        OR (
                            elo = ?
                            AND id < ?
                        )
                `)
                .get(

                    player.elo,

                    player.elo,

                    player.id

                );


        return Number(
            row.playersAhead
        ) + 1;

    }


    /* ========================================================
       GET PLAYER LEADERBOARD ENTRY
       ======================================================== */

    function getPlayerLeaderboardEntry(
        playerId
    ) {

        const player =
            players.getPlayerById(
                playerId
            );


        if (!player) {

            return null;

        }


        const position =
            getPlayerPosition(
                playerId
            );


        return {

            position,

            id:
                player.id,

            username:
                player.username,

            rank:
                player.rank,

            elo:
                player.elo

        };

    }


    /* ========================================================
       SEASON LEADERBOARD
       ======================================================== */

    /*
     * Return the final leaderboard for a completed season.
     */
    function getSeasonLeaderboard(
        seasonId,
        limit = DEFAULT_LIMIT
    ) {

        const normalizedLimit =
            normalizeLimit(
                limit
            );


        return db
            .prepare(`
                SELECT
                    season_results.seasonId,
                    season_results.finalRank AS position,
                    season_results.playerId AS id,
                    players.username,
                    players.rank,
                    season_results.finalElo AS elo
                FROM season_results
                INNER JOIN players
                    ON players.id =
                       season_results.playerId
                WHERE season_results.seasonId = ?
                ORDER BY
                    season_results.finalRank ASC
                LIMIT ?
            `)
            .all(

                seasonId,

                normalizedLimit

            );

    }


    /* ========================================================
       GET SEASON PLAYER POSITION
       ======================================================== */

    function getSeasonPlayerPosition(
        seasonId,
        playerId
    ) {

        const row =
            db
                .prepare(`
                    SELECT
                        finalRank
                    FROM season_results
                    WHERE seasonId = ?
                      AND playerId = ?
                `)
                .get(

                    seasonId,

                    playerId

                );


        if (!row) {

            return null;

        }


        return row.finalRank;

    }


    /* ========================================================
       RETURN MODULE API
       ======================================================== */

    return {

        DEFAULT_LIMIT,

        MAX_LIMIT,

        getLeaderboard,

        getPlayerPosition,

        getPlayerLeaderboardEntry,

        getSeasonLeaderboard,

        getSeasonPlayerPosition

    };

}


/* ============================================================
   EXPORTS
   ============================================================ */

module.exports = {

    createLeaderboardModule

};
