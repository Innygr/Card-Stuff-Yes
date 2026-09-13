/* ============================================================
   CARD STUFF YES — MATCHMAKING MODULE
   ============================================================

   This module manages the multiplayer matchmaking queue.

   It handles:

   - Joining the queue
   - Leaving the queue
   - Checking queue membership
   - Finding players to put into a game
   - Removing players from the queue
   - Getting queue information

   It does NOT create the actual battle.

   Once enough players have been found, the battles module
   receives those players.

   ============================================================ */


/* ============================================================
   CREATE MATCHMAKING MODULE
   ============================================================ */

function createMatchmakingModule(
    config = {},
    onlinePlayers = null
) {

    /* ========================================================
       CONFIGURATION
       ======================================================== */

    const maxPlayersPerGame =
        Number.isInteger(
            config.maxPlayersPerGame
        ) &&
        config.maxPlayersPerGame > 0

            ? config.maxPlayersPerGame

            : 4;


    /* ========================================================
       MATCHMAKING QUEUE
       ======================================================== */

    /*
     * Array is used intentionally.
     *
     * The queue is first-in-first-out.
     */

    const queue =
        [];


    /* ========================================================
       CHECK QUEUE
       ======================================================== */

    function isQueued(
        playerId
    ) {

        return queue.includes(
            playerId
        );

    }


    /* ========================================================
       JOIN QUEUE
       ======================================================== */

    function joinQueue(
        playerId
    ) {

        if (
            isQueued(playerId)
        ) {

            return {

                success: false,

                error:
                    "Player is already in the matchmaking queue."

            };

        }


        if (
            onlinePlayers &&
            typeof onlinePlayers.isOnline ===
                "function" &&
            !onlinePlayers.isOnline(
                playerId
            )
        ) {

            return {

                success: false,

                error:
                    "Player must be online to join matchmaking."

            };

        }


        queue.push(
            playerId
        );


        if (
            onlinePlayers &&
            typeof onlinePlayers.setStatus ===
                "function"
        ) {

            onlinePlayers.setStatus(
                playerId,
                "queue"
            );

        }


        return {

            success: true,

            playerId,

            queuePosition:
                queue.length

        };

    }


    /* ========================================================
       LEAVE QUEUE
       ======================================================== */

    function leaveQueue(
        playerId
    ) {

        const index =
            queue.indexOf(
                playerId
            );


        if (
            index === -1
        ) {

            return false;

        }


        queue.splice(
            index,
            1
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


        return true;

    }


    /* ========================================================
       REMOVE PLAYERS FROM QUEUE
       ======================================================== */

    function removePlayers(
        playerIds
    ) {

        for (
            const playerId
            of playerIds
        ) {

            leaveQueue(
                playerId
            );

        }

    }


    /* ========================================================
       GET QUEUE SIZE
       ======================================================== */

    function getQueueSize() {

        return queue.length;

    }


    /* ========================================================
       GET QUEUE
       ======================================================== */

    function getQueue() {

        return [
            ...queue
        ];

    }


    /* ========================================================
       FIND NEXT MATCH
       ======================================================== */

    /*
     * Take enough players from the front of the queue to create
     * one game.
     *
     * The battle itself is NOT created here.
     */

    function findNextMatch() {

        if (
            queue.length <
            2
        ) {

            return null;

        }


        const playerCount =
            Math.min(

                maxPlayersPerGame,

                queue.length

            );


        const playerIds =
            queue.splice(
                0,
                playerCount
            );


        for (
            const playerId
            of playerIds
        ) {

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


        return {

            playerIds,

            playerCount:
                playerIds.length

        };

    }


    /* ========================================================
       GET QUEUE POSITION
       ======================================================== */

    function getQueuePosition(
        playerId
    ) {

        const index =
            queue.indexOf(
                playerId
            );


        if (
            index === -1
        ) {

            return null;

        }


        return index + 1;

    }


    /* ========================================================
       RETURN MODULE API
       ======================================================== */

    return {

        maxPlayersPerGame,

        joinQueue,

        leaveQueue,

        removePlayers,

        isQueued,

        getQueueSize,

        getQueue,

        findNextMatch,

        getQueuePosition

    };

}


/* ============================================================
   EXPORTS
   ============================================================ */

module.exports = {

    createMatchmakingModule

};
