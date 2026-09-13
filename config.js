/* ============================================================
   CARD STUFF YES — CONFIGURATION MODULE
   ============================================================

   This module is responsible for loading server configuration.

   It keeps configuration loading out of server.js so the main
   server file does not need to deal with config.json directly.

   ============================================================ */


/* ============================================================
   MODULE IMPORTS
   ============================================================ */

/*
 * Node's filesystem module.
 *
 * Used to read config.json.
 */
const fs = require("fs");


/*
 * Node's path module.
 *
 * Used to safely locate config.json relative to this module.
 */
const path = require("path");


/* ============================================================
   CONFIGURATION FILE
   ============================================================ */

/*
 * config.json lives one directory above this module:

       Server/
       ├── config.json
       └── modules/
           └── config.js

 * Therefore we go up one directory from __dirname.
 */
const CONFIG_PATH =
    path.resolve(
        __dirname,
        "..",
        "config.json"
    );


/* ============================================================
   DEFAULT CONFIGURATION
   ============================================================ */

/*
 * These values are used if config.json cannot be loaded or does
 * not contain a particular setting.
 */
const DEFAULT_CONFIG = {

    host: "127.0.0.1",

    port: 6565,

    maxPlayersPerGame: 4

};


/* ============================================================
   LOAD CONFIGURATION
   ============================================================ */

/*
 * Loads config.json and combines it with the defaults.
 *
 * The defaults are kept so the server can still start if the
 * configuration file is missing or incomplete.
 */
function loadConfig() {

    let fileConfig = {};


    try {

        fileConfig =
            JSON.parse(
                fs.readFileSync(
                    CONFIG_PATH,
                    "utf8"
                )
            );


    } catch (error) {

        console.warn(
            "Could not load config.json. Using default configuration."
        );

        fileConfig = {};

    }


    /*
     * Only use an object as configuration data.
     */
    if (
        !fileConfig ||
        typeof fileConfig !== "object" ||
        Array.isArray(fileConfig)
    ) {

        fileConfig = {};

    }


    /*
     * Merge the loaded settings over the defaults.
     */
    return {

        ...DEFAULT_CONFIG,

        ...fileConfig

    };

}


/* ============================================================
   LOAD CONFIGURATION
   ============================================================ */

const config =
    loadConfig();


/* ============================================================
   NORMALIZE CONFIGURATION
   ============================================================ */

/*
 * Make sure the important configuration values have the correct
 * types even if config.json contains invalid values.
 */

const normalizedConfig = {

    host:
        typeof config.host === "string" &&
        config.host.trim()
            ? config.host.trim()
            : DEFAULT_CONFIG.host,


    port:
        Number.isInteger(config.port) &&
        config.port > 0 &&
        config.port <= 65535
            ? config.port
            : DEFAULT_CONFIG.port,


    maxPlayersPerGame:
        Number.isInteger(
            config.maxPlayersPerGame
        ) &&
        config.maxPlayersPerGame > 0
            ? config.maxPlayersPerGame
            : DEFAULT_CONFIG.maxPlayersPerGame

};


/* ============================================================
   EXPORTS
   ============================================================ */

/*
 * server.js can now simply do:
 *
 *     const { config } = require("./modules/config");
 *
 * ============================================================ */

module.exports = {

    config,

    CONFIG_PATH

};
