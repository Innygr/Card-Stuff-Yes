/* ============================================================
   CARD STUFF YES — ONLINE PLAYERS MODULE
   ============================================================

   This module tracks players who are currently connected to
   the Card Stuff Yes server.

   It handles:

   - Adding players
   - Removing players
   - Updating activity
   - Checking whether a player is online
   - Getting the number of online players
   - Getting public online-player information

   This is in-memory state.

   It should NOT be used as permanent account storage.

   ============================================================ */


/* ============================================================
   CREATE ONLINE PLAYERS MODULE
   ============================================================ */

function createOnlinePlayersModule(
    players = null
) {

    /* ========================================================
       ONLINE PLAYER STORAGE
       ======================================================== */

    /*
     * Map:
     *
     *     playerId -> online player state
     *
     * Keeping this in memory means a server restart clears the
     * online-player list automatically.
     */

    const onlinePlayers =
        new Map();


    /* ========================================================
       ADD PLAYER
       ======================================================== */

    function addPlayer(
        playerId,
        connection = null
    ) {

        const existing =
            onlinePlayers.get(
                playerId
            );


        const now =
            Date.now();


        onlinePlayers.set(

            playerId,

            {

                playerId,

                connection,

                connectedAt:
                    existing
                        ? existing.connectedAt
                        : now,

                lastActivity:
                    now,

                status:
                    existing
                        ? existing.status
                        : "online"

            }

        );


        return onlinePlayers.get(
            playerId
        );

    }


    /* ========================================================
       REMOVE PLAYER
       ======================================================== */

    function removePlayer(
        playerId
    ) {

        return onlinePlayers.delete(
            playerId
        );

    }


    /* ========================================================
       UPDATE ACTIVITY
       ======================================================== */

    function updateActivity(
        playerId
    ) {

        const player =
            onlinePlayers.get(
                playerId
            );


        if (!player) {

            return false;

        }


        player.lastActivity =
            Date.now();


        return true;

    }


    /* ========================================================
       SET PLAYER STATUS
       ======================================================== */

    /*
     * Possible statuses currently include:
     *
     *     online
     *     queue
     *     battle
     *
     * More can be added later.
     */

    function setStatus(
        playerId,
        status
    ) {

        const player =
            onlinePlayers.get(
                playerId
            );


        if (!player) {

            return false;

        }


        player.status =
            status;


        player.lastActivity =
            Date.now();


        return true;

    }


    /* ========================================================
       GET PLAYER
       ======================================================== */

    function getPlayer(
        playerId
    ) {

        return onlinePlayers.get(
            playerId
        ) || null;

    }


    /* ========================================================
       IS PLAYER ONLINE
       ======================================================== */

    function isOnline(
        playerId
    ) {

        return onlinePlayers.has(
            playerId
        );

    }


    /* ========================================================
       GET ONLINE PLAYER COUNT
       ======================================================== */

    function getOnlineCount() {

        return onlinePlayers.size;

    }


    /* ========================================================
       GET PLAYERS BY STATUS
       ======================================================== */

    function getPlayersByStatus(
        status
    ) {

        return Array.from(
            onlinePlayers.values()
        ).filter(
            player =>
                player.status === status
        );

    }


    /* ========================================================
       GET ALL ONLINE PLAYERS
       ======================================================== */

    function getAllOnlinePlayers() {

        return Array.from(
            onlinePlayers.values()
        );

    }


    /* ========================================================
       GET PUBLIC ONLINE PLAYERS
       ======================================================== */

    function getPublicOnlinePlayers() {

        const online =
            getAllOnlinePlayers();


        /*
         * If the players module is available, use it to obtain
         * the player's public account information.
         */

        if (
            players &&
            typeof players.getPlayerById ===
                "function"
        ) {

            return online.map(
                onlinePlayer => {

                    const player =
                        players.getPlayerById(
                            onlinePlayer.playerId
                        );


                    if (!player) {

                        return {

                            playerId:
                                onlinePlayer.playerId,

                            status:
                                onlinePlayer.status

                        };

                    }


                    return {

                        playerId:
                            player.id,

                        username:
                            player.username,

                        rank:
                            player.rank,

                        elo:
                            player.elo,

                        status:
                            onlinePlayer.status

                    };

                }
            );

        }


        return online.map(
            onlinePlayer => ({

                playerId:
                    onlinePlayer.playerId,

                status:
                    onlinePlayer.status

            })
        );

    }


    /* ========================================================
       RETURN MODULE API
       ======================================================== */

    return {

        addPlayer,

        removePlayer,

        updateActivity,

        setStatus,

        getPlayer,

        isOnline,

        getOnlineCount,

        getPlayersByStatus,

        getAllOnlinePlayers,

        getPublicOnlinePlayers

    };

}


/* ============================================================
   EXPORTS
   ============================================================ */

module.exports = {

    createOnlinePlayersModule

};
