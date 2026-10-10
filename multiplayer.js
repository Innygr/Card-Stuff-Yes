"use strict";

(function () {
    const $ = id => document.getElementById(id);
    const ui = {
        status: $("online-status"),
        badge: $("connection-badge"),
        guestLabel: $("guest-label"),
        name: $("player-name"),
        nameForm: $("name-form"),
        create: $("create-match-button"),
        refresh: $("refresh-lobby-button"),
        matches: $("matches-list"),
        joinCodeForm: $("join-code-form"),
        joinCode: $("join-code"),
        lobby: $("lobby-panel"),
        waiting: $("waiting-panel"),
        waitingCode: $("waiting-match-code"),
        copyCode: $("copy-code-button"),
        cancelWait: $("cancel-wait-button"),
        battle: $("battle-panel"),
        activeCode: $("active-match-code"),
        turnHeading: $("turn-heading"),
        leave: $("leave-match-button"),
        opponentName: $("opponent-name"),
        opponentHealth: $("opponent-health"),
        opponentHealthFill: $("opponent-health-fill"),
        opponentShield: $("opponent-shield"),
        opponentDeck: $("opponent-deck"),
        opponentHand: $("opponent-hand"),
        youName: $("you-name"),
        youHealth: $("you-health"),
        youHealthFill: $("you-health-fill"),
        youShield: $("you-shield"),
        youDeck: $("you-deck"),
        youDiscard: $("you-discard"),
        youEnergy: $("you-energy"),
        hand: $("online-hand"),
        draw: $("online-draw-button"),
        endTurn: $("online-end-turn-button"),
        log: $("online-log"),
        result: $("result-panel"),
        resultHeading: $("result-heading"),
        resultMessage: $("result-message"),
        returnLobby: $("return-lobby-button")
    };

    let currentPlayer = null;
    let currentMatch = null;
    let pollTimer = null;
    let polling = false;
    let requestBusy = false;

    async function request(url, options) {
        const response = await fetch(url, {
            credentials: "same-origin",
            cache: "no-store",
            ...options
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Request failed (" + response.status + ").");
        return data;
    }

    function setStatus(message, type) {
        ui.status.textContent = message;
        ui.status.className = "status-message" + (type ? " " + type : "");
    }

    function setConnection(online) {
        ui.badge.textContent = online ? "Server connected" : "Server unavailable";
        ui.badge.className = "connection-badge " + (online ? "online" : "offline");
    }

    function stopPolling() {
        if (pollTimer !== null) window.clearInterval(pollTimer);
        pollTimer = null;
    }

    async function showLobby() {
        const previousMatch = currentMatch;
        if (previousMatch && previousMatch.status === "active" && !window.confirm("Leave this active match? It will count as a forfeit.")) {
            return;
        }
        stopPolling();
        if (previousMatch && previousMatch.status !== "finished") {
            try {
                await request("/api/multiplayer/matches/" + encodeURIComponent(previousMatch.id) + "/leave", { method: "POST" });
            } catch (error) {
                // The match may already have finished or expired.
            }
        }
        currentMatch = null;
        ui.lobby.hidden = false;
        ui.waiting.hidden = true;
        ui.battle.hidden = true;
        ui.result.hidden = true;
        await refreshLobby();
    }

    function showWaiting(match) {
        ui.lobby.hidden = true;
        ui.waiting.hidden = false;
        ui.battle.hidden = true;
        ui.result.hidden = true;
        ui.waitingCode.textContent = match.id;
        currentMatch = match;
        startPolling();
    }

    function showBattle(match) {
        ui.lobby.hidden = true;
        ui.waiting.hidden = true;
        ui.battle.hidden = false;
        ui.result.hidden = true;
        ui.activeCode.textContent = match.id;
        currentMatch = match;
        renderMatch(match);
        startPolling();
    }

    function startPolling() {
        stopPolling();
        pollTimer = window.setInterval(pollMatch, 1800);
    }

    function showFinished(match) {
        currentMatch = match;
        stopPolling();
        ui.battle.hidden = false;
        ui.lobby.hidden = true;
        ui.waiting.hidden = true;
        ui.result.hidden = false;
        renderMatch(match);
        const won = match.result === currentPlayer.id;
        ui.resultHeading.textContent = match.result === "draw" ? "Draw" : won ? "Victory!" : "Defeat";
        ui.resultMessage.textContent = match.result === "draw" ? "Both players fell at the same time." : won ? "You won the online match!" : "Your opponent won this match.";
        setStatus("Match complete.", won ? "success" : "");
    }

    async function pollMatch() {
        if (!currentMatch || polling || requestBusy) return;
        polling = true;
        try {
            const data = await request("/api/multiplayer/matches/" + encodeURIComponent(currentMatch.id));
            const match = data.match;
            setConnection(true);
            if (match.status === "waiting") {
                currentMatch = match;
                ui.waitingCode.textContent = match.id;
                setStatus("Waiting for an opponent to join. Share the match code.", "");
            } else if (match.status === "active") {
                showBattle(match);
                if (match.activePlayerId === currentPlayer.id) setStatus("Your turn. Play cards, then end your turn.", "");
                else setStatus(match.opponent.name + " is taking their turn.", "");
            } else {
                showFinished(match);
            }
        } catch (error) {
            setConnection(false);
            setStatus("Connection interrupted: " + error.message + " Retrying…", "error");
        } finally {
            polling = false;
        }
    }

    async function loadMe() {
        const data = await request("/api/multiplayer/me");
        currentPlayer = data.player;
        ui.name.value = currentPlayer.name;
        ui.guestLabel.textContent = currentPlayer.name;
    }

    async function refreshLobby() {
        ui.matches.innerHTML = "";
        const loading = document.createElement("p");
        loading.className = "muted";
        loading.textContent = "Looking for open matches…";
        ui.matches.appendChild(loading);
        try {
            const data = await request("/api/multiplayer/matches");
            ui.matches.innerHTML = "";
            if (!data.matches.length) {
                const empty = document.createElement("p");
                empty.className = "muted";
                empty.textContent = "No open matches right now. Create one and invite a friend.";
                ui.matches.appendChild(empty);
                return;
            }
            data.matches.forEach(match => {
                const row = document.createElement("div");
                row.className = "match-row";
                const info = document.createElement("div");
                const host = document.createElement("strong");
                host.textContent = match.hostName + "'s match";
                const code = document.createElement("small");
                code.textContent = "Code " + match.id;
                info.append(host, code);
                const join = document.createElement("button");
                join.type = "button";
                join.className = "button primary-button";
                join.textContent = "Join match";
                join.addEventListener("click", () => joinMatch(match.id));
                row.append(info, join);
                ui.matches.appendChild(row);
            });
        } catch (error) {
            ui.matches.innerHTML = "";
            const message = document.createElement("p");
            message.className = "muted";
            message.textContent = error.message;
            ui.matches.appendChild(message);
        }
    }

    async function createMatch() {
        ui.create.disabled = true;
        try {
            const data = await request("/api/multiplayer/matches", { method: "POST" });
            setStatus("Match created. Waiting for a second player.", "success");
            showWaiting(data.match);
        } catch (error) {
            setStatus(error.message, "error");
        } finally {
            ui.create.disabled = false;
        }
    }

    async function joinMatch(id) {
        setStatus("Joining match…", "");
        try {
            const data = await request("/api/multiplayer/matches/" + encodeURIComponent(id) + "/join", { method: "POST" });
            setStatus("Match started. Your turn will be shown below.", "success");
            showBattle(data.match);
        } catch (error) {
            setStatus(error.message, "error");
            refreshLobby();
        }
    }

    async function submitAction(type, instanceId) {
        if (!currentMatch || requestBusy) return;
        requestBusy = true;
        setControlsDisabled(true);
        try {
            const data = await request("/api/multiplayer/matches/" + encodeURIComponent(currentMatch.id) + "/action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type, instanceId })
            });
            currentMatch = data.match;
            renderMatch(currentMatch);
            if (currentMatch.status === "finished") {
                showFinished(currentMatch);
            } else if (currentMatch.activePlayerId === currentPlayer.id) {
                setStatus("Action accepted. Keep playing or end your turn.", "success");
            } else {
                setStatus("Turn ended. Waiting for your opponent.", "");
            }
        } catch (error) {
            setStatus(error.message, "error");
            await pollMatch();
        } finally {
            requestBusy = false;
            setControlsDisabled(false);
        }
    }

    function setControlsDisabled(disabled) {
        ui.draw.disabled = disabled || !canAct() || !currentMatch.you.magik;
        ui.endTurn.disabled = disabled || !canAct();
        ui.hand.querySelectorAll("button").forEach(button => {
            button.disabled = disabled || !canAct() || button.dataset.affordable !== "true";
        });
    }

    function canAct() {
        return Boolean(currentMatch && currentMatch.status === "active" && currentMatch.activePlayerId === currentPlayer.id);
    }

    function renderHealth(label, fill, health) {
        label.textContent = health.health + " / 30";
        fill.style.width = Math.max(0, Math.min(100, health.health / 30 * 100)) + "%";
    }

    function renderMatch(match) {
        currentMatch = match;
        ui.activeCode.textContent = match.id;
        ui.youName.textContent = match.you.name;
        ui.opponentName.textContent = match.opponent ? match.opponent.name : "Waiting for opponent";
        renderHealth(ui.youHealth, ui.youHealthFill, match.you);
        if (match.opponent) renderHealth(ui.opponentHealth, ui.opponentHealthFill, match.opponent);
        ui.youShield.textContent = String(match.you.shield);
        ui.youDeck.textContent = String(match.you.deckCount);
        ui.youDiscard.textContent = String(match.you.discardCount);
        ui.youEnergy.textContent = match.you.energy + " / " + match.you.maxEnergy;
        ui.opponentShield.textContent = match.opponent ? String(match.opponent.shield) : "0";
        ui.opponentDeck.textContent = match.opponent ? String(match.opponent.deckCount) : "60";
        ui.opponentHand.textContent = match.opponent ? String(match.opponent.handCount) : "0";
        const isMyTurn = canAct();
        ui.turnHeading.textContent = match.status === "waiting" ? "Waiting for an opponent" : isMyTurn ? "Your turn" : match.status === "finished" ? "Match finished" : "Opponent's turn";
        ui.draw.disabled = !isMyTurn || !match.you.magik || requestBusy || match.you.handCount >= 10;
        ui.endTurn.disabled = !isMyTurn || requestBusy;
        renderHand(match.yourHand || [], isMyTurn);
        renderLog(match.log || []);
    }

    function renderHand(cards, isMyTurn) {
        ui.hand.innerHTML = "";
        if (!cards.length) {
            const empty = document.createElement("p");
            empty.className = "muted";
            empty.textContent = "No cards in hand.";
            ui.hand.appendChild(empty);
            return;
        }

        cards.forEach(card => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "online-card";
            const affordable = card.cost <= currentMatch.you.energy;
            button.dataset.affordable = String(affordable);
            button.disabled = !isMyTurn || !affordable || requestBusy;

            const cost = document.createElement("span");
            cost.className = "card-cost";
            cost.textContent = String(card.cost);
            const symbol = document.createElement("span");
            symbol.className = "card-symbol";
            symbol.textContent = card.symbol;
            symbol.setAttribute("aria-hidden", "true");
            const title = document.createElement("h3");
            title.textContent = card.name;
            const description = document.createElement("p");
            description.textContent = card.description;
            const effect = document.createElement("p");
            effect.className = "card-effect";
            effect.textContent = card.effect;
            button.append(cost, symbol, title, description, effect);
            button.addEventListener("click", () => submitAction("play_card", card.instanceId));
            ui.hand.appendChild(button);
        });
    }

    function renderLog(log) {
        ui.log.innerHTML = "";
        if (!log.length) {
            const item = document.createElement("li");
            item.textContent = "The match has just begun.";
            ui.log.appendChild(item);
            return;
        }
        log.slice(0, 20).forEach(entry => {
            const item = document.createElement("li");
            item.textContent = entry.message;
            ui.log.appendChild(item);
        });
    }

    ui.nameForm.addEventListener("submit", async event => {
        event.preventDefault();
        try {
            const data = await request("/api/multiplayer/name", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: ui.name.value })
            });
            currentPlayer = data.player;
            ui.guestLabel.textContent = currentPlayer.name;
            setStatus("Display name saved.", "success");
            await refreshLobby();
        } catch (error) {
            setStatus(error.message, "error");
        }
    });

    ui.create.addEventListener("click", createMatch);
    ui.joinCodeForm.addEventListener("submit", event => {
        event.preventDefault();
        const code = ui.joinCode.value.trim().toUpperCase();
        if (!code) return;
        joinMatch(code);
    });
    ui.refresh.addEventListener("click", refreshLobby);
    ui.draw.addEventListener("click", () => submitAction("draw"));
    ui.endTurn.addEventListener("click", () => submitAction("end_turn"));
    ui.leave.addEventListener("click", showLobby);
    ui.cancelWait.addEventListener("click", showLobby);
    ui.returnLobby.addEventListener("click", showLobby);

    ui.copyCode.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(ui.waitingCode.textContent);
            setStatus("Match code copied.", "success");
        } catch {
            setStatus("Your match code is " + ui.waitingCode.textContent + ". Copy it manually.", "");
        }
    });

    async function init() {
        try {
            await loadMe();
            setConnection(true);
            setStatus("Connected. Create a match or join an open one.", "success");
            await refreshLobby();
        } catch (error) {
            setConnection(false);
            setStatus("The multiplayer server is not reachable. Start the Node server and open this page from that server (not GitHub Pages). " + error.message, "error");
            ui.matches.innerHTML = "";
            const note = document.createElement("p");
            note.className = "muted";
            note.textContent = "Online play requires the Node server to be running.";
            ui.matches.appendChild(note);
        }
    }

    init();
})();
