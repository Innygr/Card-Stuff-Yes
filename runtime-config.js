"use strict";

/*
 * Card Stuff Yes frontend runtime configuration.
 *
 * Load this before page scripts that call the backend. A page may override
 * the API origin with:
 *   <meta name="csy-api-base" content="https://api.example.test">
 *
 * Production uses the dedicated API hostname. Local development defaults to
 * the local Server port. Other hosts must opt in explicitly rather than
 * silently sending credentials to an unintended origin.
 */
(function () {
    const hostname = window.location.hostname.toLowerCase();
    const configured = document.querySelector('meta[name="csy-api-base"]');
    const override = configured ? configured.content.trim() : "";

    let apiBaseUrl = override.replace(/\/+$/, "");

    if (!apiBaseUrl && (hostname === "cardstuffyes.ca" || hostname.endsWith(".cardstuffyes.ca"))) {
        apiBaseUrl = "https://api.cardstuffyes.ca";
    } else if (!apiBaseUrl && (hostname === "localhost" || hostname === "127.0.0.1")) {
        apiBaseUrl = "http://127.0.0.1:6565";
    }

    window.CSY_CONFIG = Object.freeze({
        apiBaseUrl,
        routes: Object.freeze({
            home: "https://cardstuffyes.ca/",
            play: "https://play.cardstuffyes.ca/",
            pvp: "https://pvp.cardstuffyes.ca/",
            cards: "https://cards.cardstuffyes.ca/",
            decks: "https://decks.cardstuffyes.ca/",
            account: "https://account.cardstuffyes.ca/",
            profile: "https://profile.cardstuffyes.ca/",
            settings: "https://settings.cardstuffyes.ca/",
            news: "https://news.cardstuffyes.ca/",
            help: "https://help.cardstuffyes.ca/",
            admin: "https://admin.cardstuffyes.ca/"
        })
    });
})();
