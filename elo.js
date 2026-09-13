/* ============================================================
   CARD STUFF YES — ELO MODULE
   ============================================================

   This module manages player ELO ratings and seasons.

   It is responsible for:

   - Reading ELO
   - Updating ELO
   - Calculating ELO changes
   - Creating monthly seasons
   - Recording completed season results

   Matchmaking and battles should call this module instead of
   directly modifying player ELO.

   ============================================================ */


/* ============================================================
   CREATE ELO MODULE
   ============================================================ */

function createEloModule(
    db,
    players
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
       SETTINGS
       ======================================================== */

    /*
     * Standard starting ELO.
     */
    const DEFAULT_ELO =
        1000;


    /*
     * K-factor controls how quickly ratings change.
     */
    const K_FACTOR =
        32;


    /* ========================================================
       GET PLAYER ELO
       ======================================================== */

    function getELO(
        playerId
    ) {

        const player =
            players.getPlayerById(
                playerId
            );


        if (!player) {

            return null;

        }


        return Number(
            player.elo
        );

    }


    /* ========================================================
       SET PLAYER ELO
       ======================================================== */

    function setELO(
        playerId,
        elo
    ) {

        const normalizedElo =
            Math.round(
                Number(elo)
            );


        if (
            !Number.isFinite(
                normalizedElo
            )
        ) {

            throw new Error(
                "ELO must be a number."
            );

        }


        db.prepare(`
            UPDATE players
            SET elo = ?
            WHERE id = ?
        `).run(

            normalizedElo,

            playerId

        );


        return normalizedElo;

    }


    /* ========================================================
       EXPECTED SCORE
       ======================================================== */

    /*
     * Calculate the probability that player A will win against
     * player B.
     */
    function expectedScore(
        ratingA,
        ratingB
    ) {

        return 1 /
            (
                1 +
                Math.pow(
                    10,
                    (
                        ratingB -
                        ratingA
                    ) / 400
                )
            );

    }


    /* ========================================================
       CALCULATE ELO CHANGE
       ======================================================== */

    /*
     * score:
     *
     *     1   = win
     *     0.5 = draw
     *     0   = loss
     */
    function calculateEloChange(
        playerRating,
        opponentRating,
        score
    ) {

        if (
            score !== 0 &&
            score !== 0.5 &&
            score !== 1
        ) {

            throw new Error(
                "Score must be 0, 0.5, or 1."
            );

        }


        const expected =
            expectedScore(
                playerRating,
                opponentRating
            );


        return Math.round(
            K_FACTOR *
            (
                score -
                expected
            )
        );

    }


    /* ========================================================
       APPLY MATCH RESULT
       ======================================================== */

    function applyMatchResult(
        playerAId,
        playerBId,
        scoreA
    ) {

        const playerA =
            players.getPlayerById(
                playerAId
            );


        const playerB =
            players.getPlayerById(
                playerBId
            );


        if (
            !playerA ||
            !playerB
        ) {

            throw new Error(
                "Both players must exist."
            );

        }


        const scoreB =
            1 -
            scoreA;


        const changeA =
            calculateEloChange(

                playerA.elo,

                playerB.elo,

                scoreA

            );


        const changeB =
            calculateEloChange(

                playerB.elo,

                playerA.elo,

                scoreB

            );


        const newEloA =
            setELO(

                playerA.id,

                playerA.elo +
                changeA

            );


        const newEloB =
            setELO(

                playerB.id,

                playerB.elo +
                changeB

            );


        return {

            playerA: {

                playerId:
                    playerA.id,

                oldElo:
                    playerA.elo,

                change:
                    changeA,

                newElo:
                    newEloA

            },

            playerB: {

                playerId:
                    playerB.id,

                oldElo:
                    playerB.elo,

                change:
                    changeB,

                newElo:
                    newEloB

            }

        };

    }


    /* ========================================================
       CURRENT SEASON ID
       ======================================================== */

    /*
     * Seasons use YYYY-MM.
     *
     * Example:
     *
     *     2026-09
     */
    function getCurrentSeasonId(
        date = new Date()
    ) {

        const year =
            date.getUTCFullYear();


        const month =
            String(
                date.getUTCMonth() + 1
            ).padStart(
                2,
                "0"
            );


        return `${year}-${month}`;

    }


    /* ========================================================
       ENSURE CURRENT SEASON
       ======================================================== */

    function ensureCurrentSeason() {

        const seasonId =
            getCurrentSeasonId();


        const existing =
            db
                .prepare(`
                    SELECT
                        id,
                        startedAt,
                        endedAt
                    FROM seasons
                    WHERE id = ?
                `)
                .get(seasonId);


        if (existing) {

            return existing;

        }


        const startedAt =
            new Date().toISOString();


        db.prepare(`
            INSERT INTO seasons
            (
                id,
                startedAt,
                endedAt
            )
            VALUES (?, ?, NULL)
        `).run(

            seasonId,

            startedAt

        );


        return db
            .prepare(`
                SELECT
                    id,
                    startedAt,
                    endedAt
                FROM seasons
                WHERE id = ?
            `)
            .get(seasonId);

    }


    /* ========================================================
       FINISH SEASON
       ======================================================== */

    /*
     * Record every player's final rating for a completed season.
     *
     * This does not reset the current ELO automatically. The
     * actual season-transition policy can be decided later.
     */
    function finishSeason(
        seasonId
    ) {

        const season =
            db
                .prepare(`
                    SELECT
                        id,
                        startedAt,
                        endedAt
                    FROM seasons
                    WHERE id = ?
                `)
                .get(seasonId);


        if (!season) {

            throw new Error(
                "Season not found."
            );

        }


        if (season.endedAt) {

            return {

                season,

                alreadyFinished: true

            };

        }


        const allPlayers =
            db
                .prepare(`
                    SELECT
                        id,
                        elo
                    FROM players
                    ORDER BY elo DESC, id ASC
                `)
                .all();


        const insertResult =
            db.transaction(
                () => {

                    const insert =
                        db.prepare(`
                            INSERT OR REPLACE INTO season_results
                            (
                                seasonId,
                                playerId,
                                finalElo,
                                finalRank
                            )
                            VALUES (?, ?, ?, ?)
                        `);


                    let rank = 1;


                    for (
                        const player
                        of allPlayers
                    ) {

                        insert.run(

                            seasonId,

                            player.id,

                            player.elo,

                            rank

                        );


                        rank++;

                    }


                    const endedAt =
                        new Date()
                            .toISOString();


                    db.prepare(`
                        UPDATE seasons
                        SET endedAt = ?
                        WHERE id = ?
                    `).run(

                        endedAt,

                        seasonId

                    );

                }
            );


        return {

            seasonId,

            playersRecorded:
                allPlayers.length

        };

    }


    /* ========================================================
       GET SEASON RESULTS
       ======================================================== */

    function getSeasonResults(
        seasonId
    ) {

        return db
            .prepare(`
                SELECT
                    season_results.seasonId,
                    season_results.playerId,
                    players.username,
                    season_results.finalElo,
                    season_results.finalRank
                FROM season_results
                INNER JOIN players
                    ON players.id =
                       season_results.playerId
                WHERE season_results.seasonId = ?
                ORDER BY season_results.finalRank ASC
            `)
            .all(seasonId);

    }


    /* ========================================================
       RETURN MODULE API
       ======================================================== */

    return {

        DEFAULT_ELO,

        K_FACTOR,

        getELO,

        setELO,

        expectedScore,

        calculateEloChange,

        applyMatchResult,

        getCurrentSeasonId,

        ensureCurrentSeason,

        finishSeason,

        getSeasonResults

    };

}


/* ============================================================
   EXPORTS
   ============================================================ */

module.exports = {

    createEloModule

};
