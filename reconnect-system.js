/*
 * ============================================================
 * Card Stuff Yes
 * Reconnect System
 * ============================================================
 *
 * This module handles players temporarily disconnecting from
 * an active battle.
 *
 * Main rules:
 *
 * - A disconnected player gets 30 seconds to reconnect.
 * - Their battle remains active during that window.
 * - Their battle state is preserved.
 * - Reconnecting restores their connection state.
 * - If the 30 seconds expire, the player is considered
 *   permanently disconnected.
 *
 * This module does NOT decide the exact forfeit result.
 * Instead, it calls an onReconnectExpired callback so the
 * battle/game layer can decide what should happen.
 *
 * This keeps reconnect logic separate from battle rules.
 *
 * ============================================================
 */


"use strict";


/* ============================================================
   DEFAULT SETTINGS
   ============================================================ */

const DEFAULT_RECONNECT_TIME_MS = 30 * 1000;


/* ============================================================
   PLAYER RECONNECT STATUS
   ============================================================ */

const RECONNECT_STATUS = Object.freeze({

    CONNECTED: "connected",

    DISCONNECTED: "disconnected",

    RECONNECTED: "reconnected",

    EXPIRED: "expired"

});


/* ============================================================
   RECONNECT SYSTEM
   ============================================================ */

function createReconnectSystem(options = {}) {

    /*
     * How long a player has to reconnect.
     *
     * Default:
     *
     * 30 seconds
     */

    const reconnectTimeMs =
        Number.isFinite(options.reconnectTimeMs)
            ? Math.max(
                1000,
                options.reconnectTimeMs
            )
            : DEFAULT_RECONNECT_TIME_MS;


    /*
     * Stores reconnect information.
     *
     * Key:
     *
     *     playerId
     *
     * Value:
     *
     * {
     *     playerId,
     *     battleId,
     *     disconnectedAt,
     *     expiresAt,
     *     status
     * }
     */

    const reconnects = new Map();


    /*
     * Optional callback used when a reconnect window expires.
     */

    const onReconnectExpired =
        typeof options.onReconnectExpired === "function"
            ? options.onReconnectExpired
            : null;


    /* ========================================================
       MARK PLAYER DISCONNECTED
       ======================================================== */

    function markDisconnected(playerId, battleId) {

        if (
            playerId === undefined ||
            playerId === null
        ) {

            throw new Error(
                "playerId is required"
            );

        }


        if (
            battleId === undefined ||
            battleId === null
        ) {

            throw new Error(
                "battleId is required"
            );

        }


        const now = Date.now();

        const reconnectData = {

            playerId,

            battleId,

            disconnectedAt: now,

            expiresAt:
                now + reconnectTimeMs,

            status:
                RECONNECT_STATUS.DISCONNECTED

        };


        reconnects.set(
            playerId,
            reconnectData
        );


        return {
            ...reconnectData
        };

    }


    /* ========================================================
       MARK PLAYER RECONNECTED
       ======================================================== */

    function markReconnected(playerId) {

        const existing =
            reconnects.get(playerId);


        /*
         * If there is no reconnect record, there is
         * nothing to restore.
         */

        if (!existing) {

            return {
                success: false,
                reason: "no-reconnect-session"
            };

        }


        /*
         * If the window has already expired, do not allow
         * the player to silently reconnect through this
         * system.
         */

        if (
            Date.now() >=
            existing.expiresAt
        ) {

            existing.status =
                RECONNECT_STATUS.EXPIRED;


            reconnects.delete(playerId);


            return {
                success: false,
                reason: "reconnect-expired"
            };

        }


        existing.status =
            RECONNECT_STATUS.RECONNECTED;


        const result = {
            success: true,

            playerId:
                existing.playerId,

            battleId:
                existing.battleId,

            disconnectedAt:
                existing.disconnectedAt,

            reconnectedAt:
                Date.now(),

            status:
                existing.status
        };


        reconnects.delete(playerId);


        return result;

    }


    /* ========================================================
       GET RECONNECT INFORMATION
       ======================================================== */

    function getReconnectInfo(playerId) {

        const reconnectData =
            reconnects.get(playerId);


        if (!reconnectData) {

            return null;

        }


        return {
            ...reconnectData
        };

    }


    /* ========================================================
       CHECK WHETHER A PLAYER CAN RECONNECT
       ======================================================== */

    function canReconnect(playerId) {

        const reconnectData =
            reconnects.get(playerId);


        if (!reconnectData) {

            return false;

        }


        if (
            Date.now() >=
            reconnectData.expiresAt
        ) {

            expireReconnect(playerId);

            return false;

        }


        return true;

    }


    /* ========================================================
       TIME REMAINING
       ======================================================== */

    function getTimeRemaining(playerId) {

        const reconnectData =
            reconnects.get(playerId);


        if (!reconnectData) {

            return 0;

        }


        const remaining =
            reconnectData.expiresAt -
            Date.now();


        return Math.max(
            0,
            remaining
        );

    }


    /* ========================================================
       EXPIRE RECONNECT
       ======================================================== */

    function expireReconnect(playerId) {

        const reconnectData =
            reconnects.get(playerId);


        if (!reconnectData) {

            return null;

        }


        reconnectData.status =
            RECONNECT_STATUS.EXPIRED;


        reconnects.delete(playerId);


        const result = {

            playerId:
                reconnectData.playerId,

            battleId:
                reconnectData.battleId,

            disconnectedAt:
                reconnectData.disconnectedAt,

            expiresAt:
                reconnectData.expiresAt,

            status:
                RECONNECT_STATUS.EXPIRED

        };


        /*
         * Let the battle system decide what expiration means.
         *
         * For example, it could:
         *
         * - forfeit the player
         * - eliminate the player
         * - end the battle
         * - continue without them
         */

        if (onReconnectExpired) {

            try {

                onReconnectExpired(
                    result
                );

            } catch (error) {

                console.error(
                    "Reconnect expiration callback failed:",
                    error
                );

            }

        }


        return result;

    }


    /* ========================================================
       CLEAN EXPIRED RECONNECTS
       ======================================================== */

    function cleanExpiredReconnects() {

        const now = Date.now();

        const expired = [];


        for (
            const [
                playerId,
                reconnectData
            ]
            of reconnects
        ) {

            if (
                now >=
                reconnectData.expiresAt
            ) {

                const result =
                    expireReconnect(
                        playerId
                    );


                if (result) {

                    expired.push(
                        result
                    );

                }

            }

        }


        return expired;

    }


    /* ========================================================
       REMOVE PLAYER RECONNECT DATA
       ======================================================== */

    function remove(playerId) {

        return reconnects.delete(
            playerId
        );

    }


    /* ========================================================
       CHECK WHETHER PLAYER HAS A RECORD
       ======================================================== */

    function has(playerId) {

        return reconnects.has(
            playerId
        );

    }


    /* ========================================================
       LIST ACTIVE RECONNECTS
       ======================================================== */

    function list() {

        return Array.from(
            reconnects.values()
        ).map(
            reconnectData => ({
                ...reconnectData
            })
        );

    }


    /* ========================================================
       RESET SYSTEM
       ======================================================== */

    function reset() {

        reconnects.clear();

    }


    /* ========================================================
       PUBLIC API
       ======================================================== */

    return {

        reconnectTimeMs,

        markDisconnected,

        markReconnected,

        getReconnectInfo,

        canReconnect,

        getTimeRemaining,

        expireReconnect,

        cleanExpiredReconnects,

        remove,

        has,

        list,

        reset

    };

}


/* ============================================================
   EXPORTS
   ============================================================ */

module.exports = {

    createReconnectSystem,

    RECONNECT_STATUS,

    DEFAULT_RECONNECT_TIME_MS

};
