/* ============================================================
   CARD STUFF YES — REQUEST BODY MODULE
   ============================================================

   This module handles reading JSON request bodies.

   It keeps request parsing separate from the actual API routes.

   ============================================================ */


/* ============================================================
   SETTINGS
   ============================================================ */

/*
 * Maximum number of characters allowed in a JSON request body.
 *
 * This is the same limit that the existing server.js uses.
 *
 * Large uploads such as card PNG files should NOT use this
 * function. Those will need their own upload handling.
 */
const MAX_REQUEST_BODY_LENGTH =
    100000;


/* ============================================================
   READ JSON BODY
   ============================================================ */

/*
 * Read an incoming HTTP request and parse it as JSON.
 *
 * Example request body:
 *
 *     {
 *         "username": "Innygr",
 *         "password": "example"
 *     }
 *
 * Returns a Promise containing the parsed JavaScript object.
 */
function readJSON(req) {

    return new Promise(

        (resolve, reject) => {

            let body = "";


            /* ------------------------------------------------
               RECEIVE REQUEST DATA
               ------------------------------------------------ */

            req.on(

                "data",

                chunk => {

                    body += chunk;


                    /*
                     * Stop processing oversized requests.
                     */
                    if (
                        body.length >
                        MAX_REQUEST_BODY_LENGTH
                    ) {

                        reject(
                            new Error(
                                "Request body too large."
                            )
                        );


                        /*
                         * Destroy the connection so an oversized
                         * request cannot continue consuming memory.
                         */
                        req.destroy();

                    }

                }

            );


            /* ------------------------------------------------
               FINISH REQUEST
               ------------------------------------------------ */

            req.on(

                "end",

                () => {

                    /*
                     * An empty body becomes an empty object.
                     */
                    if (!body) {

                        resolve({});

                        return;

                    }


                    /* ----------------------------------------
                       PARSE JSON
                       ---------------------------------------- */

                    try {

                        const parsed =
                            JSON.parse(body);


                        resolve(parsed);


                    } catch (error) {

                        reject(
                            new Error(
                                "Invalid JSON."
                            )
                        );

                    }

                }

            );


            /* ------------------------------------------------
               REQUEST ERROR
               ------------------------------------------------ */

            req.on(

                "error",

                error => {

                    reject(error);

                }

            );

        }

    );

}


/* ============================================================
   EXPORTS
   ============================================================ */

module.exports = {

    readJSON,

    MAX_REQUEST_BODY_LENGTH

};
