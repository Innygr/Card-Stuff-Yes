"use strict";

(function () {
    const hostname = window.location.hostname.toLowerCase();
    const productionDomain =
        hostname === "cardstuffyes.ca" ||
        hostname.endsWith(".cardstuffyes.ca");

    const productionRoutes = {
        home: "https://cardstuffyes.ca/",
        play: "https://play.cardstuffyes.ca/",
        pvp: "https://pvp.cardstuffyes.ca/",
        cards: "https://cards.cardstuffyes.ca/",
        account: "https://account.cardstuffyes.ca/",
        profile: "https://profile.cardstuffyes.ca/",
        settings: "https://settings.cardstuffyes.ca/"
    };

    // Non-production hosts (localhost and temporary test tunnels) keep
    // account navigation on the same origin so session cookies remain usable.
    const localRoutes = {
        home: "./",
        play: productionRoutes.play,
        pvp: productionRoutes.pvp,
        cards: productionRoutes.cards,
        account: "./account.html",
        profile: "./profile.html",
        settings: "./settings.html"
    };

    window.CSY_CONFIG = Object.freeze({
        // Production account and gameplay requests use the dedicated API subdomain.
        // The API must allowlist each frontend origin in CSY_ALLOWED_ORIGINS.
        apiBaseUrl: productionDomain ? "https://api.cardstuffyes.ca" : "",
        routes: Object.freeze(productionDomain ? productionRoutes : localRoutes)
    });
})();
