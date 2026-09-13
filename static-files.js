/* ============================================================
   CARD STUFF YES — STATIC FILE SERVER MODULE
   ============================================================

   This module is responsible for serving public website files.

   It handles:

   - HTML
   - CSS
   - JavaScript
   - JSON
   - Images
   - /assets/

   It also performs path-traversal protection so a browser cannot
   request arbitrary files outside the intended directories.

   ============================================================ */


/* ============================================================
   MODULE IMPORTS
   ============================================================ */

/*
 * Node's filesystem module.
 *
 * Used to read requested files.
 */
const fs = require("fs");


/*
 * Node's path module.
 *
 * Used to safely construct and compare filesystem paths.
 */
const path = require("path");


/*
 * HTTP response helpers.
 */
const {
    sendText
} = require("./http-utils");


/* ============================================================
   MIME TYPES
   ============================================================ */

/*
 * Tells the browser what kind of file it received.
 */
const MIME_TYPES = {

    ".html":
        "text/html; charset=utf-8",

    ".css":
        "text/css; charset=utf-8",

    ".js":
        "application/javascript; charset=utf-8",

    ".json":
        "application/json; charset=utf-8",

    ".png":
        "image/png",

    ".jpg":
        "image/jpeg",

    ".jpeg":
        "image/jpeg",

    ".webp":
        "image/webp",

    ".gif":
        "image/gif",

    ".svg":
        "image/svg+xml",

    ".ico":
        "image/x-icon"

};


/* ============================================================
   CREATE STATIC FILE SERVER
   ============================================================ */

/*
 * Creates a static-file serving function.
 *
 * Keeping the paths as options makes this module reusable and
 * prevents it from having to know the rest of the server's
 * configuration.
 *
 * Options:
 *
 *     websiteDirectory
 *         Directory containing the website files.
 *
 *     assetsDirectory
 *         Directory containing general website assets.
 *
 *     allowedWebsiteFiles
 *         Set of direct website files that may be requested.
 */
function createStaticFileServer(options = {}) {

    const websiteDirectory =
        path.resolve(
            options.websiteDirectory ||
            path.resolve(
                __dirname,
                ".."
            )
        );


    const assetsDirectory =
        path.resolve(
            options.assetsDirectory ||
            path.resolve(
                websiteDirectory,
                "assets"
            )
        );


    /*
     * The default list preserves the current server's static-file
     * security model.
     *
     * Additional pages can be added by server.js as the website
     * grows.
     */
    const allowedWebsiteFiles =
        options.allowedWebsiteFiles instanceof Set

            ? options.allowedWebsiteFiles

            : new Set([

                "/colors.css",

                "/profile.css",
                "/profile.js",

                "/cardgame.css",
                "/cardgame.js",
                "/cardgame.html",

                "/test.html"

            ]);


    /* ========================================================
       SERVE STATIC FILE
       ======================================================== */

    /*
     * Returns:
     *
     *     true
     *
     * when this function handled the request.
     *
     * Returns:
     *
     *     false
     *
     * when the request is not a static-file request.
     */
    function serveStaticFile(
        req,
        res
    ) {

        /* ----------------------------------------------------
           HTTP METHOD
           ---------------------------------------------------- */

        /*
         * Only GET and HEAD requests are handled here.
         */
        if (

            req.method !== "GET" &&

            req.method !== "HEAD"

        ) {

            return false;

        }


        /* ----------------------------------------------------
           GET URL PATH
           ---------------------------------------------------- */

        let pathname;


        try {

            pathname =
                new URL(
                    req.url,
                    "http://localhost"
                ).pathname;


        } catch (error) {

            sendText(
                res,
                400,
                "Invalid file path."
            );


            return true;

        }


        /* ----------------------------------------------------
           DECODE URL
           ---------------------------------------------------- */

        /*
         * Convert URL-encoded characters before performing
         * security checks.
         */
        try {

            pathname =
                decodeURIComponent(
                    pathname
                );


        } catch (error) {

            sendText(
                res,
                400,
                "Invalid file path."
            );


            return true;

        }


        /* ----------------------------------------------------
           FIND FILE PATH
           ---------------------------------------------------- */

        let filePath = null;


        /* ====================================================
           DIRECT WEBSITE FILES
           ==================================================== */

        /*
         * Files directly under Server/ must be explicitly allowed.
         *
         * This prevents requests such as:
         *
         *     /players.db
         *
         * from being served.
         */
        if (
            allowedWebsiteFiles.has(
                pathname
            )
        ) {

            filePath =
                path.resolve(
                    websiteDirectory,
                    pathname.substring(1)
                );

        }


        /* ====================================================
           ASSETS
           ==================================================== */

        /*
         * Files underneath /assets/ are allowed.
         *
         * Example:
         *
         *     /assets/badges/owner.png
         */
        else if (
            pathname.startsWith(
                "/assets/"
            )
        ) {

            const relativeAssetPath =
                pathname.substring(
                    "/assets/".length
                );


            filePath =
                path.resolve(
                    assetsDirectory,
                    relativeAssetPath
                );


            /* ------------------------------------------------
               PATH TRAVERSAL PROTECTION
               ------------------------------------------------ */

            /*
             * The final path must remain inside the assets
             * directory.
             */
            const assetsPrefix =
                assetsDirectory +
                path.sep;


            if (
                !filePath.startsWith(
                    assetsPrefix
                )
            ) {

                sendText(
                    res,
                    403,
                    "Forbidden."
                );


                return true;

            }

        }


        /* ====================================================
           NOT A STATIC FILE
           ==================================================== */

        else {

            return false;

        }


        /* ====================================================
           FILE EXTENSION
           ==================================================== */

        const extension =
            path.extname(
                filePath
            ).toLowerCase();


        const contentType =
            MIME_TYPES[extension];


        /*
         * Reject file types that the static server does not
         * understand.
         */
        if (!contentType) {

            sendText(
                res,
                415,
                "Unsupported file type."
            );


            return true;

        }


        /* ====================================================
           READ FILE
           ==================================================== */

        fs.readFile(

            filePath,

            (error, data) => {

                if (error) {

                    /* ----------------------------------------
                       FILE DOES NOT EXIST
                       ---------------------------------------- */

                    if (
                        error.code ===
                        "ENOENT"
                    ) {

                        sendText(
                            res,
                            404,
                            "File not found."
                        );


                    }

                    /* ----------------------------------------
                       OTHER FILE ERROR
                       ---------------------------------------- */

                    else {

                        console.error(
                            "Static file error:",
                            error
                        );


                        sendText(
                            res,
                            500,
                            "Could not load file."
                        );

                    }


                    return;

                }


                /* =================================================
                   RESPONSE HEADERS
                   ================================================= */

                res.writeHead(

                    200,

                    {

                        "Content-Type":
                            contentType,

                        "Cache-Control":
                            "no-cache"

                    }

                );


                /* =================================================
                   HEAD REQUEST
                   ================================================= */

                /*
                 * HEAD requests receive the same headers as GET,
                 * but no response body.
                 */
                if (
                    req.method === "HEAD"
                ) {

                    res.end();

                    return;

                }


                /* =================================================
                   SEND FILE
                   ================================================= */

                res.end(data);

            }

        );


        /*
         * The request has been accepted by this module.
         */
        return true;

    }


    /* ========================================================
       RETURN MODULE API
       ======================================================== */

    return {

        serveStaticFile,

        websiteDirectory,

        assetsDirectory,

        allowedWebsiteFiles

    };

}


/* ============================================================
   EXPORTS
   ============================================================ */

module.exports = {

    createStaticFileServer,

    MIME_TYPES

};
