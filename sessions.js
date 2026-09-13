/* ============================================================
   CARD STUFF YES — SESSIONS MODULE
   ============================================================

   This module handles login sessions.

   It is responsible for:

   - Reading the session cookie
   - Looking up session tokens
   - Creating sessions
   - Destroying sessions
   - Destroying all sessions for a player
   - Cleaning expired/invalid sessions

   The raw session token is never stored in SQLite.

   ============================================================ */


/* ============================================================
   CREATE SESSION MODULE
   ============================================================ */

function createSessionsModule(
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
       SESSION COOKIE NAME
       ======================================================== */

    const SESSION_COOKIE_NAME =
        "sessionId";


    /* ========================================================
       READ SESSION COOKIE
       ======================================================== */

    /*
     * Extract the raw session token from the browser's cookies.
     */
    function getSessionTokenFromCookies(
        req
    ) {

        const cookieHeader =
            req.headers.cookie;


        if (!cookieHeader) {

            return null;

        }


        const cookies =
            cookieHeader
                .split(";")
                .map(
                    cookie =>
                        cookie.trim()
                );


        for (
            const cookie of cookies
        ) {

            const separator =
                cookie.indexOf("=");


            if (
                separator === -1
            ) {

                continue;

            }


            const name =
                cookie.substring(
                    0,
                    separator
                );


            if (
                name !==
                SESSION_COOKIE_NAME
            ) {

                continue;

            }


            const value =
                cookie.substring(
                    separator + 1
                );


            try {

                return decodeURIComponent(
                    value
                );

            } catch {

                return null;

            }

        }


        return null;

    }


    /* ========================================================
       FIND PLAYER FROM SESSION
       ======================================================== */

    /*
     * The caller supplies a hashSessionToken function so that
     * sessions.js does not need to know how cryptographic hashes
     * are generated.
     */
    function getPlayerFromSession(
        req,
        hashSessionToken
    ) {

        const sessionToken =
            getSessionTokenFromCookies(
                req
            );


        if (!sessionToken) {

            return null;

        }


        if (
            typeof hashSessionToken !==
            "function"
        ) {

            throw new Error(
                "hashSessionToken function is required."
            );

        }


        const tokenHash =
            hashSessionToken(
                sessionToken
            );


        const session =
            db
                .prepare(`
                    SELECT
                        tokenHash,
                        playerId,
                        createdAt
                    FROM sessions
                    WHERE tokenHash = ?
                `)
                .get(tokenHash);


        if (!session) {

            return null;

        }


        const player =
            players.getPlayerById(
                session.playerId
            );


        /*
         * A session pointing to a deleted player is invalid.
         */
        if (!player) {

            db.prepare(`
                DELETE FROM sessions
                WHERE tokenHash = ?
            `).run(tokenHash);


            return null;

        }


        return player;

    }


    /* ========================================================
       CREATE SESSION
       ======================================================== */

    /*
     * Store a hashed session token.
     */
    function createSession(
        playerId,
        sessionToken,
        hashSessionToken
    ) {

        if (
            typeof sessionToken !==
            "string" ||
            !sessionToken
        ) {

            throw new Error(
                "A session token is required."
            );

        }


        if (
            typeof hashSessionToken !==
            "function"
        ) {

            throw new Error(
                "hashSessionToken function is required."
            );

        }


        const tokenHash =
            hashSessionToken(
                sessionToken
            );


        const createdAt =
            new Date().toISOString();


        db.prepare(`
            INSERT INTO sessions
            (
                tokenHash,
                playerId,
                createdAt
            )
            VALUES (?, ?, ?)
        `).run(

            tokenHash,

            playerId,

            createdAt

        );

    }


    /* ========================================================
       DESTROY CURRENT SESSION
       ======================================================== */

    /*
     * Delete the session belonging to the current browser.
     */
    function destroySession(
        req,
        hashSessionToken
    ) {

        const sessionToken =
            getSessionTokenFromCookies(
                req
            );


        if (!sessionToken) {

            return;

        }


        const tokenHash =
            hashSessionToken(
                sessionToken
            );


        db.prepare(`
            DELETE FROM sessions
            WHERE tokenHash = ?
        `).run(tokenHash);

    }


    /* ========================================================
       DESTROY ALL PLAYER SESSIONS
       ======================================================== */

    /*
     * Delete every active session belonging to a player.
     *
     * Useful after a password change.
     */
    function destroyAllPlayerSessions(
        playerId
    ) {

        db.prepare(`
            DELETE FROM sessions
            WHERE playerId = ?
        `).run(playerId);

    }


    /* ========================================================
       CLEAN INVALID SESSIONS
       ======================================================== */

    /*
     * Remove sessions whose players no longer exist.
     *
     * Because the sessions table uses ON DELETE CASCADE, this
     * normally happens automatically. This cleanup is still useful
     * for databases created by older versions of the server.
     */
    function cleanInvalidSessions() {

        db.prepare(`
            DELETE FROM sessions
            WHERE playerId NOT IN (
                SELECT id
                FROM players
            )
        `).run();

    }


    /* ========================================================
       RETURN MODULE API
       ======================================================== */

    return {

        SESSION_COOKIE_NAME,

        getSessionTokenFromCookies,

        getPlayerFromSession,

        createSession,

        destroySession,

        destroyAllPlayerSessions,

        cleanInvalidSessions

    };

}


/* ============================================================
   EXPORTS
   ============================================================ */

module.exports = {

    createSessionsModule

};
