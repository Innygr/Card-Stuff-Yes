/* ============================================================
   CARD STUFF YES — GAME STATE MODULE
   ============================================================

   This module manages the shared state of an individual game.

   It is intentionally separate from battles.js.

   battles.js answers:
       "Which players are in this battle?"

   game-state.js answers:
       "What is happening inside this game?"

   This module currently provides the foundation for:

   - Game state creation
   - Player state
   - Turn tracking
   - Game status
   - Generic game data
   - Reading and updating game state

   The actual card rules will be added later.

   ============================================================ */


/* ============================================================
   CREATE GAME STATE MODULE
   ============================================================ */

function createGameStateModule() {

    /* ========================================================
       GAME STORAGE
       ======================================================== */

    /*
     * Map:
     *
     *     gameId -> game state
     *
     * Game state is temporary and exists only while the server
     * is running.
     */

    const games =
        new Map();


    /* ========================================================
       GAME ID GENERATOR
       ======================================================== */

    let nextGameId =
        1;


    function generateGameId() {

        const gameId =
            `game-${nextGameId}`;


        nextGameId++;


        return gameId;

    }


    /* ========================================================
       CREATE GAME
       ======================================================== */

    function createGame(
        playerIds,
        options = {}
    ) {

        if (
            !Array.isArray(playerIds)
        ) {

            throw new Error(
                "Game players must be an array."
            );

        }


        if (
            playerIds.length <
            2
        ) {

            throw new Error(
                "A game requires at least two players."
            );

        }


        const uniquePlayers =
            new Set(
                playerIds
            );


        if (
            uniquePlayers.size !==
            playerIds.length
        ) {

            throw new Error(
                "A game cannot contain duplicate players."
            );

        }


        const gameId =
            generateGameId();


        /*
         * Each player gets their own state object.
         *
         * More properties can be added as the card-game rules
         * are implemented.
         */

        const playerStates =
            new Map();


        for (
            const playerId
            of playerIds
        ) {

            playerStates.set(

                playerId,

                {

                    playerId,

                    connected: true,

                    ready: false,

                    eliminated: false,

                    hand: [],

                    deck: [],

                    discard: []

                }

            );

        }


        const game = {

            id:
                gameId,

            state:
                "waiting",

            createdAt:
                new Date().toISOString(),

            startedAt:
                null,

            endedAt:
                null,

            playerIds:
                [
                    ...playerIds
                ],

            playerStates,

            currentTurn:
                0,

            turnNumber:
                0,

            data:
                options.data ||
                {}

        };


        games.set(
            gameId,
            game
        );


        return game;

    }


    /* ========================================================
       GET GAME
       ======================================================== */

    function getGame(
        gameId
    ) {

        return games.get(
            gameId
        ) || null;

    }


    /* ========================================================
       DELETE GAME
       ======================================================== */

    function deleteGame(
        gameId
    ) {

        return games.delete(
            gameId
        );

    }


    /* ========================================================
       GET PLAYER STATE
       ======================================================== */

    function getPlayerState(
        gameId,
        playerId
    ) {

        const game =
            getGame(
                gameId
            );


        if (!game) {

            return null;

        }


        return game.playerStates.get(
            playerId
        ) || null;

    }


    /* ========================================================
       SET PLAYER READY
       ======================================================== */

    function setPlayerReady(
        gameId,
        playerId,
        ready
    ) {

        const player =
            getPlayerState(
                gameId,
                playerId
            );


        if (!player) {

            return false;

        }


        player.ready =
            Boolean(
                ready
            );


        return true;

    }


    /* ========================================================
       ARE ALL PLAYERS READY?
       ======================================================== */

    function areAllPlayersReady(
        gameId
    ) {

        const game =
            getGame(
                gameId
            );


        if (!game) {

            return false;

        }


        return game.playerIds.every(
            playerId => {

                const player =
                    game.playerStates.get(
                        playerId
                    );


                return (
                    player &&
                    player.ready
                );

            }
        );

    }


    /* ========================================================
       START GAME
       ======================================================== */

    function startGame(
        gameId
    ) {

        const game =
            getGame(
                gameId
            );


        if (!game) {

            return null;

        }


        if (
            game.state !==
            "waiting"
        ) {

            return game;

        }


        game.state =
            "active";


        game.startedAt =
            new Date().toISOString();


        game.currentTurn =
            0;


        game.turnNumber =
            1;


        return game;

    }


    /* ========================================================
       SET GAME STATE
       ======================================================== */

    function setGameState(
        gameId,
        state
    ) {

        const game =
            getGame(
                gameId
            );


        if (!game) {

            return false;

        }


        game.state =
            state;


        return true;

    }


    /* ========================================================
       ADVANCE TURN
       ======================================================== */

    function advanceTurn(
        gameId
    ) {

        const game =
            getGame(
                gameId
            );


        if (!game) {

            return null;

        }


        if (
            game.playerIds.length ===
            0
        ) {

            return null;

        }


        let attempts =
            0;


        do {

            game.currentTurn =
                (
                    game.currentTurn + 1
                ) %
                game.playerIds.length;


            attempts++;

            const currentPlayer =
                game.playerStates.get(
                    game.playerIds[
                        game.currentTurn
                    ]
                );


            /*
             * Eliminated players are skipped.
             */

            if (
                currentPlayer &&
                !currentPlayer.eliminated
            ) {

                break;

            }

        } while (
            attempts <=
            game.playerIds.length
        );


        game.turnNumber++;


        return getCurrentPlayer(
            gameId
        );

    }


    /* ========================================================
       GET CURRENT PLAYER
       ======================================================== */

    function getCurrentPlayer(
        gameId
    ) {

        const game =
            getGame(
                gameId
            );


        if (!game) {

            return null;

        }


        return (
            game.playerIds[
                game.currentTurn
            ] || null
        );

    }


    /* ========================================================
       ELIMINATE PLAYER
       ======================================================== */

    function eliminatePlayer(
        gameId,
        playerId
    ) {

        const player =
            getPlayerState(
                gameId,
                playerId
            );


        if (!player) {

            return false;

        }


        player.eliminated =
            true;


        return true;

    }


    /* ========================================================
       SET PLAYER CONNECTION STATE
       ======================================================== */

    function setPlayerConnected(
        gameId,
        playerId,
        connected
    ) {

        const player =
            getPlayerState(
                gameId,
                playerId
            );


        if (!player) {

            return false;

        }


        player.connected =
            Boolean(
                connected
            );


        return true;

    }


    /* ========================================================
       END GAME
       ======================================================== */

    function endGame(
        gameId,
        winnerId = null
    ) {

        const game =
            getGame(
                gameId
            );


        if (!game) {

            return null;

        }


        game.state =
            "ended";


        game.endedAt =
            new Date().toISOString();


        game.data.winnerId =
            winnerId;


        return game;

    }


    /* ========================================================
       GET ACTIVE GAMES
       ======================================================== */

    function getActiveGames() {

        return Array.from(
            games.values()
        ).filter(
            game =>
                game.state ===
                "active"
        );

    }


    /* ========================================================
       GET ACTIVE GAME COUNT
       ======================================================== */

    function getActiveGameCount() {

        return getActiveGames()
            .length;

    }


    /* ========================================================
       CLEAN FINISHED GAMES
       ======================================================== */

    function cleanFinishedGames() {

        for (
            const [
                gameId,
                game
            ]
            of games
        ) {

            if (
                game.state ===
                "ended"
            ) {

                games.delete(
                    gameId
                );

            }

        }

    }


    /* ========================================================
       RETURN MODULE API
       ======================================================== */

    return {

        createGame,

        getGame,

        deleteGame,

        getPlayerState,

        setPlayerReady,

        areAllPlayersReady,

        startGame,

        setGameState,

        advanceTurn,

        getCurrentPlayer,

        eliminatePlayer,

        setPlayerConnected,

        endGame,

        getActiveGames,

        getActiveGameCount,

        cleanFinishedGames

    };

}


/* ============================================================
   EXPORTS
   ============================================================ */

module.exports = {

    createGameStateModule

};
