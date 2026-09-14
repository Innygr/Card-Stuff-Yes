/*
 * ============================================================
 * Card Stuff Yes
 * Turn System
 * ============================================================
 *
 * This module controls everything related to turns.
 *
 * Responsibilities:
 *
 * - Starting turns
 * - Ending turns
 * - Selecting the next player
 * - Tracking turn activity
 * - AFK detection
 * - AFK warnings
 * - Automatically ending AFK turns
 *
 * Important:
 *
 * The server is authoritative.
 *
 * The client should NEVER decide when a turn ends or how much
 * time a player has left.
 *
 * ============================================================
 */


/* ============================================================
   DEFAULT SETTINGS
   ============================================================ */

const DEFAULT_SETTINGS = {

    /*
     * A player can be inactive for 90 seconds before
     * their turn is automatically ended.
     */
    afkLimitMs: 90 * 1000,

    /*
     * Warning thresholds.
     *
     * These are intentionally not a constantly-visible timer.
     *
     * The UI can choose to show a warning when one of these
     * thresholds is reached.
     */
    warningThresholdsMs: [
        90 * 1000,
        60 * 1000,
        30 * 1000
    ],

    /*
     * How often the server checks for AFK players.
     *
     * 1 second gives us enough accuracy without constantly
     * running the check.
     */
    checkIntervalMs: 1000

};


/* ============================================================
   TURN SYSTEM FACTORY
   ============================================================ */

function createTurnSystem(options = {}) {

    /*
     * The game-state module is supplied by server.js.
     *
     * This keeps the turn system independent from the actual
     * storage implementation.
     */
    const gameState = options.gameState || null;


    /*
     * Battle module.
     *
     * Used to determine which players are actually in the
     * battle and what their turn order should be.
     */
    const battles = options.battles || null;


    /*
     * Event callback.
     *
     * Other modules can use this to broadcast turn changes
     * to clients.
     */
    const emitEvent =
        typeof options.emitEvent === "function"
            ? options.emitEvent
            : () => {};


    /*
     * Merge supplied settings with defaults.
     */
    const settings = {

        ...DEFAULT_SETTINGS,

        ...(options.settings || {})

    };


    /*
     * Stores turn information independently from the game state.
     *
     * Structure:
     *
     * battleId -> {
     *     playerOrder: [],
     *     currentPlayerIndex: 0,
     *     currentPlayerId: "...",
     *     startedAt: timestamp,
     *     lastActivityAt: timestamp,
     *     warningsSent: Set
     * }
     */
    const turns = new Map();


    /*
     * Timer used for AFK checks.
     */
    let checkTimer = null;


    /* ========================================================
       BASIC HELPERS
       ======================================================== */

    function now() {

        return Date.now();

    }


    function getTurn(battleId) {

        return turns.get(String(battleId)) || null;

    }


    function normalizeBattleId(battleId) {

        return String(battleId);

    }


    /*
     * Find players from the battle object.
     *
     * Different versions of the battle module may expose
     * players slightly differently, so this helper accepts
     * several reasonable structures.
     */
    function getBattlePlayers(battleId) {

        if (!battles) {

            return [];

        }


        let battle = null;


        if (typeof battles.getBattle === "function") {

            battle =
                battles.getBattle(battleId);

        }


        if (!battle && battles.battles instanceof Map) {

            battle =
                battles.battles.get(
                    normalizeBattleId(battleId)
                );

        }


        if (!battle) {

            return [];

        }


        if (Array.isArray(battle.players)) {

            return battle.players
                .map(player => {

                    if (
                        typeof player === "string" ||
                        typeof player === "number"
                    ) {

                        return String(player);

                    }

                    if (player && player.id != null) {

                        return String(player.id);

                    }

                    if (
                        player &&
                        player.playerId != null
                    ) {

                        return String(player.playerId);

                    }

                    return null;

                })
                .filter(Boolean);

        }


        if (battle.playerIds instanceof Set) {

            return Array.from(
                battle.playerIds
            ).map(String);

        }


        if (Array.isArray(battle.playerIds)) {

            return battle.playerIds.map(String);

        }


        return [];

    }


    /*
     * Get the game state if the supplied game-state module
     * supports it.
     */
    function getState(battleId) {

        if (!gameState) {

            return null;

        }


        if (typeof gameState.getState === "function") {

            return gameState.getState(
                battleId
            );

        }


        return null;

    }


    /*
     * Store a game state if supported.
     */
    function saveState(battleId, state) {

        if (!gameState) {

            return;

        }


        if (typeof gameState.setState === "function") {

            gameState.setState(
                battleId,
                state
            );

        }

    }


    /* ========================================================
       PLAYER ORDER
       ======================================================== */

    /*
     * Creates a deterministic player order.
     *
     * The battle module can provide its own order. Otherwise
     * the order is based on the players currently in the battle.
     */
    function createPlayerOrder(battleId, suppliedPlayers = null) {

        let players = [];


        if (Array.isArray(suppliedPlayers)) {

            players =
                suppliedPlayers
                    .map(String);

        } else {

            players =
                getBattlePlayers(
                    battleId
                );

        }


        /*
         * Remove accidental duplicates while preserving order.
         */
        players =
            Array.from(
                new Set(players)
            );


        return players;

    }


    /* ========================================================
       START TURN
       ======================================================== */

    function startTurn(
        battleId,
        playerOrder = null,
        playerId = null
    ) {

        battleId =
            normalizeBattleId(
                battleId
            );


        let order =
            createPlayerOrder(
                battleId,
                playerOrder
            );


        if (order.length === 0) {

            /*
             * If no battle information is available yet,
             * allow an explicitly supplied player ID to
             * bootstrap the turn system.
             */
            if (playerId != null) {

                order = [
                    String(playerId)
                ];

            } else {

                return {
                    success: false,
                    error: "NO_PLAYERS"
                };

            }

        }


        let index = 0;


        if (playerId != null) {

            const requested =
                String(playerId);

            const requestedIndex =
                order.indexOf(
                    requested
                );


            if (requestedIndex !== -1) {

                index =
                    requestedIndex;

            }

        }


        const timestamp =
            now();


        const turn = {

            battleId,

            playerOrder: order,

            currentPlayerIndex: index,

            currentPlayerId:
                order[index],

            startedAt: timestamp,

            lastActivityAt: timestamp,

            warningsSent: new Set()

        };


        turns.set(
            battleId,
            turn
        );


        /*
         * Keep the game state synchronized.
         */
        const state =
            getState(
                battleId
            );


        if (state) {

            state.currentTurn = {

                playerId:
                    turn.currentPlayerId,

                startedAt:
                    turn.startedAt,

                lastActivityAt:
                    turn.lastActivityAt

            };


            saveState(
                battleId,
                state
            );

        }


        emitEvent({

            type: "turn.started",

            battleId,

            playerId:
                turn.currentPlayerId,

            startedAt:
                turn.startedAt

        });


        return {

            success: true,

            turn: getPublicTurn(
                battleId
            )

        };

    }


    /* ========================================================
       END TURN
       ======================================================== */

    function endTurn(
        battleId,
        reason = "manual"
    ) {

        battleId =
            normalizeBattleId(
                battleId
            );


        const turn =
            getTurn(
                battleId
            );


        if (!turn) {

            return {

                success: false,

                error: "NO_ACTIVE_TURN"

            };

        }


        const previousPlayerId =
            turn.currentPlayerId;


        /*
         * Advance to the next player.
         */
        const nextResult =
            advanceTurn(
                battleId
            );


        emitEvent({

            type: "turn.ended",

            battleId,

            playerId:
                previousPlayerId,

            reason,

            nextPlayerId:
                nextResult.success
                    ? nextResult.turn.currentPlayerId
                    : null

        });


        return nextResult;

    }


    /* ========================================================
       ADVANCE TURN
       ======================================================== */

    function advanceTurn(battleId) {

        battleId =
            normalizeBattleId(
                battleId
            );


        const turn =
            getTurn(
                battleId
            );


        if (!turn) {

            return {

                success: false,

                error: "NO_ACTIVE_TURN"

            };

        }


        if (
            turn.playerOrder.length === 0
        ) {

            return {

                success: false,

                error: "NO_PLAYERS"

            };

        }


        /*
         * Move to the next player.
         *
         * % makes the order wrap around.
         */
        turn.currentPlayerIndex =
            (
                turn.currentPlayerIndex + 1
            ) %
            turn.playerOrder.length;


        turn.currentPlayerId =
            turn.playerOrder[
                turn.currentPlayerIndex
            ];


        const timestamp =
            now();


        turn.startedAt =
            timestamp;

        turn.lastActivityAt =
            timestamp;


        /*
         * Reset warnings for the new turn.
         */
        turn.warningsSent.clear();


        /*
         * Synchronize the main game state.
         */
        const state =
            getState(
                battleId
            );


        if (state) {

            state.currentTurn = {

                playerId:
                    turn.currentPlayerId,

                startedAt:
                    turn.startedAt,

                lastActivityAt:
                    turn.lastActivityAt

            };


            saveState(
                battleId,
                state
            );

        }


        emitEvent({

            type: "turn.started",

            battleId,

            playerId:
                turn.currentPlayerId,

            startedAt:
                turn.startedAt

        });


        return {

            success: true,

            turn:
                getPublicTurn(
                    battleId
                )

        };

    }


    /* ========================================================
       ACTIVITY
       ======================================================== */

    /*
     * Records player activity.
     *
     * Activity should be recorded when the player sends a
     * meaningful game action, rather than on every mouse move.
     */
    function recordActivity(
        battleId,
        playerId
    ) {

        battleId =
            normalizeBattleId(
                battleId
            );


        const turn =
            getTurn(
                battleId
            );


        if (!turn) {

            return {

                success: false,

                error: "NO_ACTIVE_TURN"

            };

        }


        if (
            String(playerId) !==
            String(turn.currentPlayerId)
        ) {

            /*
             * Activity from another player does not reset
             * the active player's AFK timer.
             */
            return {

                success: false,

                error: "NOT_CURRENT_PLAYER"

            };

        }


        turn.lastActivityAt =
            now();


        /*
         * If a warning was already sent, activity does not
         * necessarily need to notify the client again.
         *
         * The warning set is cleared because the player has
         * become active again.
         */
        turn.warningsSent.clear();


        return {

            success: true

        };

    }


    /* ========================================================
       AFK INFORMATION
       ======================================================== */

    function getInactiveTime(
        battleId
    ) {

        const turn =
            getTurn(
                battleId
            );


        if (!turn) {

            return null;

        }


        return Math.max(

            0,

            now() -
            turn.lastActivityAt

        );

    }


    function getRemainingAFKTime(
        battleId
    ) {

        const inactive =
            getInactiveTime(
                battleId
            );


        if (inactive == null) {

            return null;

        }


        return Math.max(

            0,

            settings.afkLimitMs -
            inactive

        );

    }


    /* ========================================================
       WARNING CHECK
       ======================================================== */

    function checkWarnings(
        battleId
    ) {

        const turn =
            getTurn(
                battleId
            );


        if (!turn) {

            return;

        }


        const inactive =
            getInactiveTime(
                battleId
            );


        if (inactive == null) {

            return;

        }


        /*
         * We warn at:
         *
         * 90 seconds
         * 60 seconds
         * under 30 seconds
         *
         * The 90-second warning may occur at the moment
         * the limit is reached. The actual automatic turn
         * ending is handled separately.
         */


        /*
         * 90-second threshold.
         */
        if (
            inactive >=
            settings.warningThresholdsMs[0] &&
            !turn.warningsSent.has(90)
        ) {

            turn.warningsSent.add(90);


            emitEvent({

                type: "turn.afk-warning",

                battleId,

                playerId:
                    turn.currentPlayerId,

                threshold: 90,

                remainingMs:
                    Math.max(
                        0,
                        settings.afkLimitMs -
                        inactive
                    )

            });

        }


        /*
         * 60-second threshold.
         */
        if (
            inactive >=
            settings.warningThresholdsMs[1] &&
            !turn.warningsSent.has(60)
        ) {

            turn.warningsSent.add(60);


            emitEvent({

                type: "turn.afk-warning",

                battleId,

                playerId:
                    turn.currentPlayerId,

                threshold: 60,

                remainingMs:
                    Math.max(
                        0,
                        settings.afkLimitMs -
                        inactive
                    )

            });

        }


        /*
         * Under-30-second warning.
         *
         * We intentionally send this only once rather than
         * constantly displaying a countdown.
         */
        if (
            inactive >=
            settings.warningThresholdsMs[2] &&
            !turn.warningsSent.has(30)
        ) {

            turn.warningsSent.add(30);


            emitEvent({

                type: "turn.afk-warning",

                battleId,

                playerId:
                    turn.currentPlayerId,

                threshold: 30,

                remainingMs:
                    Math.max(
                        0,
                        settings.afkLimitMs -
                        inactive
                    )

            });

        }

    }


    /* ========================================================
       AFK TURN EXPIRATION
       ======================================================== */

    function checkAFK(
        battleId
    ) {

        const turn =
            getTurn(
                battleId
            );


        if (!turn) {

            return;

        }


        const inactive =
            getInactiveTime(
                battleId
            );


        if (inactive == null) {

            return;

        }


        if (
            inactive >=
            settings.afkLimitMs
        ) {

            /*
             * Automatically end the turn.
             */
            endTurn(
                battleId,
                "afk"
            );

        }

    }


    function checkAllTurns() {

        for (
            const battleId
            of turns.keys()
        ) {

            checkWarnings(
                battleId
            );

            checkAFK(
                battleId
            );

        }

    }


    /* ========================================================
       PUBLIC TURN DATA
       ======================================================== */

    function getPublicTurn(
        battleId
    ) {

        const turn =
            getTurn(
                battleId
            );


        if (!turn) {

            return null;

        }


        return {

            battleId:
                turn.battleId,

            currentPlayerId:
                turn.currentPlayerId,

            currentPlayerIndex:
                turn.currentPlayerIndex,

            playerCount:
                turn.playerOrder.length,

            startedAt:
                turn.startedAt,

            lastActivityAt:
                turn.lastActivityAt

        };

    }


    /* ========================================================
       TURN VALIDATION
       ======================================================== */

    function isPlayersTurn(
        battleId,
        playerId
    ) {

        const turn =
            getTurn(
                battleId
            );


        if (!turn) {

            return false;

        }


        return (
            String(playerId) ===
            String(turn.currentPlayerId)
        );

    }


    function requirePlayersTurn(
        battleId,
        playerId
    ) {

        if (
            !isPlayersTurn(
                battleId,
                playerId
            )
        ) {

            return {

                valid: false,

                error:
                    "NOT_YOUR_TURN"

            };

        }


        return {

            valid: true

        };

    }


    /* ========================================================
       TURN CLEANUP
       ======================================================== */

    function removeBattle(
        battleId
    ) {

        battleId =
            normalizeBattleId(
                battleId
            );


        turns.delete(
            battleId
        );

    }


    /* ========================================================
       TIMER CONTROL
       ======================================================== */

    function startAFKChecker() {

        if (checkTimer) {

            return;

        }


        checkTimer =
            setInterval(

                checkAllTurns,

                settings.checkIntervalMs

            );


        /*
         * Prevent this timer from keeping Node.js alive
         * during shutdown.
         */
        if (
            checkTimer &&
            typeof checkTimer.unref === "function"
        ) {

            checkTimer.unref();

        }

    }


    function stopAFKChecker() {

        if (!checkTimer) {

            return;

        }


        clearInterval(
            checkTimer
        );


        checkTimer = null;

    }


    /* ========================================================
       PUBLIC API
       ======================================================== */

    startAFKChecker();


    return {

        startTurn,

        endTurn,

        advanceTurn,

        recordActivity,

        getTurn,

        getPublicTurn,

        getInactiveTime,

        getRemainingAFKTime,

        isPlayersTurn,

        requirePlayersTurn,

        removeBattle,

        startAFKChecker,

        stopAFKChecker,

        settings

    };

}


/* ============================================================
   EXPORT
   ============================================================ */

module.exports = {

    createTurnSystem

};
