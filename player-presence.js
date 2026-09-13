/* ============================================================
   CARD STUFF YES — PLAYER PRESENCE MODULE
   ============================================================

   This module connects player connections to the online-player
   system.

   It handles:

   - Player connecting
   - Player disconnecting
   - Activity updates
   - Connection state
   - Presence callbacks

   It does NOT handle authentication.

   Authentication belongs to auth.js and sessions.js.

   ============================================================ */


/* ============================================================
   CREATE PLAYER PRESENCE MODULE
   ============================================================ */

function createPlayerPresenceModule(
    onlinePlayers,
    options = {}
) {

    if (!onlinePlayers) {

        throw new Error(
            "The online players module is required."
        );

    }


    /* ========================================================
       CALLBACKS
       ======================================================== */

    const callbacks = {

        onConnect:
            typeof options.onConnect ===
            "function"

                ? options.onConnect

                : null,

        onDisconnect:
            typeof options.onDisconnect ===
            "function"

                ? options.onDisconnect

                : null,

        onActivity:
            typeof options.onActivity ===
            "function"

                ? options.onActivity

                : null

    };


    /* ========================================================
       PLAYER CONNECTED
       ======================================================== */

    function playerConnected(
        playerId,
        connection = null
    ) {

        const player =
            onlinePlayers.addPlayer(
                playerId,
                connection
            );


        if (
            typeof callbacks.onConnect ===
            "function"
        ) {

            callbacks.onConnect(
                player
            );

        }


        return player;

    }


    /* ========================================================
       PLAYER DISCONNECTED
       ======================================================== */

    function playerDisconnected(
        playerId
    ) {

        const player =
            onlinePlayers.getPlayer(
                playerId
            );


        if (!player) {

            return false;

        }


        const removed =
            onlinePlayers.removePlayer(
                playerId
            );


        if (
            removed &&
            typeof callbacks.onDisconnect ===
            "function"
        ) {

            callbacks.onDisconnect(
                player
            );

        }


        return removed;

    }


    /* ========================================================
       PLAYER ACTIVITY
       ======================================================== */

    function playerActivity(
        playerId
    ) {

        const updated =
            onlinePlayers.updateActivity(
                playerId
            );


        if (
            updated &&
            typeof callbacks.onActivity ===
            "function"
        ) {

            callbacks.onActivity(
                onlinePlayers.getPlayer(
                    playerId
                )
            );

        }


        return updated;

    }


    /* ========================================================
       SET PLAYER STATUS
       ======================================================== */

    function setPlayerStatus(
        playerId,
        status
    ) {

        return onlinePlayers.setStatus(
            playerId,
            status
        );

    }


    /* ========================================================
       GET PRESENCE
       ======================================================== */

    function getPresence(
        playerId
    ) {

        return onlinePlayers.getPlayer(
            playerId
        );

    }


    /* ========================================================
       IS ONLINE
       ======================================================== */

    function isOnline(
        playerId
    ) {

        return onlinePlayers.isOnline(
            playerId
        );

    }


    /* ========================================================
       DISCONNECT ALL PLAYERS
       ======================================================== */

    function disconnectAll() {

        const currentPlayers =
            onlinePlayers.getAllOnlinePlayers();


        for (
            const player
            of currentPlayers
        ) {

            playerDisconnected(
                player.playerId
            );

        }


        return currentPlayers.length;

    }


    /* ========================================================
       RETURN MODULE API
       ======================================================== */

    return {

        playerConnected,

        playerDisconnected,

        playerActivity,

        setPlayerStatus,

        getPresence,

        isOnline,

        disconnectAll

    };

}


/* ============================================================
   EXPORTS
   ============================================================ */

module.exports = {

    createPlayerPresenceModule

};
