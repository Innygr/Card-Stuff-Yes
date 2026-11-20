"use strict";

(function () {
    const api = window.CSY_API;
    const ui = {
        status: document.getElementById("deck-status"),
        catalog: document.getElementById("unlocked-cards"),
        deck: document.getElementById("current-deck"),
        count: document.getElementById("deck-count"),
        name: document.getElementById("deck-name"),
        save: document.getElementById("save-deck-button"),
        saved: document.getElementById("saved-decks"),
        load: document.getElementById("load-deck-button"),
        remove: document.getElementById("delete-deck-button"),
        newDeck: document.getElementById("new-deck-button")
    };

    let catalog = [];
    let decks = [];
    let cards = [];
    let currentDeckId = null;
    let busy = false;
    const MAX_CARDS = 60;

    function status(message, error = false) {
        ui.status.textContent = message;
        ui.status.style.opacity = message ? "1" : "0";
        ui.status.style.pointerEvents = message ? "auto" : "none";
        ui.status.dataset.state = error ? "error" : "success";
    }

    function accountLogin() {
        const accountBase = window.CSY_CONFIG?.routes?.account || "https://account.cardstuffyes.ca/";
        window.location.assign(new URL("login.html", accountBase).href);
    }

    async function request(path, options) {
        try {
            return await api.request(path, options);
        } catch (error) {
            if (error.status === 401) accountLogin();
            throw error;
        }
    }

    function createCardTile(card, actionLabel, onAction) {
        const item = document.createElement("article");
        item.className = "card-item";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "card-button";
        button.setAttribute("aria-label", card.name + " — " + actionLabel);

        const fallback = document.createElement("span");
        fallback.className = "card-image-fallback";
        fallback.textContent = card.symbol || card.name;
        const info = document.createElement("span");
        info.className = "card-info";
        const name = document.createElement("span");
        name.className = "card-name";
        name.textContent = card.name;
        const id = document.createElement("span");
        id.className = "card-id";
        id.textContent = card.id + " · " + card.type + " · Cost " + card.cost;
        info.append(name, id);
        button.append(fallback, info);
        button.addEventListener("click", onAction);

        const action = document.createElement("button");
        action.type = "button";
        action.className = "card-action";
        action.textContent = actionLabel;
        action.addEventListener("click", onAction);
        item.append(button, action);
        return item;
    }

    function renderCatalog() {
        ui.catalog.replaceChildren();
        const grid = document.createElement("div");
        grid.className = "card-grid";
        for (const card of catalog) {
            grid.appendChild(createCardTile(card, "ADD TO DECK", () => {
                if (busy) return;
                if (cards.length >= MAX_CARDS) {
                    status("A saved deck can contain up to " + MAX_CARDS + " cards.", true);
                    return;
                }
                cards.push(card.id);
                renderDeck();
                status(card.name + " added.");
            }));
        }
        ui.catalog.appendChild(grid);
    }

    function renderDeck() {
        ui.deck.replaceChildren();
        ui.count.textContent = cards.length + (cards.length === 1 ? " card" : " cards");
        if (!cards.length) {
            const empty = document.createElement("p");
            empty.className = "empty-deck";
            empty.textContent = "Your deck is empty. Add cards from the catalog below.";
            ui.deck.appendChild(empty);
            return;
        }
        const grid = document.createElement("div");
        grid.className = "card-grid";
        cards.forEach((cardId, index) => {
            const card = catalog.find(item => item.id === cardId);
            if (!card) return;
            grid.appendChild(createCardTile(card, "REMOVE", () => {
                if (busy) return;
                cards.splice(index, 1);
                renderDeck();
                status(card.name + " removed.");
            }));
        });
        ui.deck.appendChild(grid);
    }

    function renderSavedDecks() {
        const selected = ui.saved.value;
        ui.saved.replaceChildren();
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Choose a saved deck";
        ui.saved.appendChild(placeholder);
        for (const deck of decks) {
            const option = document.createElement("option");
            option.value = deck.id;
            option.textContent = deck.name + " (" + deck.cards.length + ")";
            ui.saved.appendChild(option);
        }
        if (decks.some(deck => deck.id === selected)) ui.saved.value = selected;
        ui.load.disabled = decks.length === 0;
        ui.remove.disabled = !currentDeckId;
    }

    async function refreshDecks() {
        const data = await request("/api/account/decks");
        decks = Array.isArray(data.decks) ? data.decks : [];
        renderSavedDecks();
    }

    function loadSelectedDeck() {
        const deck = decks.find(item => item.id === ui.saved.value);
        if (!deck) {
            status("Choose a saved deck first.", true);
            return;
        }
        cards = deck.cards.slice();
        currentDeckId = deck.id;
        ui.name.value = deck.name;
        renderDeck();
        renderSavedDecks();
        status("Loaded " + deck.name + ".");
    }

    async function saveDeck() {
        const name = ui.name.value.trim();
        if (!name || name.length > 40) {
            status("Enter a deck name between 1 and 40 characters.", true);
            ui.name.focus();
            return;
        }
        if (!cards.length) {
            status("Add at least one card before saving.", true);
            return;
        }
        busy = true;
        ui.save.disabled = true;
        try {
            const payload = { name, cards };
            let result;
            if (currentDeckId) {
                result = await request("/api/account/decks/" + encodeURIComponent(currentDeckId), {
                    method: "PUT", body: payload
                });
            } else {
                result = await request("/api/account/decks", { method: "POST", body: payload });
                currentDeckId = result.deck.id;
            }
            await refreshDecks();
            ui.saved.value = currentDeckId;
            renderSavedDecks();
            status("Deck saved to your account.");
        } catch (error) {
            status(error.message || "Could not save deck.", true);
        } finally {
            busy = false;
            ui.save.disabled = false;
        }
    }

    async function deleteSelectedDeck() {
        if (!currentDeckId) {
            status("Load a saved deck before deleting it.", true);
            return;
        }
        const deck = decks.find(item => item.id === currentDeckId);
        if (!window.confirm("Delete " + (deck?.name || "this deck") + "?")) return;
        busy = true;
        ui.remove.disabled = true;
        try {
            await request("/api/account/decks/" + encodeURIComponent(currentDeckId), { method: "DELETE" });
            decks = decks.filter(item => item.id !== currentDeckId);
            currentDeckId = null;
            cards = [];
            ui.name.value = "";
            renderDeck();
            renderSavedDecks();
            status("Saved deck deleted.");
        } catch (error) {
            status(error.message || "Could not delete deck.", true);
            ui.remove.disabled = false;
        } finally {
            busy = false;
        }
    }

    async function initialize() {
        if (!api) {
            status("The Card Stuff Yes API is not configured for this page.", true);
            return;
        }
        ui.save.addEventListener("click", saveDeck);
        ui.load.addEventListener("click", loadSelectedDeck);
        ui.remove.addEventListener("click", deleteSelectedDeck);
        ui.newDeck.addEventListener("click", () => {
            currentDeckId = null;
            cards = [];
            ui.name.value = "";
            ui.saved.value = "";
            renderDeck();
            renderSavedDecks();
            status("Ready to build a new deck.");
        });
        try {
            const [catalogData] = await Promise.all([request("/api/cards"), refreshDecks()]);
            catalog = Array.isArray(catalogData.cards) ? catalogData.cards : [];
            renderCatalog();
            renderDeck();
            if (!catalog.length) status("The card catalog is empty.", true);
            else status("Loaded " + catalog.length + " catalog cards and " + decks.length + " saved decks.");
        } catch (error) {
            status(error.message || "Could not load the deck builder.", true);
            ui.catalog.textContent = "The card catalog could not be loaded.";
            ui.deck.textContent = "Sign in and reload to access saved decks.";
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
