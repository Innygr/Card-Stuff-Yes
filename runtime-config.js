"use strict";

(function () {
    const hostname = window.location.hostname.toLowerCase();
    const productionDomain =
        hostname === "cardstuffyes.ca" ||
        hostname.endsWith(".cardstuffyes.ca");

    window.CSY_CONFIG = Object.freeze({
        // Keep gameplay API calls same-origin until cross-subdomain CORS
        // and cookie behavior are enabled and verified in production.
        apiBaseUrl: "",
        routes: Object.freeze({
            home: "https://cardstuffyes.ca/",
            play: "https://play.cardstuffyes.ca/",
            pvp: "https://pvp.cardstuffyes.ca/",
            cards: "https://cards.cardstuffyes.ca/"
        })
    });
})();
