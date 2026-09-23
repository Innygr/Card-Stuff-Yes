/*
 * ============================================================
 * CARD STUFF YES
 * HOMEPAGE JAVASCRIPT
 * ============================================================
 */

(function () {

    "use strict";


    /* ========================================================
       BASIC HELPERS
       ======================================================== */

    function getElement(id) {

        return document.getElementById(id);

    }


    function setText(id, text) {

        const element =
            getElement(id);

        if (element) {

            element.textContent =
                String(text);

        }

    }


    function goTo(path) {

        window.location.href =
            path;

    }


    /* ========================================================
       LOADING SCREEN
       ======================================================== */

    function setLoadingDestination(text) {

        if (
            window.LoadingScreen &&
            typeof window.LoadingScreen.setDestination ===
                "function"
        ) {

            window.LoadingScreen.setDestination(
                text
            );

        }

    }


    function finishLoadingScreen() {

        if (
            window.LoadingScreen &&
            typeof window.LoadingScreen.finish ===
                "function"
        ) {

            window.LoadingScreen.finish();

        }

    }


    /* ========================================================
       SETTINGS
       ======================================================== */

    function getSavedSetting(
        key,
        defaultValue
    ) {

        try {

            const value =
                localStorage.getItem(key);


            if (value === null) {

                return defaultValue;

            }


            return value;

        } catch (error) {

            return defaultValue;

        }

    }


    function applyAccessibilitySettings() {

        const root =
            document.documentElement;


        const theme =
            getSavedSetting(
                "cardStuffYesTheme",
                "dark"
            );


        root.dataset.theme =
            theme;


        const reduceMotion =
            getSavedSetting(
                "cardStuffYesReduceMotion",
                "false"
            ) === "true";


        root.classList.toggle(
            "reduce-motion",
            reduceMotion
        );


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


    /* ========================================================
       API
       ======================================================== */

    async function apiRequest(
        url,
        options
    ) {

        const requestOptions =
            options || {};


        const response =
            await fetch(
                url,
                {
                    credentials: "same-origin",
                    ...requestOptions
                }
            );


        let data = null;


        const contentType =
            response.headers.get(
                "content-type"
            ) || "";


        if (
            contentType.includes(
                "application/json"
            )
        ) {

            try {

                data =
                    await response.json();

            } catch (error) {

                data = null;

            }

        }


        if (!response.ok) {

            const message =
                data &&
                typeof data.error === "string"

                    ? data.error

                    : "Request failed with status " +
                      response.status +
                      ".";


            throw new Error(
                message
            );

        }


        return data;

    }


    /* ========================================================
       SERVER STATUS
       ======================================================== */

    async function loadServerStatus() {

        const statusText =
            getElement(
                "server-status-text"
            );


        const statusDot =
            getElement(
                "server-status-dot"
            );


        const playersOnline =
            getElement(
                "players-online"
            );


        const playersQueue =
            getElement(
                "players-queue"
            );


        const playersBattle =
            getElement(
                "players-battle"
            );


        /*
         * GitHub Pages is static.
         *
         * Do NOT call /api/... here unless you have configured
         * a separate backend/API server.
         *
         * Set this to your actual backend URL when available.
         */

        const SERVER_API = "";


        if (!SERVER_API) {

            if (statusText) {

                statusText.textContent =
                    "Server Offline";

            }


            if (statusDot) {

                statusDot.classList.add(
                    "offline"
                );

            }


            if (playersOnline) {

                playersOnline.textContent =
                    "0";

            }


            if (playersQueue) {

                playersQueue.textContent =
                    "0";

            }


            if (playersBattle) {

                playersBattle.textContent =
                    "0";

            }


            return;

        }


        try {

            let data;


            try {

                data =
                    await apiRequest(
                        SERVER_API +
                        "/api/homepage"
                    );

            } catch (error) {

                data =
                    await apiRequest(
                        SERVER_API +
                        "/api/status"
                    );

            }


            const online =
                data &&
                data.online === true;


            if (online) {

                if (statusText) {

                    statusText.textContent =
                        "Server Online";

                }


                if (statusDot) {

                    statusDot.classList.remove(
                        "offline"
                    );

                }

            } else {

                if (statusText) {

                    statusText.textContent =
                        "Server Offline";

                }


                if (statusDot) {

                    statusDot.classList.add(
                        "offline"
                    );

                }

            }


            const onlineCount =
                Number(
                    data &&
                    data.playersOnline
                );


            const queueCount =
                Number(
                    data &&
                    data.playersInQueue
                );


            const battleCount =
                Number(
                    data &&
                    data.playersInBattle
                );


            if (playersOnline) {

                playersOnline.textContent =
                    Number.isFinite(
                        onlineCount
                    )
                        ? String(
                            onlineCount
                        )
                        : "0";

            }


            if (playersQueue) {

                playersQueue.textContent =
                    Number.isFinite(
                        queueCount
                    )
                        ? String(
                            queueCount
                        )
                        : "0";

            }


            if (playersBattle) {

                playersBattle.textContent =
                    Number.isFinite(
                        battleCount
                    )
                        ? String(
                            battleCount
                        )
                        : "0";

            }


        } catch (error) {

            console.error(
                "Could not load server status:",
                error
            );


            if (statusText) {

                statusText.textContent =
                    "Server Offline";

            }


            if (statusDot) {

                statusDot.classList.add(
                    "offline"
                );

            }


            if (playersOnline) {

                playersOnline.textContent =
                    "0";

            }


            if (playersQueue) {

                playersQueue.textContent =
                    "0";

            }


            if (playersBattle) {

                playersBattle.textContent =
                    "0";

            }

        }

    }


    /* ========================================================
       ELO
       ======================================================== */

    function formatELO(elo) {

        const value =
            Number(elo);


        if (
            !Number.isFinite(value)
        ) {

            return "Not available";

        }


        return (
            Math.round(value) +
            " ELO"
        );

    }


    /* ========================================================
       CURRENT PLAYER
       ======================================================== */

    async function loadCurrentPlayer() {

        const profileContent =
            getElement(
                "profile-content"
            );


        const headerUsername =
            getElement(
                "header-username"
            );


        const headerProfileLink =
            getElement(
                "header-profile-link"
            );


        /*
         * GitHub Pages cannot directly provide /api/me.
         *
         * Keep the page usable while signed out.
         */

        const SERVER_API = "";


        if (!SERVER_API) {

            if (headerUsername) {

                headerUsername.textContent =
                    "Not signed in";

            }


            if (headerProfileLink) {

                headerProfileLink.href =
                    "profile.html";

            }


            if (profileContent) {

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

            }


            return;

        }


        try {

            const data =
                await apiRequest(
                    SERVER_API +
                    "/api/me"
                );


            const player =
                data &&
                data.player;


            if (
                !player ||
                !player.username
            ) {

                throw new Error(
                    "Invalid player information."
                );

            }


            if (headerUsername) {

                headerUsername.textContent =
                    player.username;

            }


            if (headerProfileLink) {

                headerProfileLink.href =
                    "profile.html";

            }


            if (!profileContent) {

                return;

            }


            profileContent.innerHTML =
                "";


            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "profile-card";


            /*
             * USERNAME
             */

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
             * ELO
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


            /*
             * RANK
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
                player.rank ||
                "Player";


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
             * PROFILE BUTTON
             */

            const profileButton =
                document.createElement(
                    "a"
                );


            profileButton.className =
                "profile-button";


            profileButton.href =
                "profile.html";


            profileButton.textContent =
                "VIEW PROFILE";


            card.appendChild(
                profileButton
            );


            profileContent.appendChild(
                card
            );


        } catch (error) {

            console.log(
                "No signed-in player found.",
                error
            );


            if (headerUsername) {

                headerUsername.textContent =
                    "Not signed in";

            }


            if (headerProfileLink) {

                headerProfileLink.href =
                    "profile.html";

            }


            if (profileContent) {

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

            }

        }

    }


    /* ========================================================
       NAVIGATION
       ======================================================== */

    function setupButton(
        id,
        path
    ) {

        const button =
            getElement(id);


        if (!button) {

            console.warn(
                "Button not found:",
                id
            );

            return;

        }


        button.addEventListener(
            "click",
            function (event) {

                event.preventDefault();

                goTo(path);

            }
        );

    }


    function setupNavigation() {

        /*
         * IMPORTANT:
         *
         * These are relative paths.
         *
         * GitHub Pages repository:
         *
         * /Card-Stuff-Yes/
         *
         * Therefore:
         *
         * "cardgame.html"
         *
         * becomes:
         *
         * /Card-Stuff-Yes/cardgame.html
         */

        setupButton(
            "play-button",
            "cardgame.html"
        );


        setupButton(
            "deck-button",
            "deckbuild.html"
        );


        setupButton(
            "news-button",
            "news.html"
        );


        setupButton(
            "how-to-play-button",
            "how-to-play.html"
        );


        setupButton(
            "settings-button",
            "settings.html"
        );

    }


    /* ========================================================
       SERVER REFRESH
       ======================================================== */

    function startStatusRefresh() {

        window.setInterval(
            function () {

                loadServerStatus();

            },
            10000
        );

    }


    /* ========================================================
       INITIALIZATION
       ======================================================== */

    async function initializeHomepage() {

        applyAccessibilitySettings();


        setLoadingDestination(
            "Loading homepage"
        );


        /*
         * Promise.allSettled means a failed API call cannot
         * stop the rest of the homepage from loading.
         */

        await Promise.allSettled([
            loadServerStatus(),
            loadCurrentPlayer()
        ]);


        setupNavigation();


        startStatusRefresh();


        finishLoadingScreen();

    }


    /* ========================================================
       START
       ======================================================== */

    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            initializeHomepage,
            {
                once: true
            }
        );

    } else {

        initializeHomepage();

    }

})();
