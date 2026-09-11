```javascript
/*
 * ============================================================
 * Card Stuff Yes
 * Homepage JavaScript
 * ============================================================
 *
 * This file handles:
 *
 * - Server status
 * - Player counts
 * - Signed-in player information
 * - ELO display
 * - Homepage buttons
 *
 * The browser does NOT decide the player's ELO or rank.
 *
 * Those values come from the server.
 *
 * ============================================================
 */


/* ============================================================
   API HELPER
   ============================================================ */

/*
 * Sends a request to the Card Stuff Yes server API.
 *
 * Keeping this in one function makes the rest of the file
 * easier to read.
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
     * Try to read the JSON response.
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
                : "Request failed.";


        throw new Error(message);
    }


    return data;
}


/* ============================================================
   SERVER STATUS
   ============================================================ */

/*
 * Loads the current server status and player counts.
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

        const data =
            await apiRequest(
                "/api/homepage"
            );


        /*
         * Display whether the server is online.
         */
        if (data.online) {

            statusText.textContent =
                "Server Online";

            statusDot.textContent =
                "●";

            statusDot.classList.remove(
                "offline"
            );

        } else {

            statusText.textContent =
                "Server Offline";

            statusDot.textContent =
                "●";

            statusDot.classList.add(
                "offline"
            );
        }


        /*
         * Display the current number of connected players.
         */
        playersOnline.textContent =
            Number.isFinite(
                data.playersOnline
            )
                ? data.playersOnline
                : 0;


        /*
         * Display the number of players waiting
         * for matchmaking.
         */
        playersQueue.textContent =
            Number.isFinite(
                data.playersInQueue
            )
                ? data.playersInQueue
                : 0;


        /*
         * Display the number of players currently
         * participating in battles.
         */
        playersBattle.textContent =
            Number.isFinite(
                data.playersInBattle
            )
                ? data.playersInBattle
                : 0;


    } catch (error) {

        /*
         * If the request itself fails, show the server
         * as unavailable rather than leaving the page
         * stuck on "Checking server...".
         */

        statusText.textContent =
            "Server Offline";


        statusDot.textContent =
            "●";


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
            "Could not load server status:",
            error
        );
    }
}


/* ============================================================
   CURRENT PLAYER
   ============================================================ */

/*
 * Loads the currently signed-in player.
 *
 * If there is no session, /api/me returns an authentication
 * error and the homepage displays a sign-in message instead.
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


        const player =
            data.player;


        /*
         * The server supplies the username.
         */
        headerUsername.textContent =
            player.username;


        /*
         * The profile link points to the current user's
         * profile page.
         */
        headerProfileLink.href =
            "/profile";


        /*
         * Create the profile summary.
         *
         * textContent is used for player-controlled values
         * so usernames cannot inject HTML into the page.
         */
        profileContent.innerHTML = "";


        const card =
            document.createElement(
                "div"
            );


        card.className =
            "profile-card";


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


        /*
         * ELO.
         */
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
            `${Number(player.elo) || 0} ELO`;


        eloRow.appendChild(
            eloLabel
        );


        eloRow.appendChild(
            eloValue
        );


        card.appendChild(
            eloRow
        );


        /*
         * Rank.
         */
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
            player.rank;


        rankRow.appendChild(
            rankLabel
        );


        rankRow.appendChild(
            rankValue
        );


        card.appendChild(
            rankRow
        );


        /*
         * Profile button.
         */
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


        profileContent.appendChild(
            card
        );


    } catch (error) {

        /*
         * No signed-in session.
         */
        headerUsername.textContent =
            "Not signed in";


        headerProfileLink.href =
            "/profile";


        profileContent.innerHTML = "";


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

    }
}


/* ============================================================
   PLAY BUTTON
   ============================================================ */

/*
 * The actual multiplayer matchmaking system will eventually
 * live behind this button.
 */
function setupPlayButton() {

    const button =
        document.getElementById(
            "play-button"
        );


    button.addEventListener(
        "click",
        () => {

            /*
             * This is temporarily the destination for
             * multiplayer gameplay.
             *
             * The actual lobby/matchmaking page can replace
             * this later.
             */
            window.location.href =
                "/cardgame.html";
        }
    );
}


/* ============================================================
   DECK BUTTON
   ============================================================ */

/*
 * Opens the deck builder.
 */
function setupDeckButton() {

    const button =
        document.getElementById(
            "deck-button"
        );


    button.addEventListener(
        "click",
        () => {

            /*
             * The deck builder will eventually have its own
             * page.
             *
             * For now, use the game page as the destination.
             */
            window.location.href =
                "/cardgame.html";
        }
    );
}


/* ============================================================
   HOW TO PLAY BUTTON
   ============================================================ */

/*
 * Opens the rules/instructions page.
 *
 * The actual rules page can be added later.
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


/* ============================================================
   AUTOMATIC STATUS REFRESH
   ============================================================ */

/*
 * Refresh server information periodically.
 *
 * This means the numbers on the homepage can change without
 * requiring the player to manually refresh the page.
 */
function startStatusRefresh() {

    /*
     * Update once every 10 seconds.
     */
    setInterval(
        loadServerStatus,
        10000
    );
}


/* ============================================================
   PAGE STARTUP
   ============================================================ */

/*
 * All scripts use defer, so the DOM is available when this
 * function runs.
 */
async function initializeHomepage() {

    await Promise.all([
        loadServerStatus(),
        loadCurrentPlayer()
    ]);


    setupPlayButton();

    setupDeckButton();

    setupHowToPlayButton();

    startStatusRefresh();
}


/*
 * Start the homepage.
 */
initializeHomepage();
```
