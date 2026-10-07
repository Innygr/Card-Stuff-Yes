```javascript
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

        }

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

        abilities:
            temporaryCard.abilities || []

    };

}


/* ============================================================
   ABILITIES
   ============================================================ */

function renderAbilities(abilities) {

    abilityList.innerHTML = "";


    abilities.forEach(
        (ability, index) => {

            const entry =
                document.createElement("div");

            entry.className =
                "ability-entry";


            const header =
                document.createElement("div");

            header.className =
                "ability-header";


            const title =
                document.createElement("h4");

            title.textContent =
                ability.name ||
                `Ability ${index + 1}`;


            const remove =
                document.createElement("button");

            remove.type =
                "button";

            remove.textContent =
                "Remove";

            remove.addEventListener(
                "click",
                () => {

                    const card =
                        JSON.parse(
                            cardForm.dataset
                                .temporaryCard
                        );

                    card.abilities.splice(
                        index,
                        1
                    );

                    cardForm.dataset
                        .temporaryCard =
                        JSON.stringify(card);

                    renderAbilities(
                        card.abilities
                    );

                }
            );


            header.append(
                title,
                remove
            );


            const grid =
                document.createElement("div");

            grid.className =
                "form-grid";


            const nameLabel =
                document.createElement("label");

            nameLabel.innerHTML =
                `
                    Ability Name
                    <input
                        type="text"
                        value=""
                    >
                `;


            const descriptionLabel =
                document.createElement("label");

            descriptionLabel.innerHTML =
                `
                    Description
                    <input
                        type="text"
                        value=""
                    >
                `;


            grid.append(
                nameLabel,
                descriptionLabel
            );


            const costs =
                document.createElement("div");

            costs.className =
                "form-grid";


            [
                ["magik", "Magik"],
                ["astralMagik", "Astral Magik"],
                ["gildedMagik", "Gilded Magik"],
                ["bloodMagik", "Blood Magik"],
                ["darkMagik", "Dark Magik"]
            ].forEach(
                ([key, label]) => {

                    const costLabel =
                        document.createElement("label");

                    costLabel.innerHTML =
                        `
                            ${label}
                            <input
                                type="number"
                                min="0"
                                value="${
                                    ability.costs[key] || 0
                                }"
                            >
                        `;

                    costs.appendChild(
                        costLabel
                    );

                }
            );


            const nameInput =
                nameLabel.querySelector("input");

            const descriptionInput =
                descriptionLabel.querySelector("input");

            nameInput.value =
                ability.name;

            descriptionInput.value =
                ability.description;


            nameInput.addEventListener(
                "input",
                () => {

                    const card =
                        JSON.parse(
                            cardForm.dataset
                                .temporaryCard
                        );

                    card.abilities[index].name =
                        nameInput.value;

                    cardForm.dataset
                        .temporaryCard =
                        JSON.stringify(card);

                    title.textContent =
                        nameInput.value ||
                        `Ability ${index + 1}`;

                }
            );


            descriptionInput.addEventListener(
                "input",
                () => {

                    const card =
                        JSON.parse(
                            cardForm.dataset
                                .temporaryCard
                        );

                    card.abilities[index]
                        .description =
                        descriptionInput.value;

                    cardForm.dataset
                        .temporaryCard =
                        JSON.stringify(card);

                }
            );


            const costInputs =
                costs.querySelectorAll(
                    "input"
                );


            costInputs.forEach(
                (input, costIndex) => {

                    input.addEventListener(
                        "input",
                        () => {

                            const keys = [
                                "magik",
                                "astralMagik",
                                "gildedMagik",
                                "bloodMagik",
                                "darkMagik"
                            ];

                            const card =
                                JSON.parse(
                                    cardForm.dataset
                                        .temporaryCard
                                );

                            card.abilities[index]
                                .costs[keys[costIndex]] =
                                Number(input.value) || 0;

                            cardForm.dataset
                                .temporaryCard =
                                JSON.stringify(card);

                        }
                    );

                }
            );


            entry.append(
                header,
                grid,
                costs
            );


            abilityList.appendChild(
                entry
            );

        }
    );

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


    if (!/^[a-zA-Z0-9_-]+$/.test(card.id)) {
        return (
            "Card ID may only contain letters, numbers, " +
            "underscores, and hyphens."
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


            if (
                !Array.isArray(
                    imported.cards
                )
            ) {
                throw new Error(
                    "Set must contain a cards array."
                );
            }


            state.set = {

                id:
                    String(
                        imported.id || ""
                    ),

                name:
                    String(
                        imported.name || ""
                    ),

                version:
                    String(
                        imported.version ||
                        "1.0.0"
                    ),

                status:
                    imported.status ||
                    "development",

                cards:
                    imported.cards

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
                "Set imported successfully.",
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
```
