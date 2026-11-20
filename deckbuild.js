"use strict";

/*
 * The deck builder page is present, but the current backend does not expose
 * account inventory or deck persistence endpoints. Keep the page honest and
 * avoid leaving its loading placeholders spinning forever.
 *
 * Replace this temporary state renderer when the deck API is implemented.
 */
(function () {
    function showUnavailable() {
        const status = document.getElementById("deck-status");
        if (status) {
            status.textContent = "Deck building is not connected yet. The account and deck APIs are not available on the server.";
            status.setAttribute("role", "status");
            status.setAttribute("aria-live", "polite");
        }

        const currentDeck = document.getElementById("current-deck");
        if (currentDeck) {
            currentDeck.replaceChildren();
            const message = document.createElement("p");
            message.className = "loading-message";
            message.textContent = "Your saved deck will appear here when deck services are available.";
            currentDeck.appendChild(message);
        }

        const unlockedCards = document.getElementById("unlocked-cards");
        if (unlockedCards) {
            unlockedCards.replaceChildren();
            const message = document.createElement("p");
            message.className = "loading-message";
            message.textContent = "Card collection loading requires the account API, which is not implemented yet.";
            unlockedCards.appendChild(message);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", showUnavailable, { once: true });
    } else {
        showUnavailable();
    }
})();
