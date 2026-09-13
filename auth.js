/* ============================================================
   CARD STUFF YES — AUTHENTICATION MODULE
   ============================================================

   This module handles account authentication logic.

   It is responsible for:

   - Password hashing
   - Password verification
   - Session-token generation
   - Account registration
   - Login
   - Password changes

   It does NOT handle HTTP routes directly.

   server.js will eventually connect HTTP requests to this module.

   ============================================================ */


/* ============================================================
   MODULE IMPORTS
   ============================================================ */

const crypto =
    require("crypto");


/* ============================================================
   AUTHENTICATION SETTINGS
   ============================================================ */

const PASSWORD_HASH_BYTES =
    64;


const PASSWORD_SALT_BYTES =
    16;


const SESSION_TOKEN_BYTES =
    32;


/* ============================================================
   CREATE AUTH MODULE
   ============================================================ */

function createAuthModule(
    db,
    players,
    sessions
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


    if (!sessions) {

        throw new Error(
            "The sessions module is required."
        );

    }


    /* ========================================================
       CURRENT TIME
       ======================================================== */

    /*
     * Return the current time as an ISO 8601 string.
     */
    function nowISO() {

        return new Date().toISOString();

    }


    /* ========================================================
       PASSWORD HASHING
       ======================================================== */

    /*
     * Hash a password using Node's scrypt implementation.
     *
     * Stored format:
     *
     *     scrypt:salt:hash
     *
     * The salt is stored alongside the hash because the salt is
     * not secret.
     */
    function hashPassword(
        password
    ) {

        if (
            typeof password !== "string" ||
            password.length === 0
        ) {

            throw new Error(
                "Password must be a non-empty string."
            );

        }


        const salt =
            crypto.randomBytes(
                PASSWORD_SALT_BYTES
            );


        const hash =
            crypto.scryptSync(
                password,
                salt,
                PASSWORD_HASH_BYTES
            );


        return [

            "scrypt",

            salt.toString("hex"),

            hash.toString("hex")

        ].join(":");

    }


    /* ========================================================
       PASSWORD VERIFICATION
       ======================================================== */

    /*
     * Compare a plaintext password against a stored password hash.
     */
    function verifyPassword(
        password,
        storedHash
    ) {

        if (
            typeof password !== "string" ||
            typeof storedHash !== "string"
        ) {

            return false;

        }


        const parts =
            storedHash.split(":");


        if (
            parts.length !== 3 ||
            parts[0] !== "scrypt"
        ) {

            return false;

        }


        try {

            const salt =
                Buffer.from(
                    parts[1],
                    "hex"
                );


            const expectedHash =
                Buffer.from(
                    parts[2],
                    "hex"
                );


            const actualHash =
                crypto.scryptSync(
                    password,
                    salt,
                    expectedHash.length
                );


            if (
                actualHash.length !==
                expectedHash.length
            ) {

                return false;

            }


            return crypto.timingSafeEqual(
                actualHash,
                expectedHash
            );

        } catch {

            return false;

        }

    }


    /* ========================================================
       SESSION TOKEN CREATION
       ======================================================== */

    /*
     * Generate a cryptographically random session token.
     *
     * The raw token is sent to the browser.
     *
     * Only its SHA-256 hash is stored in SQLite.
     */
    function createSessionToken() {

        return crypto
            .randomBytes(
                SESSION_TOKEN_BYTES
            )
            .toString("hex");

    }


    /* ========================================================
       SESSION TOKEN HASHING
       ======================================================== */

    /*
     * Hash a session token before storing or looking it up.
     */
    function hashSessionToken(
        token
    ) {

        if (
            typeof token !== "string"
        ) {

            throw new Error(
                "Session token must be a string."
            );

        }


        return crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

    }


    /* ========================================================
       REGISTER ACCOUNT
       ======================================================== */

    /*
     * Register a new player.
     *
     * Validation here mirrors the existing server behavior.
     */
    function register({
        username,
        password
    }) {

        const cleanUsername =
            typeof username === "string"
                ? username.trim()
                : "";


        const cleanPassword =
            typeof password === "string"
                ? password
                : "";


        /* ----------------------------------------------------
           REQUIRED FIELDS
           ---------------------------------------------------- */

        if (
            !cleanUsername ||
            !cleanPassword
        ) {

            return {

                success: false,

                statusCode: 400,

                error:
                    "Username and password are required."

            };

        }


        /* ----------------------------------------------------
           USERNAME LENGTH
           ---------------------------------------------------- */

        if (
            cleanUsername.length < 3
        ) {

            return {

                success: false,

                statusCode: 400,

                error:
                    "Username must be at least 3 characters."

            };

        }


        if (
            cleanUsername.length > 32
        ) {

            return {

                success: false,

                statusCode: 400,

                error:
                    "Username must be 32 characters or less."

            };

        }


        /* ----------------------------------------------------
           PASSWORD LENGTH
           ---------------------------------------------------- */

        if (
            cleanPassword.length < 6
        ) {

            return {

                success: false,

                statusCode: 400,

                error:
                    "Password must be at least 6 characters."

            };

        }


        /* ----------------------------------------------------
           USERNAME UNIQUENESS
           ---------------------------------------------------- */

        const existing =
            players.getPlayerByUsername(
                cleanUsername
            );


        if (existing) {

            return {

                success: false,

                statusCode: 409,

                error:
                    "Username already exists. Please sign in."

            };

        }


        /* ----------------------------------------------------
           HASH PASSWORD
           ---------------------------------------------------- */

        const passwordHash =
            hashPassword(
                cleanPassword
            );


        /* ----------------------------------------------------
           CREATE PLAYER
           ---------------------------------------------------- */

        const player =
            players.createPlayer({

                username:
                    cleanUsername,

                passwordHash,

                rank:
                    "Player",

                elo:
                    1000,

                mustChangePassword:
                    0

            });


        return {

            success: true,

            statusCode: 201,

            player:
                players.publicPlayer(
                    player
                )

        };

    }


    /* ========================================================
       LOGIN
       ======================================================== */

    /*
     * Authenticate a username/password pair.
     *
     * The caller receives the raw session token and is responsible
     * for putting it into an HTTP cookie.
     */
    function login({
        username,
        password
    }) {

        const cleanUsername =
            typeof username === "string"
                ? username.trim()
                : "";


        const cleanPassword =
            typeof password === "string"
                ? password
                : "";


        if (
            !cleanUsername ||
            !cleanPassword
        ) {

            return {

                success: false,

                statusCode: 400,

                error:
                    "Username and password are required."

            };

        }


        /* ----------------------------------------------------
           FIND PLAYER
           ---------------------------------------------------- */

        const player =
            players.getPlayerByUsername(
                cleanUsername
            );


        /*
         * Use the same generic error whether the username or
         * password is incorrect.
         */
        if (
            !player ||
            !verifyPassword(
                cleanPassword,
                player.passwordHash
            )
        ) {

            return {

                success: false,

                statusCode: 401,

                error:
                    "Invalid username or password."

            };

        }


        /* ----------------------------------------------------
           CREATE SESSION
           ---------------------------------------------------- */

        const sessionToken =
            createSessionToken();


        sessions.createSession(

            player.id,

            sessionToken,

            hashSessionToken

        );


        return {

            success: true,

            statusCode: 200,

            sessionToken,

            player:
                players.publicPlayer(
                    player
                )

        };

    }


    /* ========================================================
       CHANGE PASSWORD
       ======================================================== */

    /*
     * Change a player's password.
     *
     * All existing sessions are destroyed so that changing a
     * password signs the account out everywhere.
     */
    function changePassword(
        playerId,
        currentPassword,
        newPassword
    ) {

        if (
            typeof currentPassword !== "string" ||
            typeof newPassword !== "string"
        ) {

            return {

                success: false,

                statusCode: 400,

                error:
                    "Current and new passwords are required."

            };

        }


        if (
            newPassword.length < 6
        ) {

            return {

                success: false,

                statusCode: 400,

                error:
                    "New password must be at least 6 characters."

            };

        }


        const player =
            players.getPlayerById(
                playerId
            );


        if (!player) {

            return {

                success: false,

                statusCode: 404,

                error:
                    "Player not found."

            };

        }


        if (
            !verifyPassword(
                currentPassword,
                player.passwordHash
            )
        ) {

            return {

                success: false,

                statusCode: 401,

                error:
                    "Current password is incorrect."

            };

        }


        const newPasswordHash =
            hashPassword(
                newPassword
            );


        db.prepare(`
            UPDATE players
            SET
                passwordHash = ?,
                mustChangePassword = 0
            WHERE id = ?
        `).run(

            newPasswordHash,

            playerId

        );


        /*
         * Force all other sessions to sign in again.
         */
        sessions.destroyAllPlayerSessions(
            playerId
        );


        return {

            success: true,

            statusCode: 200,

            message:
                "Password changed successfully."

        };

    }


    /* ========================================================
       RETURN MODULE API
       ======================================================== */

    return {

        PASSWORD_HASH_BYTES,

        PASSWORD_SALT_BYTES,

        SESSION_TOKEN_BYTES,

        nowISO,

        hashPassword,

        verifyPassword,

        createSessionToken,

        hashSessionToken,

        register,

        login,

        changePassword

    };

}


/* ============================================================
   EXPORTS
   ============================================================ */

module.exports = {

    createAuthModule

};
