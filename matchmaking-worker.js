/* ============================================================
   CARD STUFF YES — MATCHMAKING WORKER MODULE
   ============================================================

   This module continuously checks the matchmaking queue.

   matchmaking.js:
       Manages the queue.

   battles.js:
       Manages active battles.

   game-state.js:
       Manages the state inside a game.

   This worker connects those systems together.

   ============================================================ */


/* ============================================================
   CREATE MATCHMAKING WORKER
   ============================================================ */

function createMatchmakingWorker(
    matchmaking,
    battles,
    gameState,
    options = {}
) {

    if (!matchmaking) {

        throw new Error(
            "The matchmaking module is required."
        );

    }


    if (!battles) {

        throw new Error(
            "The battles module is required."
        );

    }


    if (!gameState) {

        throw new Error(
            "The game state module is required."
        );

    }


    /* ========================================================
       WORKER SETTINGS
       ======================================================== */

    /*
     * How often the queue is checked.
     */

    const intervalMs =
        Number.isInteger(
            options.intervalMs
        ) &&
        options.intervalMs > 0

            ? options.intervalMs

            : 500;


    /* ========================================================
       WORKER STATE
       ======================================================== */

    let timer =
        null;


    let running =
        false;


    /* ========================================================
       PROCESS QUEUE
       ======================================================== */

    function processQueue() {

        /*
         * Continue creating matches while enough players remain
         * in the queue.
         */

        while (true) {

            const match =
                matchmaking.findNextMatch();


            if (!match) {

                break;

            }


            try {

                /*
                 * Create the battle first.
                 */

                const battle =
                    battles.createBattle(
                        match.playerIds
                    );


                /*
                 * Create the actual game state.
                 */

                const game =
                    gameState.createGame(
                        match.playerIds,
                        {

                            data: {

                                battleId:
                                    battle.id

                            }

                        }
                    );


                /*
                 * Store the game ID on the battle.
                 *
                 * battles.js owns the battle.
                 * game-state.js owns the game.
                 */

                battle.gameId =
                    game.id;


                /*
                 * The players are now waiting for the game to
                 * begin.
                 */

                return {

                    battle,

                    game

                };

            } catch (error) {

                /*
                 * If something fails after players have been
                 * removed from the queue, put them back so they
                 * aren't silently lost.
                 */

                for (
                    const playerId
                    of match.playerIds
                ) {

                    try {

                        matchmaking.joinQueue(
                            playerId
                        );

                    } catch {

                        /*
                         * Do not allow recovery failure to crash
                         * the matchmaking worker.
                         */

                    }

                }


                console.error(
                    "Matchmaking error:",
                    error
                );

                return null;

            }

        }


        return null;

    }


    /* ========================================================
       START WORKER
       ======================================================== */

    function start() {

        if (running) {

            return false;

        }


        running =
            true;


        timer =
            setInterval(
                processQueue,
                intervalMs
            );


        return true;

    }


    /* ========================================================
       STOP WORKER
       ======================================================== */

    function stop() {

        if (!running) {

            return false;

        }


        clearInterval(
            timer
        );


        timer =
            null;


        running =
            false;


        return true;

    }


    /* ========================================================
       PROCESS ONCE
       ======================================================== */

    /*
     * Useful for testing or manually triggering matchmaking.
     */

    function processOnce() {

        return processQueue();

    }


    /* ========================================================
       IS RUNNING
       ======================================================== */

    function isRunning() {

        return running;

    }


    /* ========================================================
       RETURN MODULE API
       ======================================================== */

    return {

        start,

        stop,

        processOnce,

        isRunning,

        intervalMs

    };

}


/* ============================================================
   EXPORTS
   ============================================================ */

module.exports = {

    createMatchmakingWorker

};
