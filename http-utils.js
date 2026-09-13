/* ============================================================
   CARD STUFF YES — HTTP UTILITIES MODULE
   ============================================================

   This module contains small helper functions for sending HTTP
   responses.

   It does NOT know anything about players, cards, ELO, or the
   game itself.

   ============================================================ */


/* ============================================================
   SEND JSON
   ============================================================ */

/*
 * Send a JSON response to the browser.
 *
 * Parameters:
 *
 *     res
 *         Node HTTP response object.
 *
 *     statusCode
 *         HTTP status code such as 200, 400, or 404.
 *
 *     data
 *         JavaScript value that will be converted to JSON.
 *
 * Cache-Control: no-store prevents browsers/proxies from caching
 * API responses containing potentially changing information.
 */
function sendJSON(
    res,
    statusCode,
    data
) {

    res.writeHead(

        statusCode,

        {

            "Content-Type":
                "application/json; charset=utf-8",

            "Cache-Control":
                "no-store"

        }

    );


    res.end(
        JSON.stringify(data)
    );

}


/* ============================================================
   SEND TEXT
   ============================================================ */

/*
 * Send a plain-text HTTP response.
 *
 * This is useful for simple errors such as:
 *
 *     File not found.
 *
 *     Forbidden.
 *
 *     Unsupported file type.
 */
function sendText(
    res,
    statusCode,
    text
) {

    res.writeHead(

        statusCode,

        {

            "Content-Type":
                "text/plain; charset=utf-8"

        }

    );


    res.end(
        String(text)
    );

}


/* ============================================================
   EXPORTS
   ============================================================ */

module.exports = {

    sendJSON,

    sendText

};
