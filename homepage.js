/* ============================================================
   CARD STUFF YES — HOMEPAGE JAVASCRIPT
   ------------------------------------------------------------
   This file controls the interactive behavior of the homepage.

   It:
   - Gets live server information.
   - Displays online/queue/battle player counts.
   - Loads the currently signed-in player's profile.
   - Displays ELO and rank.
   - Handles the PLAY button.
   - Handles the DECK BUILDER button.
   - Handles the HOW TO PLAY button.
   - Periodically refreshes server information.
   ============================================================ */


/* ============================================================
   CONFIGURATION
   ============================================================ */

/*
 * How often the homepage asks the server for updated information.
 *
 * 10 seconds gives the page reasonably live player counts without
 * constantly sending requests to the server.
 */
const STATUS_REFRESH_INTERVAL = 10000;


/* ============================================================
   DOM ELEMENTS
   ============================================================ */

/*
 * Store references to the HTML elements we need to update.
 *
 * Doing this once makes the rest of the script easier to read.
 */
const elements = {
    serverStatusDot:
        document.getElementById("server-status-dot"),

    serverStatusText:
        document.getElementById("server-status-text"),

    playersOnline:
        document.getElementById("players-online"),

    playersQueue:
        document.getElementById("players-queue"),

    playersBattle:
        document.getElementById("players-battle"),

    profileContent:
        document.getElementById("profile-content"),

    headerUsername:
        document.getElementById("header-username"),

    headerProfileLink:
        document.getElementById("header-profile-link"),

    playButton:
        document.getElementById("play-button"),

    deckButton:
        document.getElementById("deck-button"),

    howToPlayButton:
        document.getElementById("how-to-play-button")
};


/* ============================================================
   SERVER STATUS
   ============================================================ */

/*
 * Set the visual server status.
 *
 * `online` determines whether the server is considered available.
 */
function setServerStatus(online) {

    if (online) {

        elements.serverStatusDot.textContent = "●";

        elements.serverStatusDot.classList.remove(
            "offline",
            "loading"
        );

        elements.serverStatusText.textContent =
            "Server Online";

        return;
    }


    /*
     * If the request fails, the server is treated as offline.
     */
    elements.serverStatusDot.textContent = "●";

    elements.serverStatusDot.classList.remove(
        "loading"
    );

    elements.serverStatusDot.classList.add(
        "offline"
    );

    elements.serverStatusText.textContent =
        "Server Offline";
}


/* ============================================================
   LOADING SERVER STATUS
   ============================================================ */

/*
 * Put the status section into a loading state.
 *
 * This is mainly useful when the page is first opened.
 */
function setServerLoading() {

    elements.serverStatusDot.textContent = "●";

    elements.serverStatusDot.classList.remove(
        "offline"
    );

    elements.serverStatusDot.classList.add(
        "loading"
    );

    elements.serverStatusText.textContent =
        "Checking server...";
}


/* ============================================================
   UPDATE SERVER COUNTERS
   ============================================================ */

/*
 * Update the three server statistics using information returned
 * by the backend.
 */
function updateServerCounters(data) {

    /*
     * Use zero as a fallback if the server does not provide one
     * of the values.
     */
    const playersOnline =
        Number.isFinite(Number(data.playersOnline))
            ? Number(data.playersOnline)
            : 0;


    const playersInQueue =
        Number.isFinite(Number(data.playersInQueue))
            ? Number(data.playersInQueue)
            : 0;


    const playersInBattle =
        Number.isFinite(Number(data.playersInBattle))
            ? Number(data.playersInBattle)
            : 0;


    elements.playersOnline.textContent =
        playersOnline;


    elements.playersQueue.textContent =
        playersInQueue;


    elements.playersBattle.textContent =
        playersInBattle;
}


/* ============================================================
   LOAD SERVER INFORMATION
   ============================================================ */

/*
 * Request the homepage information from the backend.
 *
 * The backend endpoint is:
 *
 *     GET /api/homepage
 *
 * This endpoint supplies:
 * - Server status.
 * - Players online.
 * - Players in queue.
 * - Players in battle.
 * - Current season.
 * - Current season name.
 */
async function loadServerInformation() {

    try {

        const response =
            await fetch(
                "/api/homepage",
                {
                    method: "GET",
                    credentials: "same-origin",
                    cache: "no-store"
                }
            );


        /*
         * A non-2xx response means the request failed.
         */
        if (!response.ok) {
            throw new Error(
                `Server returned HTTP ${response.status}`
            );
        }


        const data =
            await response.json();


        /*
         * Update the online indicator.
         */
        setServerStatus(
            data.online === true
        );


        /*
         * Update player counters.
         */
        updateServerCounters(data);


        /*
         * Return the data in case another function needs it.
         */
        return data;

    } catch (error) {

        console.error(
            "Failed to load server information:",
            error
        );


        /*
         * Reset the counters when the server cannot be reached.
         */
        elements.playersOnline.textContent = "0";

        elements.playersQueue.textContent = "0";

        elements.playersBattle.textContent = "0";


        setServerStatus(false);


        return null;
    }
}


/* ============================================================
   PROFILE RANK DISPLAY
   ============================================================ */

/*
 * Return a CSS class for a player's rank.
 *
 * This is kept separate so rank-specific styling can be expanded
 * later without changing the profile-loading code.
 */
function getRankClass(rank) {

    switch (String(rank).toLowerCase()) {

        case "owner":
            return "profile-rank";

        case "mod":
        case "moderator":
            return "profile-rank";

        default:
            return "profile-rank";
    }
}


/* ============================================================
   CREATE PROFILE ROW
   ============================================================ */

/*
 * Create one row for the profile summary.
 *
 * Example:
 *
 *     Username: Innygr
 *
 * Keeping this in a function prevents repeated HTML-building
 * code throughout the profile section.
 */
function createProfileRow(label, value, extraClass = "") {

    const row =
        document.createElement("div");

    row.className = "profile-row";


    const labelElement =
        document.createElement("span");

    labelElement.className =
        "profile-label";

    labelElement.textContent =
        label;


    const valueElement =
        document.createElement("span");

    valueElement.className =
        `profile-value ${extraClass}`.trim();

    valueElement.textContent =
        value;


    row.appendChild(labelElement);

    row.appendChild(valueElement);


    return row;
}


/* ============================================================
   DISPLAY SIGNED-OUT PROFILE
   ============================================================ */

/*
 * Display the profile section when nobody is signed in.
 */
function displaySignedOutProfile() {

    /*
     * Update the header.
     */
    elements.headerUsername.textContent =
        "Not signed in";


    /*
     * Keep the profile link available so a user can go to the
     * profile/login page.
     */
    elements.headerProfileLink.textContent =
        "Profile";


    elements.profileContent.innerHTML = "";


    const message =
        document.createElement("p");

    message.className =
        "profile-login-message";

    message.textContent =
        "Sign in to see your profile and ELO.";


    elements.profileContent.appendChild(
        message
    );
}


/* ============================================================
   DISPLAY SIGNED-IN PROFILE
   ============================================================ */

/*
 * Display information belonging to the currently signed-in
 * player.
 */
function displaySignedInProfile(player) {

    /*
     * Make sure there is a usable username.
     */
    const username =
        typeof player.username === "string"
            ? player.username
            : "Unknown";


    /*
     * ELO defaults to 1000 because that is the server's starting
     * rating.
     */
    const elo =
        Number.isFinite(Number(player.elo))
            ? Number(player.elo)
            : 1000;


    /*
     * Rank defaults to Player for normal accounts.
     */
    const rank =
        typeof player.rank === "string"
            ? player.rank
            : "Player";


    /*
     * Update the small account indicator in the header.
     */
    elements.headerUsername.textContent =
        username;


    elements.headerProfileLink.textContent =
        "Profile";


    /*
     * Clear the old profile content before rebuilding it.
     */
    elements.profileContent.innerHTML = "";


    /*
     * Username row.
     */
    elements.profileContent.appendChild(
        createProfileRow(
            "Username:",
            username
        )
    );


    /*
     * ELO row.
     */
    elements.profileContent.appendChild(
        createProfileRow(
            "Rating:",
            `${elo} ELO`
        )
    );


    /*
     * Rank row.
     */
    elements.profileContent.appendChild(
        createProfileRow(
            "Rank:",
            rank,
            getRankClass(rank)
        )
    );


    /*
     * Create the VIEW PROFILE link.
     */
    const profileButton =
        document.createElement("a");

    profileButton.className =
        "profile-button";

    profileButton.href =
        "/profile";

    profileButton.textContent =
        "VIEW PROFILE";


    elements.profileContent.appendChild(
        profileButton
    );
}


/* ============================================================
   LOAD CURRENT PLAYER
   ============================================================ */

/*
 * Ask the backend who is currently signed in.
 *
 * The server endpoint:
 *
 *     GET /api/me
 *
 * returns the current player when a valid session exists.
 */
async function loadCurrentPlayer() {

    try {

        const response =
            await fetch(
                "/api/me",
                {
                    method: "GET",
                    credentials: "same-origin",
                    cache: "no-store"
                }
            );


        /*
         * A 401 means there is no signed-in player.
         */
        if (response.status === 401) {

            displaySignedOutProfile();

            return null;
        }


        if (!response.ok) {

            throw new Error(
                `Server returned HTTP ${response.status}`
            );
        }


        const data =
            await response.json();


        /*
         * The API may return the player directly or under a
         * `player` property depending on the server response.
         */
        const player =
            data.player || data;


        /*
         * Make sure the response actually contains player data.
         */
        if (
            !player ||
            typeof player !== "object" ||
            typeof player.username !== "string"
        ) {

            displaySignedOutProfile();

            return null;
        }


        displaySignedInProfile(player);


        return player;

    } catch (error) {

        console.error(
            "Failed to load current player:",
            error
        );


        /*
         * If the account request fails, we still want the homepage
         * itself to remain usable.
         */
        displaySignedOutProfile();


        return null;
    }
}


/* ============================================================
   PLAY BUTTON
   ============================================================ */

/*
 * Handle the PLAY button.
 *
 * The actual matchmaking system will eventually be connected
 * here. For now, it opens the card game page.
 */
function handlePlay() {

    window.location.href =
        "/cardgame.html";
}


/* ============================================================
   DECK BUILDER BUTTON
   ============================================================ */

/*
 * Handle the DECK BUILDER button.
 *
 * The current card game page is used as the temporary destination
 * until the dedicated deck-builder page is created.
 */
function handleDeckBuilder() {

    window.location.href =
        "/cardgame.html";
}


/* ============================================================
   HOW TO PLAY BUTTON
   ============================================================ */

/*
 * Handle the HOW TO PLAY button.
 *
 * `/how-to-play` is the planned rules page.
 */
function handleHowToPlay() {

    window.location.href =
        "/how-to-play";
}


/* ============================================================
   BUTTON EVENT LISTENERS
   ============================================================ */

/*
 * Connect each button to its corresponding function.
 */
elements.playButton.addEventListener(
    "click",
    handlePlay
);


elements.deckButton.addEventListener(
    "click",
    handleDeckBuilder
);


elements.howToPlayButton.addEventListener(
    "click",
    handleHowToPlay
);


/* ============================================================
   INITIAL PAGE LOAD
   ============================================================ */

/*
 * Put the server indicator into a loading state immediately.
 */
setServerLoading();


/*
 * Load both pieces of dynamic information when the page opens.
 *
 * Promise.all lets the two requests happen at the same time.
 */
Promise.all([
    loadServerInformation(),
    loadCurrentPlayer()
]);


/* ============================================================
   AUTOMATIC SERVER REFRESH
   ============================================================ */

/*
 * Refresh the server statistics periodically.
 *
 * The player's profile does not need to be reloaded every 10
 * seconds because their profile information normally changes
 * much less frequently.
 */
setInterval(
    loadServerInformation,
    STATUS_REFRESH_INTERVAL
);
