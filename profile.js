/*
 * Card Stuff Yes - Profile Page
 *
 * This file handles:
 * - Loading the signed-in player's profile
 * - Displaying account information
 * - Displaying ELO rating
 * - Displaying badges
 * - Displaying unlocked cards
 * - Displaying the player's deck
 * - Changing the password
 * - Signing out
 * - Holding a card to zoom it on mobile/touch devices
 */


/* =========================================================
   GLOBAL STATE
   ========================================================= */

/*
 * Stores the currently loaded player.
 *
 * This is only UI state.
 * The server remains authoritative over the player's
 * username, rank, ELO, cards, and deck.
 */
let currentPlayer = null;


/*
 * Used for the card hold-to-zoom feature.
 */
let cardHoldTimer = null;


/*
 * Used to remember the card currently being zoomed.
 */
let zoomedCard = null;


/* =========================================================
   PAGE INITIALIZATION
   ========================================================= */

/*
 * Wait until the page has loaded before looking for elements
 * and making API requests.
 */
document.addEventListener("DOMContentLoaded", () => {
    setupEventListeners();
    loadProfile();
});


/* =========================================================
   EVENT LISTENERS
   ========================================================= */

/*
 * Connects buttons and forms to their handlers.
 */
function setupEventListeners() {
    const passwordForm = document.getElementById("change-password-form");
    const logoutButton = document.getElementById("logout-button");
    const cardOverlay = document.getElementById("card-overlay");

    if (passwordForm) {
        passwordForm.addEventListener("submit", handlePasswordChange);
    }

    if (logoutButton) {
        logoutButton.addEventListener("click", handleLogout);
    }

    /*
     * Clicking the dark area closes the card zoom.
     */
    if (cardOverlay) {
        cardOverlay.addEventListener("click", (event) => {
            if (
                event.target === cardOverlay ||
                event.target.classList.contains("card-overlay-background")
            ) {
                closeCardZoom();
            }
        });
    }

    /*
     * Escape closes the card zoom on keyboards.
     */
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeCardZoom();
        }
    });
}


/* =========================================================
   PROFILE LOADING
   ========================================================= */

/*
 * Requests the current player's profile from the server.
 *
 * The server decides who is signed in using the session cookie.
 */
async function loadProfile() {
    try {
        const response = await fetch("/api/me", {
            method: "GET",
            credentials: "include"
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to load profile.");
        }

        /*
         * Save the server-provided player data.
         */
        currentPlayer = data.player;

        /*
         * Display all profile sections.
         */
        displayProfile();
    } catch (error) {
        console.error("Failed to load profile:", error);

        displayProfileError(error.message);
    }
}


/* =========================================================
   PROFILE DISPLAY
   ========================================================= */

/*
 * Displays the complete profile after it has been received
 * from the server.
 */
function displayProfile() {
    if (!currentPlayer) {
        return;
    }

    displayAccount();
    displayBadges();
    displayUnlockedCards();
    displayDeck();

    /*
     * Show the temporary-password warning when required.
     */
    const warning = document.getElementById("password-warning");

    if (warning) {
        if (currentPlayer.mustChangePassword) {
            warning.classList.remove("hidden");
        } else {
            warning.classList.add("hidden");
        }
    }
}


/*
 * Displays username, player ID, ELO, rank, and account date.
 */
function displayAccount() {
    const username = document.getElementById("username");
    const playerId = document.getElementById("player-id");
    const elo = document.getElementById("elo");
    const rank = document.getElementById("rank");
    const created = document.getElementById("created");

    const profileUsername = document.getElementById("profile-username");
    const profileRank = document.getElementById("profile-rank");

    if (username) {
        username.textContent = currentPlayer.username || "Unknown";
    }

    if (playerId) {
        playerId.textContent =
            currentPlayer.id !== undefined && currentPlayer.id !== null
                ? String(currentPlayer.id)
                : "Unknown";
    }

    if (elo) {
        elo.textContent = formatELO(currentPlayer.elo);
    }

    if (rank) {
        rank.textContent = currentPlayer.rank || "Player";
    }

    if (created) {
        created.textContent = formatDate(currentPlayer.createdAt);
    }

    if (profileUsername) {
        profileUsername.textContent = currentPlayer.username || "Profile";
    }

    if (profileRank) {
        profileRank.textContent = currentPlayer.rank || "Player";
    }
}


/*
 * Formats the player's ELO rating.
 *
 * ELO is expected to come from the server.
 * The browser does not calculate or modify it.
 */
function formatELO(elo) {
    if (elo === null || elo === undefined || elo === "") {
        return "Not available";
    }

    const numericELO = Number(elo);

    if (!Number.isFinite(numericELO)) {
        return `${elo} ELO`;
    }

    return `${Math.round(numericELO)} ELO`;
}


/* =========================================================
   BADGES
   ========================================================= */

/*
 * Displays the player's badges.
 */
function displayBadges() {
    const container = document.getElementById("badges");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    const badges = Array.isArray(currentPlayer.badges)
        ? currentPlayer.badges
        : [];

    if (badges.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-text";
        empty.textContent = "No badges yet.";
        container.appendChild(empty);

        return;
    }

    badges.forEach((badge) => {
        const badgeElement = document.createElement("div");
        badgeElement.className = "badge";

        const image = document.createElement("img");

        /*
         * Badge image paths are supplied by the server.
         */
        image.src = badge.image || "";
        image.alt = badge.name || "Badge";

        /*
         * Broken images are hidden rather than showing
         * a broken-image icon.
         */
        image.addEventListener("error", () => {
            image.classList.add("image-hidden");
        });

        const name = document.createElement("div");
        name.className = "badge-name";
        name.textContent = badge.name || "Badge";

        badgeElement.appendChild(image);
        badgeElement.appendChild(name);

        container.appendChild(badgeElement);
    });
}


/* =========================================================
   UNLOCKED CARDS
   ========================================================= */

/*
 * Displays every card the player has unlocked.
 */
function displayUnlockedCards() {
    const container = document.getElementById("unlocked-cards");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    const cards = Array.isArray(currentPlayer.unlockedCards)
        ? currentPlayer.unlockedCards
        : [];

    if (cards.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-text";
        empty.textContent = "No cards unlocked yet.";
        container.appendChild(empty);

        return;
    }

    cards.forEach((card) => {
        container.appendChild(createCardElement(card));
    });
}


/* =========================================================
   DECK
   ========================================================= */

/*
 * Displays the cards currently saved in the player's deck.
 */
function displayDeck() {
    const container = document.getElementById("deck");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    const deck = Array.isArray(currentPlayer.deck)
        ? currentPlayer.deck
        : [];

    if (deck.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-text";
        empty.textContent = "No cards in deck.";
        container.appendChild(empty);

        return;
    }

    deck.forEach((card) => {
        container.appendChild(createCardElement(card));
    });
}


/* =========================================================
   CARD ELEMENT CREATION
   ========================================================= */

/*
 * Creates the visual HTML element for a card.
 *
 * Card information is treated as data rather than inserted
 * directly into innerHTML, which helps prevent HTML injection.
 */
function createCardElement(card) {
    const cardElement = document.createElement("div");
    cardElement.className = "card-item";

    /*
     * Cards may be represented as either:
     *
     * { cardId: "example" }
     *
     * or
     *
     * { id: "example" }
     *
     * depending on the API data.
     */
    const cardId =
        card && card.cardId !== undefined
            ? card.cardId
            : card && card.id !== undefined
                ? card.id
                : card;

    const cardName =
        card && card.name
            ? card.name
            : String(cardId || "Unknown Card");

    /*
     * Current card assets are expected to live under
     * /assets/cards/.
     */
    const image = document.createElement("img");

    image.src = `/assets/cards/${encodeURIComponent(cardId)}.png`;
    image.alt = cardName;

    /*
     * Hide the image if the asset does not exist.
     */
    image.addEventListener("error", () => {
        image.classList.add("image-hidden");
    });

    const name = document.createElement("div");
    name.className = "card-name";
    name.textContent = cardName;

    cardElement.appendChild(image);
    cardElement.appendChild(name);

    /*
     * Set up hold-to-zoom for touch devices.
     */
    setupCardZoom(cardElement, image, cardName);

    return cardElement;
}


/* =========================================================
   CARD HOLD-TO-ZOOM
   ========================================================= */

/*
 * Adds both mouse and touch support for zooming cards.
 */
function setupCardZoom(cardElement, image, cardName) {
    /*
     * Touch start.
     */
    cardElement.addEventListener("touchstart", () => {
        startCardHold(image, cardName);
    }, { passive: true });

    /*
     * Touch end/cancel.
     */
    cardElement.addEventListener("touchend", cancelCardHold);
    cardElement.addEventListener("touchcancel", cancelCardHold);

    /*
     * Mouse support.
     */
    cardElement.addEventListener("mousedown", () => {
        startCardHold(image, cardName);
    });

    cardElement.addEventListener("mouseup", cancelCardHold);
    cardElement.addEventListener("mouseleave", cancelCardHold);

    /*
     * Right-click is prevented because the card is intended
     * to use the custom zoom interaction.
     */
    cardElement.addEventListener("contextmenu", (event) => {
        event.preventDefault();
    });
}


/*
 * Starts the 450ms hold timer.
 */
function startCardHold(image, cardName) {
    cancelCardHold();

    cardHoldTimer = setTimeout(() => {
        openCardZoom(image.src, cardName);
    }, 450);
}


/*
 * Cancels an active hold timer.
 */
function cancelCardHold() {
    if (cardHoldTimer !== null) {
        clearTimeout(cardHoldTimer);
        cardHoldTimer = null;
    }
}


/* =========================================================
   CARD ZOOM
   ========================================================= */

/*
 * Opens the full-screen card zoom overlay.
 */
function openCardZoom(imageSource, cardName) {
    const overlay = document.getElementById("card-overlay");
    const zoomedImage = document.getElementById("zoomed-card");

    if (!overlay || !zoomedImage) {
        return;
    }

    zoomedCard = imageSource;

    zoomedImage.src = imageSource;
    zoomedImage.alt = cardName || "Zoomed card";

    overlay.classList.remove("hidden");
}


/*
 * Closes the card zoom overlay.
 */
function closeCardZoom() {
    cancelCardHold();

    const overlay = document.getElementById("card-overlay");
    const zoomedImage = document.getElementById("zoomed-card");

    if (overlay) {
        overlay.classList.add("hidden");
    }

    if (zoomedImage) {
        zoomedImage.src = "";
    }

    zoomedCard = null;
}


/* =========================================================
   PASSWORD CHANGE
   ========================================================= */

/*
 * Sends a password-change request to the server.
 */
async function handlePasswordChange(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const message = document.getElementById("password-message");

    const currentPassword =
        document.getElementById("current-password")?.value || "";

    const newPassword =
        document.getElementById("new-password")?.value || "";

    const confirmPassword =
        document.getElementById("confirm-password")?.value || "";

    if (message) {
        message.textContent = "";
        message.className = "form-message";
    }

    /*
     * Make sure the two new-password fields match before
     * contacting the server.
     */
    if (newPassword !== confirmPassword) {
        showPasswordMessage(
            "New passwords do not match.",
            "error"
        );

        return;
    }

    if (!currentPassword || !newPassword) {
        showPasswordMessage(
            "Please fill in all password fields.",
            "error"
        );

        return;
    }

    const submitButton = form.querySelector("button[type='submit']");

    if (submitButton) {
        submitButton.disabled = true;
    }

    try {
        const response = await fetch("/api/auth/change-password", {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            credentials: "include",

            body: JSON.stringify({
                currentPassword,
                newPassword
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Failed to change password."
            );
        }

        showPasswordMessage(
            data.message || "Password changed successfully.",
            "success"
        );

        form.reset();

        /*
         * The server may return an updated player object.
         */
        if (data.player) {
            currentPlayer = data.player;
            displayProfile();
        } else if (currentPlayer) {
            currentPlayer.mustChangePassword = false;

            const warning = document.getElementById("password-warning");

            if (warning) {
                warning.classList.add("hidden");
            }
        }
    } catch (error) {
        console.error("Password change failed:", error);

        showPasswordMessage(
            error.message || "Failed to change password.",
            "error"
        );
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
        }
    }
}


/*
 * Displays a password form status message.
 */
function showPasswordMessage(message, type) {
    const element = document.getElementById("password-message");

    if (!element) {
        return;
    }

    element.textContent = message;
    element.className = `form-message ${type}`;
}


/* =========================================================
   LOGOUT
   ========================================================= */

/*
 * Signs the current player out by destroying their server
 * session.
 */
async function handleLogout() {
    const logoutButton = document.getElementById("logout-button");

    if (logoutButton) {
        logoutButton.disabled = true;
    }

    try {
        const response = await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "include"
        });

        if (!response.ok) {
            let data = {};

            try {
                data = await response.json();
            } catch {
                // Ignore invalid JSON from an error response.
            }

            throw new Error(
                data.error || "Failed to sign out."
            );
        }

        /*
         * Return to the homepage after signing out.
         */
        window.location.href = "/homepage.html";
    } catch (error) {
        console.error("Logout failed:", error);

        if (logoutButton) {
            logoutButton.disabled = false;
        }

        alert(error.message || "Failed to sign out.");
    }
}


/* =========================================================
   ERROR DISPLAY
   ========================================================= */

/*
 * Displays a useful error when the profile cannot be loaded.
 */
function displayProfileError(message) {
    const username = document.getElementById("profile-username");
    const profileRank = document.getElementById("profile-rank");

    if (username) {
        username.textContent = "Profile unavailable";
    }

    if (profileRank) {
        profileRank.textContent = message || "Please sign in.";
    }

    /*
     * Replace profile data with a simple sign-in message.
     */
    const sections = document.querySelectorAll(".profile-section");

    sections.forEach((section) => {
        if (
            section.querySelector("#badges") ||
            section.querySelector("#unlocked-cards") ||
            section.querySelector("#deck")
        ) {
            const container =
                section.querySelector(
                    "#badges, #unlocked-cards, #deck"
                );

            if (container) {
                container.innerHTML = "";

                const text = document.createElement("p");
                text.className = "empty-text";
                text.textContent =
                    "Sign in to view your profile information.";

                container.appendChild(text);
            }
        }
    });

    const accountInfo = document.querySelector(".account-info");

    if (accountInfo) {
        accountInfo.innerHTML = "";

        const text = document.createElement("p");
        text.className = "empty-text";
        text.textContent =
            "Sign in to see your profile and ELO.";

        accountInfo.appendChild(text);
    }
}


/* =========================================================
   DATE FORMATTING
   ========================================================= */

/*
 * Converts the server's account-created timestamp into
 * a readable local date/time.
 */
function formatDate(value) {
    if (!value) {
        return "Unknown";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString();
}


/* =========================================================
   HTML ESCAPING HELPER
   ========================================================= */

/*
 * Kept as a general-purpose helper for any future profile
 * UI that needs to safely display text inside HTML.
 */
function escapeHTML(value) {
    const div = document.createElement("div");

    div.textContent = value === null || value === undefined
        ? ""
        : String(value);

    return div.innerHTML;
}
