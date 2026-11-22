/*
 * ============================================================
 * CARD STUFF YES
 * SET MANAGER
 * ============================================================
 *
 * Frontend foundation for creating card sets.
 *
 * This version:
 *
 * - Creates sets
 * - Creates cards
 * - Edits cards
 * - Deletes cards
 * - Adds multiple abilities
 * - Validates basic card data
 * - Imports JSON
 * - Exports JSON
 *
 * Server/database saving will be connected later.
 * ============================================================
 */


"use strict";


/* ============================================================
   STATE
   ============================================================ */

const state = {

    set: {

        id: "",

        name: "",

        version: "1.0.0",

        status: "development",

        cards: []

    },

    editingCardIndex: null

};


/* ============================================================
   DOM
   ============================================================ */

const setIdInput =
    document.getElementById("set-id");

const setNameInput =
    document.getElementById("set-name");

const setVersionInput =
    document.getElementById("set-version");

const setStatusInput =
    document.getElementById("set-status");

const cardList =
    document.getElementById("card-list");

const cardCount =
    document.getElementById("card-count");

const emptyMessage =
    document.getElementById("empty-message");

const addCardButton =
    document.getElementById("add-card-button");

const cardEditor =
    document.getElementById("card-editor");

const editorTitle =
    document.getElementById("editor-title");

const closeEditorButton =
    document.getElementById("close-editor");

const cancelCardButton =
    document.getElementById("cancel-card");

const cardForm =
    document.getElementById("card-form");

const importFile =
    document.getElementById("import-file");

const exportButton =
    document.getElementById("export-button");

const statusMessage =
    document.getElementById("status-message");

const abilityList =
    document.getElementById("ability-list");

const addAbilityButton =
    document.getElementById("add-ability-button");


/* ============================================================
   CARD EDITOR INPUTS
   ============================================================ */

const cardIdInput =
    document.getElementById("card-id");

const cardNameInput =
    document.getElementById("card-name");

const cardTypeInput =
    document.getElementById("card-type");

const cardRarityInput =
    document.getElementById("card-rarity");

const cardArtInput =
    document.getElementById("card-art");

const cardDescriptionInput =
    document.getElementById("card-description");

const cardHealthInput =
    document.getElementById("card-health");

const cardAttackInput =
    document.getElementById("card-attack");
const cardBattleTypeInput = document.getElementById("card-battle-type");
const cardResourceInput = document.getElementById("card-resource");
const cardCostInput = document.getElementById("card-cost");
const cardValueInput = document.getElementById("card-value");
const cardSymbolInput = document.getElementById("card-symbol");
const cardEffectInput = document.getElementById("card-effect");
const playableExportButton = document.getElementById("playable-export-button");
const publishCatalogueButton = document.getElementById("publish-catalogue-button");


/* ============================================================
   UTILITIES
   ============================================================ */

function createEmptyAbility() {

    return {

        id:
            `ability-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 7)}`,

        name: "",

        description: "",

        costs: {

            magik: 0,

            astralMagik: 0,

            gildedMagik: 0,

            bloodMagik: 0,

            darkMagik: 0

        },

        effects: []

    };

}


function createEmptyCard() {

    return {

        id: "",

        name: "",

        type: "normal",

        rarity: "common",

        art: "",

        description: "",

        health: 0,

        attack: 0,
        battleType: "attack",
        resource: "astral-magik",
        cost: 1,
        value: 1,
        symbol: "✦",
        effect: "",
        abilities: []

    };

}


function setStatus(message, type = "") {

    statusMessage.textContent =
        message;

    statusMessage.className =
        `status-message ${type}`.trim();

}


function updateSetFromInputs() {

    state.set.id =
        setIdInput.value.trim();

    state.set.name =
        setNameInput.value.trim();

    state.set.version =
        setVersionInput.value.trim();

    state.set.status =
        setStatusInput.value;

}


/* ============================================================
   RENDER CARDS
   ============================================================ */

function renderCards() {

    cardList.innerHTML = "";

    cardCount.textContent =
        `${state.set.cards.length} ${
            state.set.cards.length === 1
                ? "card"
                : "cards"
        }`;

    emptyMessage.style.display =
        state.set.cards.length === 0
            ? "block"
            : "none";


    state.set.cards.forEach(
        (card, index) => {

            const entry =
                document.createElement("article");

            entry.className =
                "card-entry";


            const header =
                document.createElement("div");

            header.className =
                "card-entry-header";


            const title =
                document.createElement("div");


            const name =
                document.createElement("h3");

            name.className =
                "card-entry-name";

            name.textContent =
                card.name || "Unnamed Card";


            const id =
                document.createElement("p");

            id.className =
                "card-entry-id";

            id.textContent =
                card.id || "No ID";


            title.append(
                name,
                id
            );


            header.appendChild(title);


            const meta =
                document.createElement("div");

            meta.className =
                "card-entry-meta";


            [
                card.type,
                card.rarity
            ].forEach(value => {

                const tag =
                    document.createElement("span");

                tag.className =
                    "card-tag";

                tag.textContent =
                    value;

                meta.appendChild(tag);

            });


            const abilityTag =
                document.createElement("span");

            abilityTag.className =
                "card-tag";

            abilityTag.textContent =
                `${card.abilities.length} abilities`;

            meta.appendChild(
                abilityTag
            );


            const actions =
                document.createElement("div");

            actions.className =
                "card-entry-actions";


            const editButton =
                document.createElement("button");

            editButton.type =
                "button";

            editButton.textContent =
                "Edit";

            editButton.addEventListener(
                "click",
                () => openCardEditor(index)
            );


            const deleteButton =
                document.createElement("button");

            deleteButton.type =
                "button";

            deleteButton.textContent =
                "Delete";

            deleteButton.addEventListener(
                "click",
                () => deleteCard(index)
            );


            actions.append(
                editButton,
                deleteButton
            );


            entry.append(
                header,
                meta,
                actions
            );


            cardList.appendChild(
                entry
            );

        }
    );

}


/* ============================================================
   CARD EDITOR
   ============================================================ */

function openCardEditor(index = null) {

    state.editingCardIndex =
        index;


    const card =
        index === null
            ? createEmptyCard()
            : structuredClone(
                state.set.cards[index]
            );


    editorTitle.textContent =
        index === null
            ? "Add Card"
            : "Edit Card";


    cardForm.dataset.temporaryCard =
        JSON.stringify(card);


    cardIdInput.value =
        card.id;

    cardNameInput.value =
        card.name;

    cardTypeInput.value =
        card.type;

    cardRarityInput.value =
        card.rarity;

    cardArtInput.value =
        card.art;

    cardDescriptionInput.value =
        card.description;

    cardHealthInput.value =
        card.health;

    cardAttackInput.value =
        card.attack;
    cardBattleTypeInput.value = card.battleType || "attack";
    cardResourceInput.value = card.resource || "astral-magik";
    cardCostInput.value = Number.isInteger(card.cost) ? card.cost : 1;
    cardValueInput.value = Number.isInteger(card.value) ? card.value : (card.attack || 1);
    cardSymbolInput.value = card.symbol || "✦";
    cardEffectInput.value = card.effect || "";


    renderAbilities(
        card.abilities
    );


    cardEditor.classList.remove(
        "hidden"
    );

}


function closeCardEditor() {

    state.editingCardIndex =
        null;

    cardForm.reset();

    cardEditor.classList.add(
        "hidden"
    );

}


function readEditorCard() {

    const temporaryCard =
        JSON.parse(
            cardForm.dataset.temporaryCard ||
            JSON.stringify(
                createEmptyCard()
            )
        );


    return {

        id:
            cardIdInput.value.trim(),

        name:
            cardNameInput.value.trim(),

        type:
            cardTypeInput.value,

        rarity:
            cardRarityInput.value,

        art:
            cardArtInput.value.trim(),

        description:
            cardDescriptionInput.value.trim(),

        health:
            Number(cardHealthInput.value) || 0,

        attack:
            Number(cardAttackInput.value) || 0,
        battleType: cardBattleTypeInput.value,
        resource: cardResourceInput.value,
        cost: Number(cardCostInput.value),
        value: Number(cardValueInput.value),
        symbol: cardSymbolInput.value.trim(),
        effect: cardEffectInput.value.trim(),

        abilities:
            (temporaryCard.abilities || []).map(ability => ({
                ...ability,
                costs: {
                    magik: 0,
                    astralMagik: 0,
                    gildedMagik: 0,
                    bloodMagik: 0,
                    darkMagik: 0,
                    ...(ability.costs || {})
                },
                effects: Array.isArray(ability.effects) ? ability.effects : []
            }))

    };

}


/* ============================================================
   ABILITIES
   ============================================================ */

function renderAbilities(abilities) {

    abilityList.innerHTML = "";

    const resourceCosts = [
        ["magik", "Magik"],
        ["astralMagik", "Astral Magik"],
        ["gildedMagik", "Gilded Magik"],
        ["bloodMagik", "Blood Magik"],
        ["darkMagik", "Dark Magik"]
    ];

    const effectTypes = [
        ["damage", "Damage"],
        ["shield", "Gain shield"],
        ["heal", "Restore health"],
        ["draw", "Draw cards"]
    ];

    abilities.forEach((ability, index) => {
        ability.costs = {
            magik: 0,
            astralMagik: 0,
            gildedMagik: 0,
            bloodMagik: 0,
            darkMagik: 0,
            ...(ability.costs || {})
        };
        if (!Array.isArray(ability.effects)) ability.effects = [];

        const entry = document.createElement("section");
        entry.className = "ability-entry";

        const header = document.createElement("div");
        header.className = "ability-header";

        const title = document.createElement("h4");
        title.textContent = ability.name || `Ability ${index + 1}`;

        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Remove ability";
        remove.addEventListener("click", () => {
            const card = JSON.parse(cardForm.dataset.temporaryCard);
            card.abilities.splice(index, 1);
            cardForm.dataset.temporaryCard = JSON.stringify(card);
            renderAbilities(card.abilities);
        });
        header.append(title, remove);

        const details = document.createElement("div");
        details.className = "form-grid";

        const nameLabel = document.createElement("label");
        nameLabel.append(document.createTextNode("Ability name"));
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.maxLength = 80;
        nameInput.value = ability.name || "";
        nameLabel.append(nameInput);

        const descriptionLabel = document.createElement("label");
        descriptionLabel.append(document.createTextNode("Description"));
        const descriptionInput = document.createElement("input");
        descriptionInput.type = "text";
        descriptionInput.maxLength = 240;
        descriptionInput.value = ability.description || "";
        descriptionLabel.append(descriptionInput);
        details.append(nameLabel, descriptionLabel);

        const costs = document.createElement("div");
        costs.className = "form-grid";
        resourceCosts.forEach(([key, label]) => {
            const costLabel = document.createElement("label");
            costLabel.append(document.createTextNode(label + " cost"));
            const input = document.createElement("input");
            input.type = "number";
            input.min = "0";
            input.max = "99";
            input.step = "1";
            input.value = ability.costs[key];
            input.addEventListener("input", () => updateAbility(index, current => {
                current.costs[key] = Math.max(0, Math.min(99, Math.floor(Number(input.value) || 0)));
            }));
            costLabel.append(input);
            costs.append(costLabel);
        });

        const effectsHeading = document.createElement("div");
        effectsHeading.className = "ability-header";
        const effectsTitle = document.createElement("h5");
        effectsTitle.textContent = "Effects (resolve in listed order)";
        const addEffectButton = document.createElement("button");
        addEffectButton.type = "button";
        addEffectButton.textContent = "+ Effect";
        addEffectButton.addEventListener("click", () => {
            updateAbility(index, current => {
                current.effects.push({ type: "damage", target: "opponent", value: 1 });
            });
            renderAbilities(JSON.parse(cardForm.dataset.temporaryCard).abilities);
        });
        effectsHeading.append(effectsTitle, addEffectButton);

        const effectsList = document.createElement("div");
        effectsList.className = "ability-effects";
        ability.effects.forEach((effect, effectIndex) => {
            const effectRow = document.createElement("div");
            effectRow.className = "ability-effect-row";

            const typeLabel = document.createElement("label");
            typeLabel.append(document.createTextNode("Effect"));
            const typeSelect = document.createElement("select");
            effectTypes.forEach(([value, label]) => {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label;
                typeSelect.append(option);
            });
            typeSelect.value = effectTypes.some(([value]) => value === effect.type) ? effect.type : "damage";
            typeSelect.addEventListener("change", () => updateEffect(index, effectIndex, current => { current.type = typeSelect.value; }));
            typeLabel.append(typeSelect);

            const targetLabel = document.createElement("label");
            targetLabel.append(document.createTextNode("Target"));
            const targetSelect = document.createElement("select");
            [["self", "You"], ["opponent", "Opponent"]].forEach(([value, label]) => {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label;
                targetSelect.append(option);
            });
            targetSelect.value = effect.target === "self" ? "self" : "opponent";
            targetSelect.addEventListener("change", () => updateEffect(index, effectIndex, current => { current.target = targetSelect.value; }));
            targetLabel.append(targetSelect);

            const valueLabel = document.createElement("label");
            valueLabel.append(document.createTextNode("Amount"));
            const valueInput = document.createElement("input");
            valueInput.type = "number";
            valueInput.min = "1";
            valueInput.max = "99";
            valueInput.step = "1";
            valueInput.value = Number.isInteger(effect.value) && effect.value > 0 ? effect.value : 1;
            valueInput.addEventListener("input", () => updateEffect(index, effectIndex, current => {
                current.value = Math.max(1, Math.min(99, Math.floor(Number(valueInput.value) || 1)));
            }));
            valueLabel.append(valueInput);

            const removeEffect = document.createElement("button");
            removeEffect.type = "button";
            removeEffect.textContent = "Remove effect";
            removeEffect.addEventListener("click", () => {
                updateAbility(index, current => { current.effects.splice(effectIndex, 1); });
                renderAbilities(JSON.parse(cardForm.dataset.temporaryCard).abilities);
            });

            effectRow.append(typeLabel, targetLabel, valueLabel, removeEffect);
            effectsList.append(effectRow);
        });

        nameInput.addEventListener("input", () => {
            updateAbility(index, current => { current.name = nameInput.value; });
            title.textContent = nameInput.value || `Ability ${index + 1}`;
        });
        descriptionInput.addEventListener("input", () => updateAbility(index, current => { current.description = descriptionInput.value; }));

        entry.append(header, details, costs, effectsHeading, effectsList);
        abilityList.append(entry);
    });
}

function updateAbility(index, updater) {
    const card = JSON.parse(cardForm.dataset.temporaryCard || "{}");
    if (!card.abilities || !card.abilities[index]) return;
    const ability = card.abilities[index];
    ability.costs = {
        magik: 0, astralMagik: 0, gildedMagik: 0, bloodMagik: 0, darkMagik: 0,
        ...(ability.costs || {})
    };
    if (!Array.isArray(ability.effects)) ability.effects = [];
    updater(ability);
    cardForm.dataset.temporaryCard = JSON.stringify(card);
}

function updateEffect(abilityIndex, effectIndex, updater) {
    updateAbility(abilityIndex, ability => {
        if (ability.effects && ability.effects[effectIndex]) updater(ability.effects[effectIndex]);
    });
}

function addAbility() {

    const card =
        JSON.parse(
            cardForm.dataset.temporaryCard ||
            JSON.stringify(
                createEmptyCard()
            )
        );


    card.abilities.push(
        createEmptyAbility()
    );


    cardForm.dataset.temporaryCard =
        JSON.stringify(card);


    renderAbilities(
        card.abilities
    );

}


/* ============================================================
   VALIDATION
   ============================================================ */

function validateCard(card) {

    if (!card.id) {
        return "Card ID is required.";
    }


    if (!/^[a-z0-9-]+$/.test(card.id)) {
        return (
            "Card ID must use lowercase letters, numbers, and hyphens, matching the game catalogue."
        );
    }


    if (!card.name) {
        return "Card name is required.";
    }


    if (
        !Number.isInteger(card.health) ||
        card.health < 0
    ) {
        return "Health must be a non-negative whole number.";
    }


    if (
        !Number.isInteger(card.attack) ||
        card.attack < 0
    ) {
        return "Attack must be a non-negative whole number.";
    }

    if (!["attack", "guard", "heal", "draw"].includes(card.battleType)) return "Choose a supported battle type.";
    if (!["magik", "astral-magik", "gilded-magik", "blood-magik", "dark-magik"].includes(card.resource)) return "Choose a supported Magik resource.";
    if (!Number.isInteger(card.cost) || card.cost < 0 || card.cost > 99) return "Battle cost must be a whole number from 0 to 99.";
    if (!Number.isInteger(card.value) || card.value < 0 || card.value > 99) return "Battle value must be a whole number from 0 to 99.";
    if (!card.symbol || card.symbol.length > 12) return "A symbol of 1–12 characters is required.";
    for (const ability of card.abilities || []) {
        if (!ability.name || !ability.name.trim()) return "Every ability needs a name.";
        for (const [resource, cost] of Object.entries(ability.costs || {})) {
            if (!["magik", "astralMagik", "gildedMagik", "bloodMagik", "darkMagik"].includes(resource) ||
                !Number.isInteger(cost) || cost < 0 || cost > 99) {
                return "Ability resource costs must be whole numbers from 0 to 99.";
            }
        }
        for (const effect of ability.effects || []) {
            if (!["damage", "shield", "heal", "draw"].includes(effect.type) ||
                !["self", "opponent"].includes(effect.target) ||
                !Number.isInteger(effect.value) || effect.value < 1 || effect.value > 99) {
                return "Ability effects need a supported type, target, and amount from 1 to 99.";
            }
        }
    }

    return null;

}


/* ============================================================
   SAVE CARD
   ============================================================ */

cardForm.addEventListener(
    "submit",
    event => {

        event.preventDefault();


        const card =
            readEditorCard();


        const validationError =
            validateCard(card);


        if (validationError) {

            setStatus(
                validationError,
                "error"
            );

            return;

        }


        const duplicate =
            state.set.cards.findIndex(
                (existing, index) =>
                    existing.id === card.id &&
                    index !==
                    state.editingCardIndex
            );


        if (duplicate !== -1) {

            setStatus(
                "A card with that ID already exists.",
                "error"
            );

            return;

        }


        if (
            state.editingCardIndex === null
        ) {

            state.set.cards.push(
                card
            );

        } else {

            state.set.cards[
                state.editingCardIndex
            ] = card;

        }


        renderCards();

        closeCardEditor();

        setStatus(
            "Card saved.",
            "success"
        );

    }
);


/* ============================================================
   DELETE CARD
   ============================================================ */

function deleteCard(index) {

    const card =
        state.set.cards[index];


    if (
        !confirm(
            `Delete "${card.name || card.id}"?`
        )
    ) {
        return;
    }


    state.set.cards.splice(
        index,
        1
    );


    renderCards();

    setStatus(
        "Card deleted.",
        "success"
    );

}


/* ============================================================
   SET INPUTS
   ============================================================ */

[
    setIdInput,
    setNameInput,
    setVersionInput,
    setStatusInput
].forEach(
    input => {

        input.addEventListener(
            "input",
            updateSetFromInputs
        );

        input.addEventListener(
            "change",
            updateSetFromInputs
        );

    }
);


/* ============================================================
   IMPORT
   ============================================================ */

importFile.addEventListener(
    "change",
    async () => {

        const file =
            importFile.files[0];

        if (!file) {
            return;
        }


        try {

            const text =
                await file.text();

            const imported =
                JSON.parse(text);


            if (
                !imported ||
                typeof imported !== "object"
            ) {
                throw new Error(
                    "Invalid set file."
                );
            }


            const importedCards = Array.isArray(imported) ? imported : imported.cards;
            if (!Array.isArray(importedCards)) throw new Error("Import must be a Set Manager file or playable cards.json catalogue.");
            const importingPlayableCatalog = Array.isArray(imported);
            const normalizedCards = importedCards.map(card => importingPlayableCatalog ? ({
                ...card, type: card.setType || "normal", rarity: card.rarity || "common",
                art: card.art || "", health: Number(card.health) || 0, attack: Number(card.attack) || 0,
                battleType: card.type, resource: card.resource || "astral-magik",
                cost: Number.isInteger(card.cost) ? card.cost : 0,
                value: Number.isInteger(card.value) ? card.value : 0,
                symbol: card.symbol || "✦", effect: card.effect || "",
                abilities: Array.isArray(card.abilities) ? card.abilities : []
            }) : ({
                ...card, battleType: card.battleType || "attack",
                resource: card.resource || "astral-magik",
                cost: Number.isInteger(card.cost) ? card.cost : 1,
                value: Number.isInteger(card.value) ? card.value : (Number(card.attack) || 1),
                symbol: card.symbol || "✦", effect: card.effect || "",
                abilities: Array.isArray(card.abilities) ? card.abilities : []
            }));
            const ids = new Set();
            for (const card of normalizedCards) {
                if (!card || typeof card.id !== "string" || !card.id.trim() || ids.has(card.id)) throw new Error("Imported cards must have unique, non-empty IDs.");
                ids.add(card.id);
            }


            state.set = {

                id: String(Array.isArray(imported) ? "imported-catalog" : imported.id || ""),
                name: String(Array.isArray(imported) ? "Imported Playable Catalogue" : imported.name || ""),

                version:
                    String(
                        imported.version ||
                        "1.0.0"
                    ),

                status:
                    imported.status ||
                    "development",

                cards:
                    normalizedCards

            };


            setIdInput.value =
                state.set.id;

            setNameInput.value =
                state.set.name;

            setVersionInput.value =
                state.set.version;

            setStatusInput.value =
                state.set.status;


            renderCards();


            setStatus(
                importingPlayableCatalog ? "Playable catalogue imported. Existing card IDs are preserved." : "Set imported successfully.",
                "success"
            );

        } catch (error) {

            setStatus(
                `Import failed: ${error.message}`,
                "error"
            );

        }

        importFile.value = "";

    }
);


/* ============================================================
   EXPORT
   ============================================================ */

exportButton.addEventListener(
    "click",
    () => {

        updateSetFromInputs();


        if (!state.set.id) {

            setStatus(
                "Set ID is required before exporting.",
                "error"
            );

            return;

        }


        if (!state.set.name) {

            setStatus(
                "Set name is required before exporting.",
                "error"
            );

            return;

        }


        const json =
            JSON.stringify(
                state.set,
                null,
                4
            );


        const blob =
            new Blob(
                [json],
                {
                    type:
                        "application/json"
                }
            );


        const url =
            URL.createObjectURL(
                blob
            );


        const link =
            document.createElement("a");


        link.href =
            url;

        link.download =
            `${state.set.id}.json`;


        document.body.appendChild(
            link
        );

        link.click();

        link.remove();


        URL.revokeObjectURL(
            url
        );


        setStatus(
            "Set exported.",
            "success"
        );

    }
);


/* ============================================================
   PLAYABLE CATALOGUE EXPORT
   ============================================================ */

function buildPlayableCatalogue() {
    updateSetFromInputs();
    if (!state.set.cards.length) throw new Error("Add or import cards before exporting or publishing.");
    const ids = new Set();
    return state.set.cards.map(card => {
        const error = validateCard(card);
        if (error) throw new Error("Cannot use " + (card.name || card.id) + ": " + error);
        if (ids.has(card.id)) throw new Error("Duplicate card ID: " + card.id);
        ids.add(card.id);
        return {
            id: card.id, name: card.name, type: card.battleType, resource: card.resource,
            cost: card.cost, value: card.value, symbol: card.symbol, description: card.description,
            effect: card.effect, rarity: card.rarity, art: card.art, health: card.health,
            attack: card.attack, setType: card.type, setId: state.set.id || "custom-set", temporary: true,
            abilities: (card.abilities || []).map(ability => ({
                id: ability.id, name: ability.name, description: ability.description,
                costs: { magik: 0, astralMagik: 0, gildedMagik: 0, bloodMagik: 0, darkMagik: 0, ...(ability.costs || {}) },
                effects: (ability.effects || []).map(effect => ({ type: effect.type, target: effect.target, value: effect.value }))
            }))
        };
    });
}

playableExportButton.addEventListener("click", () => {
    try {
        const output = buildPlayableCatalogue();
        const blob = new Blob([JSON.stringify(output, null, 4)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url; link.download = "cards.json";
        document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
        setStatus("Playable cards.json exported. Import the existing catalogue first to preserve current cards.", "success");
    } catch (error) { setStatus(error.message, "error"); }
});

publishCatalogueButton.addEventListener("click", async () => {
    let cards;
    try { cards = buildPlayableCatalogue(); }
    catch (error) { setStatus(error.message, "error"); return; }
    if (!window.confirm("Publish " + cards.length + " cards to the live catalogue? This creates a new version and cannot remove existing card IDs.")) return;
    publishCatalogueButton.disabled = true;
    setStatus("Publishing catalogue…");
    try {
        const apiBase = String(window.CSY_CONFIG?.apiBaseUrl || "").replace(/\\/+$/, "");
        const response = await fetch(apiBase + "/api/admin/cards", {
            method: "PUT", credentials: "include",
            headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cards })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Catalogue publishing failed.");
        setStatus("Published catalogue version " + data.version + " (" + data.count + " cards).", "success");
    } catch (error) {
        setStatus(error.message + " Check that you are signed in with Owner permissions.", "error");
    } finally { publishCatalogueButton.disabled = false; }
});

/* ============================================================
   EVENTS
   ============================================================ */

addCardButton.addEventListener(
    "click",
    () => openCardEditor()
);


addAbilityButton.addEventListener(
    "click",
    addAbility
);


closeEditorButton.addEventListener(
    "click",
    closeCardEditor
);


cancelCardButton.addEventListener(
    "click",
    closeCardEditor
);


document.querySelector(
    "[data-close-editor]"
).addEventListener(
    "click",
    closeCardEditor
);


/* ============================================================
   INITIALIZE
   ============================================================ */

updateSetFromInputs();

renderCards();