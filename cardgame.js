"use strict";

/*
 * Card Stuff Yes — first playable battle prototype.
 *
 * This is a local, single-player playtest. It does not create
 * online matches or save authoritative game state on a server.
 * The rules here are provisional until the full battle rules
 * and backend endpoints are implemented.
 */

(function () {
    const MAX_HEALTH = 30;
    const MAX_ENERGY = 6;
    const MAX_HAND = 10;
    const STARTING_HAND = 5;

    const cardLibrary = [
        { id: "spark", name: "Astral Spark", type: "attack", cost: 1, value: 3, symbol: "✦", description: "A quick burst of astral energy.", effect: "Deal 3 damage." },
        { id: "flare", name: "Solar Flare", type: "attack", cost: 2, value: 6, symbol: "☀", description: "A concentrated blast of light.", effect: "Deal 6 damage." },
        { id: "void-lance", name: "Void Lance", type: "attack", cost: 3, value: 9, symbol: "➶", description: "Pierce through the rival's guard.", effect: "Deal 9 damage." },
        { id: "meteor", name: "Falling Meteor", type: "attack", cost: 4, value: 13, symbol: "☄", description: "A heavy strike from the sky.", effect: "Deal 13 damage." },
        { id: "nova", name: "Nova Burst", type: "attack", cost: 5, value: 18, symbol: "✹", description: "Spend big for a huge hit.", effect: "Deal 18 damage." },
        { id: "guard", name: "Astral Guard", type: "guard", cost: 1, value: 4, symbol: "⬡", description: "Shape energy into a shield.", effect: "Gain 4 shield." },
        { id: "wall", name: "Prism Wall", type: "guard", cost: 2, value: 8, symbol: "▥", description: "A sturdy protective barrier.", effect: "Gain 8 shield." },
        { id: "fortress", name: "Crystal Fortress", type: "guard", cost: 4, value: 14, symbol: "◈", description: "Brace for the rival's next turn.", effect: "Gain 14 shield." },
        { id: "mend", name: "Gentle Mend", type: "heal", cost: 1, value: 4, symbol: "✚", description: "Recover a little health.", effect: "Restore 4 health." },
        { id: "renew", name: "Renewal", type: "heal", cost: 3, value: 9, symbol: "❈", description: "Recover from a rough round.", effect: "Restore 9 health." },
        { id: "lifebloom", name: "Life Bloom", type: "heal", cost: 4, value: 13, symbol: "❋", description: "A powerful wave of restoration.", effect: "Restore 13 health." },
        { id: "insight", name: "Magik Insight", type: "draw", cost: 1, value: 2, symbol: "⌕", description: "Find two more options.", effect: "Draw 2 cards." },
        { id: "study", name: "Deep Study", type: "draw", cost: 2, value: 3, symbol: "⌘", description: "Look deeper into your deck.", effect: "Draw 3 cards." },
        { id: "blood-price", name: "Blood Price", type: "attack", cost: 2, value: 8, symbol: "♦", description: "A risky, forceful hit.", effect: "Deal 8 damage; lose 2 health.", selfDamage: 2 },
        { id: "dark-surge", name: "Dark Surge", type: "attack", cost: 3, value: 7, symbol: "◐", description: "A steady hit with extra impact.", effect: "Deal 7 damage and gain 3 shield.", selfShield: 3 }
    ];

    const elements = {
        status: document.getElementById("game-status"),
        playerHealth: document.getElementById("player-health-label"),
        playerHealthFill: document.getElementById("player-health-fill"),
        playerHealthBar: document.getElementById("player-health-bar"),
        opponentHealth: document.getElementById("opponent-health-label"),
        opponentHealthFill: document.getElementById("opponent-health-fill"),
        opponentHealthBar: document.getElementById("opponent-health-bar"),
        playerShield: document.getElementById("player-shield"),
        opponentShield: document.getElementById("opponent-shield"),
        playerDeckCount: document.getElementById("player-deck-count"),
        opponentDeckCount: document.getElementById("opponent-deck-count"),
        playerDiscardCount: document.getElementById("player-discard-count"),
        opponentHandCount: document.getElementById("opponent-hand-count"),
        playerEnergy: document.getElementById("player-energy"),
        energyPips: document.getElementById("energy-pips"),
        playerHand: document.getElementById("player-hand"),
        intent: document.getElementById("opponent-intent"),
        handHint: document.getElementById("hand-hint"),
        battleLog: document.getElementById("battle-log"),
        drawButton: document.getElementById("draw-button"),
        endTurnButton: document.getElementById("end-turn-button"),
        restartButton: document.getElementById("restart-button"),
        clearLogButton: document.getElementById("clear-log-button"),
        resultOverlay: document.getElementById("result-overlay"),
        resultTitle: document.getElementById("result-title"),
        resultMessage: document.getElementById("result-message"),
        playAgainButton: document.getElementById("play-again-button")
    };

    let state = null;
    let cardInstanceCounter = 0;
    let aiTimer = null;

    function cloneCard(definition) {
        cardInstanceCounter += 1;
        return {
            instanceId: "card-" + cardInstanceCounter,
            definition: definition
        };
    }

    function shuffled(items) {
        const result = items.slice();
        for (let i = result.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            const temporary = result[i];
            result[i] = result[j];
            result[j] = temporary;
        }
        return result;
    }

    function makeDeck() {
        const cards = [];
        cardLibrary.forEach(function (definition) {
            for (let copy = 0; copy < 4; copy += 1) {
                cards.push(cloneCard(definition));
            }
        });
        return shuffled(cards);
    }

    function createCombatant(name) {
        return {
            name: name,
            health: MAX_HEALTH,
            shield: 0,
            energy: 0,
            maxEnergy: 0,
            magik: 1,
            deck: makeDeck(),
            hand: [],
            discard: []
        };
    }

    function newMatch() {
        if (aiTimer !== null) {
            window.clearTimeout(aiTimer);
            aiTimer = null;
        }

        cardInstanceCounter = 0;
        state = {
            turn: 1,
            activeSide: "player",
            locked: false,
            finished: false,
            player: createCombatant("You"),
            opponent: createCombatant("Void Challenger"),
            log: []
        };

        for (let i = 0; i < STARTING_HAND; i += 1) {
            drawCards(state.player, 1, false);
            drawCards(state.opponent, 1, false);
        }

        beginPlayerTurn(false);
        addLog("The battle begins. You take the first turn.");
        setStatus("Your turn. Play cards, then end your turn.", "");
        render();
    }

    function drawCards(combatant, amount, logResult) {
        let drawn = 0;

        for (let i = 0; i < amount; i += 1) {
            if (combatant.hand.length >= MAX_HAND) {
                if (logResult) {
                    addLog(combatant.name + "'s hand is full; a card could not be drawn.");
                }
                break;
            }

            if (combatant.deck.length === 0) {
                if (combatant.discard.length === 0) {
                    if (logResult) {
                        addLog(combatant.name + " has no cards left to draw.");
                    }
                    break;
                }

                combatant.deck = shuffled(combatant.discard);
                combatant.discard = [];
                if (logResult) {
                    addLog(combatant.name + " shuffles their discard pile back into the deck.");
                }
            }

            combatant.hand.push(combatant.deck.pop());
            drawn += 1;
        }

        return drawn;
    }

    function beginPlayerTurn(drawOne) {
        if (state.finished) {
            return;
        }

        state.activeSide = "player";
        state.locked = false;
        state.player.shield = 0;
        state.player.maxEnergy = Math.min(MAX_ENERGY, state.turn);
        state.player.energy = state.player.maxEnergy;
        state.player.magik = 1;

        if (drawOne) {
            drawCards(state.player, 1, true);
            addLog("You draw 1 card.");
        }

        setStatus("Your turn. You have " + state.player.energy + " Astral Magik.", "");
        elements.intent.textContent = "Rival is preparing its next move.";
        render();
    }

    function setStatus(message, type) {
        elements.status.textContent = message;
        elements.status.className = "game-status";
        if (type) {
            elements.status.classList.add(type);
        }
    }

    function addLog(message) {
        if (!state) {
            return;
        }

        state.log.unshift(message);
        state.log = state.log.slice(0, 30);
        renderLog();
    }

    function damage(target, amount) {
        const blocked = Math.min(target.shield, amount);
        target.shield -= blocked;
        const remaining = amount - blocked;
        target.health = Math.max(0, target.health - remaining);
        return { blocked: blocked, healthDamage: remaining };
    }

    function heal(target, amount) {
        const before = target.health;
        target.health = Math.min(MAX_HEALTH, target.health + amount);
        return target.health - before;
    }

    function playCard(combatant, target, card, isPlayer) {
        const definition = card.definition;

        // The opponent turn is locked against player input, but the
        // AI must still be allowed to resolve its own cards.
        if (
            state.finished ||
            (state.locked && isPlayer) ||
            state.activeSide !== (isPlayer ? "player" : "opponent")
        ) {
            return false;
        }

        if (combatant.energy < definition.cost) {
            if (isPlayer) {
                setStatus("Not enough Astral Magik to play " + definition.name + ".", "error");
            }
            return false;
        }

        combatant.energy -= definition.cost;
        combatant.hand = combatant.hand.filter(function (item) {
            return item.instanceId !== card.instanceId;
        });
        combatant.discard.push(card);

        if (definition.type === "attack") {
            const result = damage(target, definition.value);
            let line = combatant.name + " plays " + definition.name + " for " + result.healthDamage + " health damage";
            if (result.blocked > 0) {
                line += " (" + result.blocked + " blocked)";
            }
            line += ".";
            addLog(line);
            if (definition.selfDamage) {
                const selfResult = damage(combatant, definition.selfDamage);
                addLog(combatant.name + " pays " + selfResult.healthDamage + " health for Blood Price.");
            }
            if (definition.selfShield) {
                combatant.shield += definition.selfShield;
                addLog(combatant.name + " gains " + definition.selfShield + " shield.");
            }
        } else if (definition.type === "guard") {
            combatant.shield += definition.value;
            addLog(combatant.name + " plays " + definition.name + " and gains " + definition.value + " shield.");
        } else if (definition.type === "heal") {
            const restored = heal(combatant, definition.value);
            addLog(combatant.name + " plays " + definition.name + " and restores " + restored + " health.");
        } else if (definition.type === "draw") {
            const drawn = drawCards(combatant, definition.value, false);
            addLog(combatant.name + " plays " + definition.name + " and draws " + drawn + " card(s).");
        }

        checkGameOver();
        render();
        return true;
    }

    function checkGameOver() {
        if (state.finished) {
            return true;
        }

        let result = null;
        if (state.player.health <= 0 && state.opponent.health <= 0) {
            result = "draw";
        } else if (state.opponent.health <= 0) {
            result = "win";
        } else if (state.player.health <= 0) {
            result = "loss";
        }

        if (!result) {
            return false;
        }

        state.finished = true;
        state.locked = true;
        if (aiTimer !== null) {
            window.clearTimeout(aiTimer);
            aiTimer = null;
        }

        if (result === "win") {
            elements.resultTitle.textContent = "Victory!";
            elements.resultMessage.textContent = "You defeated the Void Challenger. Great play!";
            setStatus("Victory! You won the match.", "success");
        } else if (result === "loss") {
            elements.resultTitle.textContent = "Defeat";
            elements.resultMessage.textContent = "The Void Challenger won this time. Try a different strategy.";
            setStatus("Match over. You were defeated.", "error");
        } else {
            elements.resultTitle.textContent = "Draw";
            elements.resultMessage.textContent = "Both challengers fell at the same time.";
            setStatus("Match over. It is a draw.", "");
        }

        elements.resultOverlay.hidden = false;
        elements.playAgainButton.focus();
        render();
        return true;
    }

    function endPlayerTurn() {
        if (state.finished || state.locked || state.activeSide !== "player") {
            return;
        }

        state.locked = true;
        state.activeSide = "opponent";
        state.opponent.shield = 0;
        setStatus("Void Challenger is taking its turn...", "");
        elements.intent.textContent = "The rival is choosing cards.";
        render();

        aiTimer = window.setTimeout(function () {
            aiTimer = null;
            try {
                runOpponentTurn();
            } catch (error) {
                state.locked = false;
                setStatus("The rival's turn hit an error. You can restart the match.", "error");
                if (typeof window.reportCsyGameplayError === "function") {
                    window.reportCsyGameplayError(error);
                }
            }
        }, 450);
    }

    function chooseAiCard() {
        const affordable = state.opponent.hand.filter(function (card) {
            return card.definition.cost <= state.opponent.energy;
        });

        if (!affordable.length) {
            return null;
        }

        affordable.sort(function (a, b) {
            const scoreA = aiCardScore(a.definition);
            const scoreB = aiCardScore(b.definition);
            return scoreB - scoreA;
        });

        const top = affordable.slice(0, Math.min(3, affordable.length));
        return top[Math.floor(Math.random() * top.length)];
    }

    function aiCardScore(card) {
        if (card.type === "attack") {
            return card.value + (state.player.health <= card.value ? 50 : 0);
        }
        if (card.type === "guard") {
            return state.opponent.health < 15 ? card.value + 4 : card.value * 0.4;
        }
        if (card.type === "heal") {
            return state.opponent.health < 20 ? card.value + (MAX_HEALTH - state.opponent.health) : 0;
        }
        if (card.type === "draw") {
            return state.opponent.hand.length < 3 ? 5 : 0;
        }
        return 0;
    }

    function runOpponentTurn() {
        if (state.finished) {
            return;
        }

        const opponent = state.opponent;
        opponent.maxEnergy = Math.min(MAX_ENERGY, state.turn);
        opponent.energy = opponent.maxEnergy;
        opponent.magik = 1;
        drawCards(opponent, 1, true);
        addLog("Void Challenger starts turn " + state.turn + " with " + opponent.energy + " Astral Magik.");

        let plays = 0;
        while (plays < 3 && !state.finished) {
            const card = chooseAiCard();
            if (!card) {
                break;
            }
            const score = aiCardScore(card.definition);
            if (score <= 0) {
                break;
            }
            if (!playCard(opponent, state.player, card, false)) {
                break;
            }
            plays += 1;
        }

        if (state.finished) {
            return;
        }

        const baseAttack = Math.min(4, 1 + Math.floor(state.turn / 2));
        const result = damage(state.player, baseAttack);
        let line = "Void Challenger strikes for " + result.healthDamage + " damage";
        if (result.blocked > 0) {
            line += " (" + result.blocked + " blocked)";
        }
        line += ".";
        addLog(line);

        if (checkGameOver()) {
            return;
        }

        state.turn += 1;
        beginPlayerTurn(true);
    }

    function renderHealth(combatant, label, fill, bar) {
        label.textContent = combatant.health + " / " + MAX_HEALTH;
        fill.style.width = ((combatant.health / MAX_HEALTH) * 100) + "%";
        bar.setAttribute("aria-valuenow", String(combatant.health));
    }

    function renderCombatants() {
        renderHealth(state.player, elements.playerHealth, elements.playerHealthFill, elements.playerHealthBar);
        renderHealth(state.opponent, elements.opponentHealth, elements.opponentHealthFill, elements.opponentHealthBar);
        elements.playerShield.textContent = String(state.player.shield);
        elements.opponentShield.textContent = String(state.opponent.shield);
        elements.playerDeckCount.textContent = String(state.player.deck.length);
        elements.opponentDeckCount.textContent = String(state.opponent.deck.length);
        elements.playerDiscardCount.textContent = String(state.player.discard.length);
        elements.opponentHandCount.textContent = String(state.opponent.hand.length);
        elements.playerEnergy.textContent = state.player.energy + " / " + state.player.maxEnergy;
        elements.energyPips.innerHTML = "";

        for (let i = 0; i < state.player.maxEnergy; i += 1) {
            const pip = document.createElement("span");
            pip.className = "energy-pip" + (i < state.player.energy ? " filled" : "");
            pip.setAttribute("aria-hidden", "true");
            elements.energyPips.appendChild(pip);
        }

        elements.drawButton.disabled =
            state.finished ||
            state.locked ||
            state.activeSide !== "player" ||
            state.player.magik < 1 ||
            state.player.deck.length === 0 && state.player.discard.length === 0 ||
            state.player.hand.length >= MAX_HAND;

        elements.endTurnButton.disabled =
            state.finished ||
            state.locked ||
            state.activeSide !== "player";

        elements.restartButton.disabled = false;
    }

    function renderHand() {
        elements.playerHand.innerHTML = "";

        if (!state.player.hand.length) {
            const empty = document.createElement("p");
            empty.className = "muted";
            empty.textContent = "Your hand is empty. Draw a card or end your turn.";
            elements.playerHand.appendChild(empty);
            return;
        }

        state.player.hand.forEach(function (card) {
            const definition = card.definition;
            const button = document.createElement("button");
            button.type = "button";
            button.className = "game-card";
            button.disabled =
                state.finished ||
                state.locked ||
                state.activeSide !== "player" ||
                state.player.energy < definition.cost;

            const cost = document.createElement("span");
            cost.className = "game-card-cost";
            cost.textContent = String(definition.cost);
            cost.setAttribute("aria-label", "Cost " + definition.cost);

            const symbol = document.createElement("span");
            symbol.className = "game-card-symbol";
            symbol.setAttribute("aria-hidden", "true");
            symbol.textContent = definition.symbol;

            const name = document.createElement("h3");
            name.className = "game-card-name";
            name.textContent = definition.name;

            const type = document.createElement("p");
            type.className = "game-card-type";
            type.textContent = definition.type;

            const description = document.createElement("p");
            description.className = "game-card-description";
            description.textContent = definition.description;

            const effect = document.createElement("p");
            effect.className = "game-card-effect";
            effect.textContent = definition.effect;

            button.appendChild(cost);
            button.appendChild(symbol);
            button.appendChild(name);
            button.appendChild(type);
            button.appendChild(description);
            button.appendChild(effect);

            button.addEventListener("click", function () {
                try {
                    if (playCard(state.player, state.opponent, card, true)) {
                        if (!state.finished) {
                            setStatus(definition.name + " played.", "success");
                        }
                    }
                } catch (error) {
                    setStatus("That card could not be played. You can restart the match.", "error");
                    if (typeof window.reportCsyGameplayError === "function") {
                        window.reportCsyGameplayError(error);
                    }
                }
            });

            elements.playerHand.appendChild(button);
        });

        elements.handHint.textContent =
            state.player.hand.length + " card(s) in hand. Cards cost Astral Magik to play.";
    }

    function renderLog() {
        if (!state) {
            return;
        }

        elements.battleLog.innerHTML = "";
        if (!state.log.length) {
            const item = document.createElement("li");
            item.textContent = "The battle log is empty.";
            elements.battleLog.appendChild(item);
            return;
        }

        state.log.slice(0, 12).forEach(function (entry) {
            const item = document.createElement("li");
            item.textContent = entry;
            elements.battleLog.appendChild(item);
        });
    }

    function render() {
        if (!state) {
            return;
        }
        renderCombatants();
        renderHand();
        renderLog();
    }

    function drawOneCard() {
        if (state.finished || state.locked || state.activeSide !== "player") {
            return;
        }

        if (state.player.magik < 1) {
            setStatus("You need 1 Magik to draw a card.", "error");
            return;
        }

        state.player.magik -= 1;
        const drawn = drawCards(state.player, 1, true);
        if (drawn) {
            addLog("You spend 1 Magik to draw a card.");
            setStatus("You drew a card.", "success");
        } else {
            setStatus("No card could be drawn.", "error");
        }
        render();
    }

    function clearLog() {
        state.log = [];
        renderLog();
    }

    elements.drawButton.addEventListener("click", drawOneCard);
    elements.endTurnButton.addEventListener("click", endPlayerTurn);
    elements.restartButton.addEventListener("click", newMatch);
    elements.playAgainButton.addEventListener("click", function () {
        elements.resultOverlay.hidden = true;
        newMatch();
    });
    elements.clearLogButton.addEventListener("click", clearLog);

    newMatch();
})();
