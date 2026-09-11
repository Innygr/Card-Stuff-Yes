/*
 * ============================================================
 * Card Stuff Yes
 * Homepage JavaScript
 * ============================================================
 *
 * This file handles:
 *
 * - Homepage navigation
 * - Server status
 * - Player counts
 * - Signed-in player information
 * - ELO display
 * - Homepage accessibility settings
 * - Automatic server-status refreshing
 *
 * IMPORTANT:
 *
 * The browser does NOT decide:
 *
 * - ELO
 * - Rank
 * - Server status
 * - Player counts
 *
 * Those values come from the server.
 *
 * ============================================================
 */


/* ============================================================
   API HELPER
   ============================================================ */

/*
 * Make an API request and automatically parse the JSON response.
 */

async function apiRequest(
    url,
    options = {}
) {

    const response =
        await fetch(
            url,
            {
                credentials: "same-origin",

                ...options
            }
        );


    let data = null;


    /*
     * Some endpoints may return no JSON body.
     */

    try {

        data =
            await response.json();

    } catch {

        data = null;

    }


    /*
     * Turn HTTP errors into JavaScript errors.
     */

    if (!response.ok) {

        const message =
            data &&
            data.error
                ? data.error
                : `Request failed with status ${response.status}.`;


        throw new Error(message);

    }


    return data;

}


/* ============================================================
   ACCESSIBILITY SETTINGS
   ============================================================ */

/*
 * Read a saved setting from localStorage.
 *
 * Settings are stored locally because things such as:
 *
 * - theme
 * - reduce movement
 * - reduce flashing
 * - volume
 *
 * are user preferences rather than server-authoritative
 * player information.
 */

function getSavedSetting(
    key,
    defaultValue
) {

    try {

        const value =
            localStorage.getItem(key);


        return value === null
            ? defaultValue
            : value;

    } catch {

        return defaultValue;

    }

}


/*
 * Apply settings that affect the entire website.
 *
 * The Settings page uses the same class names so every page
 * can behave consistently.
 */

function applyAccessibilitySettings() {

    const root =
        document.documentElement;


    /*
     * Theme
     *
     * "dark"
     * "light"
     * "system"
     *
     * colors.css can use these attributes when the theme system
     * is expanded.
     */

    const theme =
        getSavedSetting(
            "cardStuffYesTheme",
            "dark"
        );


    root.dataset.theme =
        theme;


    /*
     * Reduce movement.
     */

    const reduceMotion =
        getSavedSetting(
            "cardStuffYesReduceMotion",
            "false"
        ) === "true";


    root.classList.toggle(
        "reduce-motion",
        reduceMotion
    );


    /*
     * Reduce flashing.
     */

    const reduceFlashing =
        getSavedSetting(
            "cardStuffYesReduceFlashing",
            "false"
        ) === "true";


    root.classList.toggle(
        "reduce-flashing",
        reduceFlashing
    );

}


/* ============================================================
   SERVER STATUS
   ============================================================ */

/*
 * Load the current server information.
 *
 * The preferred endpoint is:
 *
 *     /api/homepage
 *
 * because that endpoint can provide all three counters:
 *
 * - Players Online
 * - Players in Queue
 * - Players in Battle
 *
 * If an older server does not have that endpoint yet, the code
 * falls back to /api/status.
 */

async function loadServerStatus() {

    const statusText =
        document.getElementById(
            "server-status-text"
        );


    const statusDot =
        document.getElementById(
            "server-status-dot"
        );


    const playersOnline =
        document.getElementById(
            "players-online"
        );


    const playersQueue =
        document.getElementById(
            "players-queue"
        );


    const playersBattle =
        document.getElementById(
            "players-battle"
        );


    try {

        let data;


        /*
         * First try the homepage-specific endpoint.
         */

        try {

            data =
                await apiRequest(
                    "/api/homepage"
                );

        } catch {

            /*
             * Fallback for an older server implementation.
             */

            data =
                await apiRequest(
                    "/api/status"
                );

        }


        /*
         * Determine whether the server is online.
         */

        const online =
            data.online === true;


        if (online) {

            statusText.textContent =
                "Server Online";


            statusDot.classList.remove(
                "offline"
            );

        } else {

            statusText.textContent =
                "Server Offline";


            statusDot.classList.add(
                "offline"
            );

        }


        /*
         * Players Online
         *
         * If the server does not provide the value yet,
         * display zero rather than inventing a number.
         */

        playersOnline.textContent =
            Number.isFinite(
                Number(data.playersOnline)
            )
                ? Number(data.playersOnline)
                : 0;


        /*
         * Players in Queue
         */

        playersQueue.textContent =
            Number.isFinite(
                Number(data.playersInQueue)
            )
                ? Number(data.playersInQueue)
                : 0;


        /*
         * Players in Battle
         */

        playersBattle.textContent =
            Number.isFinite(
                Number(data.playersInBattle)
            )
                ? Number(data.playersInBattle)
                : 0;


    } catch (error) {

        /*
         * If the server cannot be reached, show it as offline.
         */

        statusText.textContent =
            "Server Offline";


        statusDot.classList.add(
            "offline"
        );


        playersOnline.textContent =
            "0";


        playersQueue.textContent =
            "0";


        playersBattle.textContent =
            "0";


        console.error(
            "Could not load Card Stuff Yes server status:",
            error
        );

    }

}


/* ============================================================
   ELO FORMATTING
   ============================================================ */

/*
 * Convert the server's ELO value into the format shown on the
 * homepage.
 */

function formatELO(
    elo
) {

    const numericELO =
        Number(elo);


    if (
        !Number.isFinite(
            numericELO
        )
    ) {

        return "Not available";

    }


    return `${Math.round(numericELO)} ELO`;

}


/* ============================================================
   CURRENT PLAYER
   ============================================================ */

/*
 * Load the currently signed-in player.
 */

async function loadCurrentPlayer() {

    const profileContent =
        document.getElementById(
            "profile-content"
        );


    const headerUsername =
        document.getElementById(
            "header-username"
        );


    const headerProfileLink =
        document.getElementById(
            "header-profile-link"
        );


    try {

        const data =
            await apiRequest(
                "/api/me"
            );


        /*
         * The server should return the current player in
         * data.player.
         */

        const player =
            data.player;


        if (
            !player ||
            !player.username
        ) {

            throw new Error(
                "The server returned invalid player information."
            );

        }


        /*
         * Header account information.
         */

        headerUsername.textContent =
            player.username;


        headerProfileLink.href =
            "/profile";


        /*
         * Clear the loading message.
         */

        profileContent.innerHTML =
            "";


        /*
         * Create the profile card.
         */

        const card =
            document.createElement(
                "div"
            );


        card.className =
            "profile-card";


        /* ----------------------------------------------------
           Username
           ---------------------------------------------------- */

        const username =
            document.createElement(
                "h3"
            );


        username.className =
            "profile-username";


        username.textContent =
            player.username;


        card.appendChild(
            username
        );


        /* ----------------------------------------------------
           ELO
           ---------------------------------------------------- */

        const eloRow =
            document.createElement(
                "div"
            );


        eloRow.className =
            "profile-row profile-elo";


        const eloLabel =
            document.createElement(
                "span"
            );


        eloLabel.textContent =
            "Rating:";


        const eloValue =
            document.createElement(
                "strong"
            );


        eloValue.textContent =
            formatELO(
                player.elo
            );


        eloRow.appendChild(
            eloLabel
        );


        eloRow.appendChild(
            eloValue
        );


        card.appendChild(
            eloRow
        );


        /* ----------------------------------------------------
           Rank
           ---------------------------------------------------- */

        const rankRow =
            document.createElement(
                "div"
            );


        rankRow.className =
            "profile-row profile-rank";


        const rankLabel =
            document.createElement(
                "span"
            );


        rankLabel.textContent =
            "Rank:";


        const rankValue =
            document.createElement(
                "strong"
            );


        rankValue.textContent =
            player.rank || "Player";


        rankRow.appendChild(
            rankLabel
        );


        rankRow.appendChild(
            rankValue
        );


        card.appendChild(
            rankRow
        );


        /* ----------------------------------------------------
           Profile Button
           ---------------------------------------------------- */

        const profileButton =
            document.createElement(
                "a"
            );


        profileButton.className =
            "profile-button";


        profileButton.href =
            "/profile";


        profileButton.textContent =
            "VIEW PROFILE";


        card.appendChild(
            profileButton
        );


        /*
         * Put the finished card onto the page.
         */

        profileContent.appendChild(
            card
        );


    } catch (error) {

        /*
         * A failed /api/me request normally means the visitor
         * is not signed in.
         */

        headerUsername.textContent =
            "Not signed in";


        headerProfileLink.href =
            "/profile";


        profileContent.innerHTML =
            "";


        const message =
            document.createElement(
                "div"
            );


        message.className =
            "profile-login-message";


        message.textContent =
            "Sign in to see your profile and ELO.";


        profileContent.appendChild(
            message
        );


        /*
         * Do not treat a normal signed-out state as a server
         * failure.
         */

        console.log(
            "No signed-in player found.",
            error
        );

    }

}


/* ============================================================
   NAVIGATION
   ============================================================ */

/*
 * PLAY
 *
 * Opens the multiplayer game page.
 */

function setupPlayButton() {

    const button =
        document.getElementById(
            "play-button"
        );


    button.addEventListener(
        "click",
        () => {

            window.location.href =
                "/cardgame.html";

        }
    );

}


/*
 * DECK BUILDER
 *
 * Opens the dedicated deck-builder page.
 */

function setupDeckButton() {

    const button =
        document.getElementById(
            "deck-button"
        );


    button.addEventListener(
        "click",
        () => {

            window.location.href =
                "/deck-builder.html";

        }
    );

}


/*
 * NEWS
 *
 * Opens the Card Stuff Yes news archive.
 */

function setupNewsButton() {

    const button =
        document.getElementById(
            "news-button"
        );


    button.addEventListener(
        "click",
        () => {

            window.location.href =
                "/news.html";

        }
    );

}


/*
 * HOW TO PLAY
 *
 * Opens the rules/instructions page.
 */

function setupHowToPlayButton() {

    const button =
        document.getElementById(
            "how-to-play-button"
        );


    button.addEventListener(
        "click",
        () => {

            window.location.href =
                "/how-to-play";

        }
    );

}


/*
 * SETTINGS
 *
 * Opens the global Card Stuff Yes settings page.
 */

function setupSettingsButton() {

    const button =
        document.getElementById(
            "settings-button"
        );


    button.addEventListener(
        "click",
        () => {

            window.location.href =
                "/settings.html";

        }
    );

}


/* ============================================================
   AUTOMATIC SERVER REFRESH
   ============================================================ */

/*
 * Refresh server statistics every ten seconds.
 *
 * This means the homepage can update player counts without
 * requiring the visitor to manually refresh the page.
 */

function startStatusRefresh() {

    setInterval(
        loadServerStatus,
        10000
    );

}


/* ============================================================
   PAGE STARTUP
   ============================================================ */

/*
 * Start everything needed by the homepage.
 */

async function initializeHomepage() {

    /*
     * Apply local accessibility preferences immediately.
     */

    applyAccessibilitySettings();


    /*
     * Load server and player information at the same time.
     */

    await Promise.all([
        loadServerStatus(),
        loadCurrentPlayer()
    ]);


    /*
     * Enable navigation buttons.
     */

    setupPlayButton();

    setupDeckButton();

    setupNewsButton();

    setupHowToPlayButton();

    setupSettingsButton();


    /*
     * Continue updating server statistics.
     */

    startStatusRefresh();

}


/*
 * Start the homepage.
 */

initializeHomepage();
