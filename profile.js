```javascript
/* ================================================================
   CARD STUFF YES - PROFILE JAVASCRIPT

   This file handles everything the profile page DOES.

   Visual appearance belongs in profile.css.

   This file handles:

   - Loading the signed-in player
   - Displaying account information
   - Displaying badges
   - Displaying unlocked cards
   - Displaying the deck
   - Holding cards to zoom
   - Changing passwords
   - Logging out

   ================================================================ */


/* ================================================================
   GLOBAL VARIABLES
   ================================================================ */

// Stores the currently signed-in player.

let currentPlayer = null;


// Stores the timer used for card hold detection.

let cardHoldTimer = null;


// Tracks whether the current pointer interaction opened
// the card zoom.

let cardWasHeld = false;


/* ================================================================
   LOAD PROFILE
   ================================================================
   
   Gets the currently signed-in player from:

       GET /api/me

   The server determines who the player is using their session
   cookie.

   ================================================================ */

async function loadProfile() {

    try {

        const response = await fetch(
            "/api/me",
            {
                method: "GET",

                credentials: "same-origin"
            }
        );


        const data = await response.json();


        /* --------------------------------------------------------
           PLAYER IS NOT SIGNED IN
           -------------------------------------------------------- */

        if (!response.ok) {

            showNotSignedIn();

            return;
        }


        /* --------------------------------------------------------
           SAVE PLAYER DATA
           -------------------------------------------------------- */

        currentPlayer = data.player;


        /* --------------------------------------------------------
           DISPLAY ACCOUNT INFORMATION
           -------------------------------------------------------- */

        displayAccount();


        /* --------------------------------------------------------
           DISPLAY BADGES
           -------------------------------------------------------- */

        displayBadges(
            currentPlayer.badges
        );


        /* --------------------------------------------------------
           DISPLAY UNLOCKED CARDS
           -------------------------------------------------------- */

        displayUnlockedCards(
            currentPlayer.unlockedCards
        );


        /* --------------------------------------------------------
           DISPLAY DECK
           -------------------------------------------------------- */

        displayDeck(
            currentPlayer.deck
        );


        /* --------------------------------------------------------
           CHECK TEMPORARY PASSWORD
           -------------------------------------------------------- */

        if (
            currentPlayer.mustChangePassword
        ) {

            showPasswordWarning();

        }

    } catch (error) {

        showProfileError(
            error.message
        );

    }

}


/* ================================================================
   DISPLAY ACCOUNT
   ================================================================ */

function displayAccount() {

    document.getElementById(
        "username"
    ).textContent =
        currentPlayer.username;


    document.getElementById(
        "player-id"
    ).textContent =
        currentPlayer.id;


    document.getElementById(
        "rank"
    ).textContent =
        currentPlayer.rank;


    document.getElementById(
        "created"
    ).textContent =
        formatDate(
            currentPlayer.createdAt
        );


    document.getElementById(
        "profile-subtitle"
    ).textContent =
        `Player #${currentPlayer.id}`;

}


/* ================================================================
   DISPLAY BADGES
   ================================================================
   
   The server provides the complete badge list.

   This means the client does NOT decide whether someone is an
   Owner, Mod, or Player.

   ================================================================ */

function displayBadges(badges) {

    const container =
        document.getElementById(
            "badges"
        );


    container.innerHTML = "";


    /* ------------------------------------------------------------
       NO BADGES
       ------------------------------------------------------------ */

    if (
        !Array.isArray(badges) ||
        badges.length === 0
    ) {

        const message =
            document.createElement(
                "div"
            );


        message.className =
            "empty-message";


        message.textContent =
            "No badges yet.";


        container.appendChild(
            message
        );


        return;
    }


    /* ------------------------------------------------------------
       CREATE EACH BADGE
       ------------------------------------------------------------ */

    for (const badge of badges) {

        const badgeElement =
            document.createElement(
                "div"
            );


        badgeElement.className =
            "badge";


        /* --------------------------------------------------------
           BADGE IMAGE
           -------------------------------------------------------- */

        if (badge.image) {

            const image =
                document.createElement(
                    "img"
                );


            image.className =
                "badge-image";


            image.src =
                badge.image;


            image.alt =
                badge.name || "Badge";


            /*
             * If the image doesn't exist, hide it instead of
             * displaying a broken-image icon.
             */

            image.addEventListener(
                "error",
                () => {

                    image.style.display =
                        "none";

                }
            );


            badgeElement.appendChild(
                image
            );

        }


        /* --------------------------------------------------------
           BADGE NAME
           -------------------------------------------------------- */

        const name =
            document.createElement(
                "span"
            );


        name.className =
            "badge-name";


        name.textContent =
            badge.name || "Badge";


        badgeElement.appendChild(
            name
        );


        container.appendChild(
            badgeElement
        );

    }

}


/* ================================================================
   DISPLAY UNLOCKED CARDS
   ================================================================ */

function displayUnlockedCards(cards) {

    const container =
        document.getElementById(
            "unlocked-cards"
        );


    container.innerHTML = "";


    /* ------------------------------------------------------------
       NO CARDS
       ------------------------------------------------------------ */

    if (
        !Array.isArray(cards) ||
        cards.length === 0
    ) {

        const message =
            document.createElement(
                "div"
            );


        message.className =
            "empty-message";


        message.textContent =
            "No cards unlocked yet.";


        container.appendChild(
            message
        );


        return;
    }


    /* ------------------------------------------------------------
       CREATE CARDS
       ------------------------------------------------------------ */

    for (const card of cards) {

        const cardElement =
            createCardElement(
                card.cardId,
                null
            );


        container.appendChild(
            cardElement
        );

    }

}


/* ================================================================
   DISPLAY DECK
   ================================================================ */

function displayDeck(deck) {

    const container =
        document.getElementById(
            "deck"
        );


    container.innerHTML = "";


    /* ------------------------------------------------------------
       EMPTY DECK
       ------------------------------------------------------------ */

    if (
        !Array.isArray(deck) ||
        deck.length === 0
    ) {

        const message =
            document.createElement(
                "div"
            );


        message.className =
            "empty-message";


        message.textContent =
            "Your deck is empty.";


        container.appendChild(
            message
        );


        return;
    }


    /* ------------------------------------------------------------
       CREATE DECK CARDS
       ------------------------------------------------------------ */

    for (const card of deck) {

        const cardElement =
            createCardElement(
                card.cardId,
                card.slot
            );


        container.appendChild(
            cardElement
        );

    }

}


/* ================================================================
   CREATE CARD ELEMENT
   ================================================================
   
   For now, cards only have their card ID.

   Once the actual card-definition system exists, this function
   can receive:

   - Card name
   - Artwork
   - Description
   - Rarity
   - Effects
   - etc.

   The hold-to-zoom functionality can stay the same.

   ================================================================ */

function createCardElement(
    cardId,
    slot
) {

    const card =
        document.createElement(
            "div"
        );


    card.className =
        "profile-card";


    card.setAttribute(
        "data-card-id",
        cardId
    );


    /* ------------------------------------------------------------
       CARD NAME
       ------------------------------------------------------------ */

    const name =
        document.createElement(
            "div"
        );


    name.className =
        "card-name";


    name.textContent =
        cardId;


    card.appendChild(
        name
    );


    /* ------------------------------------------------------------
       DECK SLOT
       ------------------------------------------------------------ */

    if (slot !== null) {

        const slotElement =
            document.createElement(
                "div"
            );


        slotElement.className =
            "card-slot";


        slotElement.textContent =
            `Deck slot ${slot + 1}`;


        card.appendChild(
            slotElement
        );

    }


    /* ------------------------------------------------------------
       CARD ID
       ------------------------------------------------------------ */

    const id =
        document.createElement(
            "div"
        );


    id.className =
        "card-id";


    id.textContent =
        `ID: ${cardId}`;


    card.appendChild(
        id
    );


    /* ------------------------------------------------------------
       HOLD-TO-ZOOM
       ------------------------------------------------------------
       
       Pointer events work with:

       - Mouse
       - Touch
       - Stylus

       A hold of approximately 450 ms opens the preview.

       ============================================================ */

    card.addEventListener(
        "pointerdown",
        event => {

            startCardHold(
                event,
                cardId
            );

        }
    );


    card.addEventListener(
        "pointerup",
        event => {

            endCardHold(
                event
            );

        }
    );


    card.addEventListener(
        "pointercancel",
        () => {

            cancelCardHold();

        }
    );


    card.addEventListener(
        "pointerleave",
        () => {

            cancelCardHold();

        }
    );


    return card;

}


/* ================================================================
   START CARD HOLD
   ================================================================ */

function startCardHold(
    event,
    cardId
) {

    /*
     * Prevent multiple simultaneous timers.
     */

    cancelCardHold();


    cardWasHeld = false;


    cardHoldTimer =
        setTimeout(
            () => {

                cardWasHeld = true;


                openCardZoom(
                    cardId
                );

            },
            450
        );

}


/* ================================================================
   END CARD HOLD
   ================================================================ */

function endCardHold(event) {

    if (
        cardHoldTimer !== null
    ) {

        clearTimeout(
            cardHoldTimer
        );

        cardHoldTimer = null;

    }

}


/* ================================================================
   CANCEL CARD HOLD
   ================================================================ */

function cancelCardHold() {

    if (
        cardHoldTimer !== null
    ) {

        clearTimeout(
            cardHoldTimer
        );

        cardHoldTimer = null;

    }

}


/* ================================================================
   OPEN CARD ZOOM
   ================================================================ */

function openCardZoom(cardId) {

    const overlay =
        document.getElementById(
            "card-overlay"
        );


    const title =
        document.getElementById(
            "zoom-card-title"
        );


    const id =
        document.getElementById(
            "zoom-card-id"
        );


    /* ------------------------------------------------------------
       PUT CARD INFORMATION INTO PREVIEW
       ------------------------------------------------------------ */

    title.textContent =
        cardId;


    id.textContent =
        `Card ID: ${cardId}`;


    /* ------------------------------------------------------------
       SHOW OVERLAY
       ------------------------------------------------------------ */

    overlay.classList.add(
        "is-visible"
    );


    overlay.setAttribute(
        "aria-hidden",
        "false"
    );

}


/* ================================================================
   CLOSE CARD ZOOM
   ================================================================ */

function closeCardZoom() {

    const overlay =
        document.getElementById(
            "card-overlay"
        );


    overlay.classList.remove(
        "is-visible"
    );


    overlay.setAttribute(
        "aria-hidden",
        "true"
    );

}


/* ================================================================
   OVERLAY CLICK HANDLER
   ================================================================
   
   Clicking the dark area outside the enlarged card closes it.

   ================================================================ */

document.addEventListener(
    "click",
    event => {

        const overlay =
            document.getElementById(
                "card-overlay"
            );


        if (
            event.target === overlay
        ) {

            closeCardZoom();

        }

    }
);


/* ================================================================
   ESCAPE KEY
   ================================================================
   
   Useful for desktop users.

   ================================================================ */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Escape"
        ) {

            closeCardZoom();

        }

    }
);


/* ================================================================
   SHOW PASSWORD WARNING
   ================================================================ */

function showPasswordWarning() {

    const warning =
        document.getElementById(
            "password-warning"
        );


    warning.classList.add(
        "is-visible"
    );

}


/* ================================================================
   CHANGE PASSWORD
   ================================================================ */

document
    .getElementById(
        "password-form"
    )
    .addEventListener(
        "submit",
        async event => {

            event.preventDefault();


            const currentPassword =
                document.getElementById(
                    "current-password"
                ).value;


            const newPassword =
                document.getElementById(
                    "new-password"
                ).value;


            const confirmPassword =
                document.getElementById(
                    "confirm-password"
                ).value;


            const status =
                document.getElementById(
                    "password-status"
                );


            /* ----------------------------------------------------
               MAKE SURE NEW PASSWORDS MATCH
               ---------------------------------------------------- */

            if (
                newPassword !==
                confirmPassword
            ) {

                status.textContent =
                    "The new passwords do not match.";

                return;
            }


            /* ----------------------------------------------------
               SEND PASSWORD CHANGE TO SERVER
               ---------------------------------------------------- */

            try {

                const response =
                    await fetch(
                        "/api/auth/change-password",
                        {
                            method: "POST",

                            credentials:
                                "same-origin",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify({
                                    currentPassword,
                                    newPassword
                                })
                        }
                    );


                const data =
                    await response.json();


                /* ------------------------------------------------
                   SERVER REJECTED REQUEST
                   ------------------------------------------------ */

                if (
                    !response.ok
                ) {

                    status.textContent =
                        data.error ||
                        "Could not change password.";

                    return;
                }


                /* ------------------------------------------------
                   SUCCESS
                   ------------------------------------------------ */

                status.textContent =
                    data.message ||
                    "Password changed successfully.";


                /*
                 * The server invalidates every session after a
                 * password change, so the player needs to sign
                 * in again.
                 */

                document
                    .getElementById(
                        "password-form"
                    )
                    .reset();


                setTimeout(
                    () => {

                        window.location.href =
                            "/";

                    },
                    1500
                );


            } catch (error) {

                status.textContent =
                    "Could not connect to the server.";

            }

        }
    );


/* ================================================================
   LOGOUT
   ================================================================ */

document
    .getElementById(
        "logout-button"
    )
    .addEventListener(
        "click",
        async () => {

            try {

                await fetch(
                    "/api/auth/logout",
                    {
                        method: "POST",

                        credentials:
                            "same-origin"
                    }
                );

            } finally {

                /*
                 * Return to the main page regardless of whether
                 * the request succeeded.
                 */

                window.location.href =
                    "/";

            }

        }
    );


/* ================================================================
   NOT SIGNED IN
   ================================================================ */

function showNotSignedIn() {

    const profile =
        document.getElementById(
            "profile"
        );


    profile.innerHTML = `

        <header class="profile-header">

            <h1 class="profile-title">
                Not Signed In
            </h1>

            <p class="profile-subtitle">
                You must sign in to view your profile.
            </p>

        </header>

        <a
            class="back-link"
            href="/"
        >
            Go to Sign In
        </a>

    `;

}


/* ================================================================
   PROFILE ERROR
   ================================================================ */

function showProfileError(
    message
) {

    const profile =
        document.getElementById(
            "profile"
        );


    profile.innerHTML = `

        <header class="profile-header">

            <h1 class="profile-title">
                Profile Error
            </h1>

            <p class="profile-subtitle">
                Could not load your profile.
            </p>

        </header>

        <p class="form-status">
            ${escapeHTML(message)}
        </p>

        <a
            class="back-link"
            href="/"
        >
            Return Home
        </a>

    `;

}


/* ================================================================
   FORMAT DATE
   ================================================================ */

function formatDate(
    dateString
) {

    const date =
        new Date(
            dateString
        );


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return dateString;

    }


    return date.toLocaleString();

}


/* ================================================================
   HTML ESCAPING
   ================================================================
   
   Used only for the error message above.

   Normal player information uses textContent, which is safer
   because it doesn't interpret HTML.

   ================================================================ */

function escapeHTML(
    value
) {

    return String(value)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


/* ================================================================
   START PROFILE
   ================================================================ */

loadProfile();
```
