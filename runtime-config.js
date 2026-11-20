"use strict";

(function () {
    const hostname = window.location.hostname.toLowerCase();
    const productionDomain =
        hostname === "cardstuffyes.ca" ||
        hostname.endsWith(".cardstuffyes.ca");

    window.CSY_CONFIG = Object.freeze({
        // Production account and gameplay requests use the dedicated API subdomain.
        // The API must allowlist each frontend origin in CSY_ALLOWED_ORIGINS.
        apiBaseUrl: productionDomain ? "https://api.cardstuffyes.ca" : "",
        routes: Object.freeze({
            home: "https://cardstuffyes.ca/",
            play: "https://play.cardstuffyes.ca/",
            pvp: "https://pvp.cardstuffyes.ca/",
            cards: "https://cards.cardstuffyes.ca/",
            account: "https://account.cardstuffyes.ca/"
        })
    });
})();
