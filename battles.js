/* ============================================================
   CARD STUFF YES — BATTLES MODULE
   ============================================================

   This module manages active multiplayer battles.

   It handles:

   - Creating battles
   - Adding players to battles
   - Removing players
   - Tracking battle state
   - Ending battles
   - Finding a player's current battle
   - Counting active battles

   This module does NOT decide the actual card-game rules yet.

   The actual turn/combat rules can be added later without
   changing matchmaking.

   ============================================================ */


/* ============================================================
   CREATE BATTLES MODULE
   ============================================================ */

function createBattlesModule(
    onlinePlayers = null
) {

    /* ========================================================
       BATTLE STORAGE
       ======================================================== */

    /*
     * Map:
     *
     *     battleId -> battle
     */

    const battles =
        new Map();


    /*
     * Map:
     *
     *     playerId -> battleId
     *
     * This allows very fast lookup of a player's current battle.
     */

    const playerBattles =
        new Map();


    /* ========================================================
       BATTLE ID GENERATOR
       ======================================================== */

    let nextBattleId =
        1;


    function generateBattleId() {

        const battleId =
            `battle-${nextBattleId}`;


        nextBattleId++;


        return battleId;

    }


    /* ========================================================
       CREATE BATTLE
       ======================================================== */

    function createBattle(
        playerIds
    ) {

        if (
            !Array.isArray(playerIds)
        ) {

            throw new Error(
                "Battle players must be an array."
            );

        }


        if (
            playerIds.length <
            2
        ) {

            throw new Error(
                "A battle requires at least two players."
            );

        }


        /* ----------------------------------------------------
           DUPLICATE PLAYERS
           ---------------------------------------------------- */

        const uniquePlayers =
            new Set(
                playerIds
            );


        if (
            uniquePlayers.size !==
            playerIds.length
        ) {

            throw new Error(
                "A battle cannot contain duplicate players."
            );

        }


        /* ----------------------------------------------------
           CHECK EXISTING BATTLES
           ---------------------------------------------------- */

        for (
            const playerId
            of playerIds
        ) {

            if (
                playerBattles.has(
                    playerId
                )
            ) {

                throw new Error(
                    `Player ${playerId} is already in a battle.`
                );

            }

        }


        /* ----------------------------------------------------
           CREATE BATTLE
           ---------------------------------------------------- */

        const battleId =
            generateBattleId();


        const battle = {

            id:
                battleId,

            playerIds:
                [
                    ...playerIds
                ],

            state:
                "active",

            createdAt:
                new Date().toISOString(),

            endedAt:
                null,

            winnerId:
                null,

            currentTurn:
                0

        };


        battles.set(
            battleId,
            battle
        );


        for (
            const playerId
            of playerIds
        ) {

            playerBattles.set(
                playerId,
                battleId
            );


            if (
                onlinePlayers &&
                typeof onlinePlayers.setStatus ===
                    "function"
            ) {

                onlinePlayers.setStatus(
                    playerId,
                    "battle"
                );

            }

        }


        return battle;

    }


    /* ========================================================
       GET BATTLE
       ======================================================== */

    function getBattle(
        battleId
    ) {

        return battles.get(
            battleId
        ) || null;

    }


    /* ========================================================
       GET PLAYER BATTLE
       ======================================================== */

    function getPlayerBattle(
        playerId
    ) {

        const battleId =
            playerBattles.get(
                playerId
            );


        if (!battleId) {

            return null;

        }


        return getBattle(
            battleId
        );

    }


    /* ========================================================
       IS PLAYER IN BATTLE
       ======================================================== */

    function isPlayerInBattle(
        playerId
    ) {

        return playerBattles.has(
            playerId
        );

    }


    /* ========================================================
       UPDATE TURN
       ======================================================== */

    function setCurrentTurn(
        battleId,
        turnIndex
    ) {

        const battle =
            getBattle(
                battleId
            );


        if (!battle) {

            return false;

        }


        if (
            battle.state !==
            "active"
        ) {

            return false;

        }


        if (
            !Number.isInteger(
                turnIndex
            )
        ) {

            return false;

        }


        if (
            turnIndex < 0 ||
            turnIndex >=
            battle.playerIds.length
        ) {

            return false;

        }


        battle.currentTurn =
            turnIndex;


        return true;

    }


    /* ========================================================
       GET CURRENT PLAYER
       ======================================================== */

    function getCurrentPlayer(
        battleId
    ) {

        const battle =
            getBattle(
                battleId
            );


        if (!battle) {

            return null;

        }


        return (
            battle.playerIds[
                battle.currentTurn
            ] || null
        );

    }


    /* ========================================================
       END BATTLE
       ======================================================== */

    function endBattle(
        battleId,
        winnerId = null
    ) {

        const battle =
            getBattle(
                battleId
            );


        if (!battle) {

            return null;

        }


        if (
            battle.state ===
            "ended"
        ) {

            return battle;

        }


        if (
            winnerId !== null &&
            !battle.playerIds.includes(
                winnerId
            )
        ) {

            throw new Error(
                "Winner must be a player in the battle."
            );

        }


        battle.state =
            "ended";


        battle.endedAt =
            new Date().toISOString();


        battle.winnerId =
            winnerId;


        for (
            const playerId
            of battle.playerIds
        ) {

            playerBattles.delete(
                playerId
            );


            if (
                onlinePlayers &&
                typeof onlinePlayers.setStatus ===
                    "function"
            ) {

                onlinePlayers.setStatus(
                    playerId,
                    "online"
                );

            }

        }


        return battle;

    }


    /* ========================================================
       REMOVE PLAYER FROM BATTLE
       ======================================================== */

    function removePlayer(
        playerId
    ) {

        const battleId =
            playerBattles.get(
                playerId
            );


        if (!battleId) {

            return false;

        }


        const battle =
            getBattle(
                battleId
            );


        if (!battle) {

            playerBattles.delete(
                playerId
            );


            return false;

        }


        /*
         * A player leaving an active battle currently ends the
         * battle.
         *
         * The exact disconnect/forfeit rules can be changed later.
         */

        endBattle(
            battleId,
            null
        );


        return true;

    }


    /* ========================================================
       GET ACTIVE BATTLES
       ======================================================== */

    function getActiveBattles() {

        return Array.from(
            battles.values()
        ).filter(
            battle =>
                battle.state ===
                "active"
        );

    }


    /* ========================================================
       GET ACTIVE BATTLE COUNT
       ======================================================== */

    function getActiveBattleCount() {

        return getActiveBattles()
            .length;

    }


    /* ========================================================
       GET ALL BATTLES
       ======================================================== */

    function getAllBattles() {

        return Array.from(
            battles.values()
        );

    }


    /* ========================================================
       CLEAN FINISHED BATTLES
       ======================================================== */

    /*
     * Remove old completed battles from memory.
     *
     * This prevents the in-memory Map from growing forever.
     */

    function cleanFinishedBattles() {

        for (
            const [
                battleId,
                battle
            ]
            of battles
        ) {

            if (
                battle.state ===
                "ended"
            ) {

                battles.delete(
                    battleId
                );

            }

        }

    }


    /* ========================================================
       RETURN MODULE API
       ======================================================== */

    return {

        createBattle,

        getBattle,

        getPlayerBattle,

        isPlayerInBattle,

        setCurrentTurn,

        getCurrentPlayer,

        endBattle,

        removePlayer,

        getActiveBattles,

        getActiveBattleCount,

        getAllBattles,

        cleanFinishedBattles

    };

}


/* ============================================================
   EXPORTS
   ============================================================ */

module.exports = {

    createBattlesModule

};
