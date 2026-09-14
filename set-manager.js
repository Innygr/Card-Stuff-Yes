```javascript
/*
 * ============================================================
 * Card Stuff Yes
 * Set Manager JavaScript
 * ============================================================
 *
 * This file controls the Set Manager page.
 *
 * The server remains authoritative.
 *
 * This file is responsible for:
 *
 * - Loading sets
 * - Loading cards
 * - Creating sets
 * - Updating sets
 * - Deleting sets
 * - Uploading set covers
 * - Creating cards
 * - Updating cards
 * - Deleting cards
 * - Uploading card artwork
 * - Managing multiple abilities
 * - Managing resource requirements
 * - Showing status messages
 *
 * The client NEVER decides whether an operation is allowed.
 *
 * The server checks Owner/Moderator permissions.
 *
 * ============================================================
 */


/* ============================================================
   API HELPERS
   ============================================================ */

/*
 * Send a request to the server API.
 *
 * Keeping this in one function makes it easier to change the
 * API behaviour later.
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

    try {

        data =
            await response.json();

    } catch {

        /*
         * Some requests may not return JSON.
         */

        data = null;
    }


    if (!response.ok) {

        const message =
            data &&
            data.error

                ? data.error

                : `Request failed (${response.status})`;


        throw new Error(message);
    }


    return data;
}


/*
 * Convert a JavaScript value into JSON text.
 *
 * This is primarily used for displaying ability effects.
 */
function prettyJSON(value) {

    return JSON.stringify(
        value,
        null,
        4
    );
}


/* ============================================================
   STATUS
   ============================================================ */

const statusMessage =
    document.getElementById(
        "status-message"
    );


function setStatus(
    message,
    type = "info"
) {

    if (!statusMessage) {
        return;
    }


    statusMessage.textContent =
        message;


    statusMessage.className =
        "status-message";


    if (type) {

        statusMessage.classList.add(
            type
        );
    }
}


/* ============================================================
   DOM REFERENCES
   ============================================================ */

const setForm =
    document.getElementById(
        "set-form"
    );


const cardForm =
    document.getElementById(
        "card-form"
    );


const setsList =
    document.getElementById(
        "sets-list"
    );


const cardsList =
    document.getElementById(
        "cards-list"
    );


const abilitiesList =
    document.getElementById(
        "abilities-list"
    );


const addAbilityButton =
    document.getElementById(
        "add-ability-button"
    );


const cancelSetButton =
    document.getElementById(
        "cancel-set-button"
    );


const cancelCardButton =
    document.getElementById(
        "cancel-card-button"
    );


/*
 * The current item being edited.
 *
 * null means that the form is creating something new.
 */
let editingSetId = null;

let editingCardId = null;


/* ============================================================
   SET FORM
   ============================================================ */

function resetSetForm() {

    editingSetId =
        null;


    if (!setForm) {
        return;
    }


    setForm.reset();


    /*
     * These IDs are optional depending on the exact HTML.
     * We only touch them when they exist.
     */

    const submitButton =
        document.getElementById(
            "set-submit-button"
        );


    if (submitButton) {

        submitButton.textContent =
            "Create Set";
    }


    const setFormTitle =
        document.getElementById(
            "set-form-title"
        );


    if (setFormTitle) {

        setFormTitle.textContent =
            "Create Set";
    }


    const coverPreview =
        document.getElementById(
            "set-cover-preview"
        );


    if (coverPreview) {

        coverPreview.removeAttribute(
            "src"
        );

        coverPreview.classList.add(
            "hidden"
        );
    }
}


/*
 * Read set metadata from the form.
 */
function getSetFormData() {

    const formData =
        new FormData(
            setForm
        );


    return {
        id:
            formData.get("id") ||
            undefined,

        displayName:
            String(
                formData.get(
                    "displayName"
                ) || ""
            ).trim(),

        releaseDate:
            String(
                formData.get(
                    "releaseDate"
                ) || ""
            ).trim(),

        releaseTime:
            String(
                formData.get(
                    "releaseTime"
                ) || ""
            ).trim()
    };
}


/*
 * Create or update a set.
 */
async function submitSetForm(
    event
) {

    event.preventDefault();


    try {

        setStatus(
            editingSetId
                ? "Updating set..."
                : "Creating set...",
            "info"
        );


        const data =
            getSetFormData();


        if (!data.displayName) {

            throw new Error(
                "A set display name is required."
            );
        }


        if (!data.releaseDate) {

            throw new Error(
                "A release date is required."
            );
        }


        if (!data.releaseTime) {

            throw new Error(
                "A release time is required."
            );
        }


        const method =
            editingSetId
                ? "PUT"
                : "POST";


        const url =
            editingSetId
                ? `/api/admin/sets/${encodeURIComponent(editingSetId)}`
                : "/api/admin/sets";


        await apiRequest(
            url,
            {
                method,

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify(data)
            }
        );


        /*
         * Cover uploads are handled separately because the cover
         * is a file rather than JSON.
         */

        const coverInput =
            document.getElementById(
                "set-cover"
            );


        if (
            coverInput &&
            coverInput.files &&
            coverInput.files.length > 0
        ) {

            /*
             * The set must exist before its cover can be uploaded.
             */

            const setId =
                editingSetId ||
                data.id;


            if (setId) {

                await uploadSetCover(
                    setId,
                    coverInput.files[0]
                );
            }
        }


        setStatus(
            editingSetId
                ? "Set updated successfully."
                : "Set created successfully.",
            "success"
        );


        resetSetForm();


        await loadSets();

    } catch (error) {

        console.error(error);

        setStatus(
            error.message,
            "error"
        );
    }
}


/* ============================================================
   SET COVER
   ============================================================ */

async function uploadSetCover(
    setId,
    file
) {

    const formData =
        new FormData();


    formData.append(
        "setId",
        setId
    );


    formData.append(
        "cover",
        file
    );


    await apiRequest(
        "/api/admin/sets/cover",
        {
            method: "POST",

            body: formData
        }
    );
}


/* ============================================================
   LOAD SETS
   ============================================================ */

async function loadSets() {

    if (!setsList) {
        return;
    }


    setsList.innerHTML =
        `<p class="manager-list-item-meta">
            Loading sets...
        </p>`;


    try {

        const result =
            await apiRequest(
                "/api/admin/sets"
            );


        const sets =
            Array.isArray(result)
                ? result
                : result.sets || [];


        renderSets(
            sets
        );

    } catch (error) {

        console.error(error);

        setsList.innerHTML =
            `<p class="manager-list-item-meta">
                Failed to load sets.
            </p>`;
    }
}


/*
 * Render the set list.
 */
function renderSets(
    sets
) {

    if (!sets.length) {

        setsList.innerHTML =
            `<p class="manager-list-item-meta">
                No sets have been created yet.
            </p>`;

        return;
    }


    setsList.innerHTML =
        "";


    for (const set of sets) {

        const item =
            document.createElement(
                "div"
            );


        item.className =
            "manager-list-item";


        const info =
            document.createElement(
                "div"
            );


        info.className =
            "manager-list-item-info";


        const title =
            document.createElement(
                "p"
            );


        title.className =
            "manager-list-item-title";


        title.textContent =
            `${set.id || ""} — ${set.displayName || "Unnamed Set"}`;


        const meta =
            document.createElement(
                "p"
            );


        meta.className =
            "manager-list-item-meta";


        meta.textContent =
            `Release: ${set.releaseDate || "?"} ${set.releaseTime || ""}`;


        info.appendChild(
            title
        );


        info.appendChild(
            meta
        );


        const actions =
            document.createElement(
                "div"
            );


        actions.className =
            "manager-list-item-actions";


        const editButton =
            document.createElement(
                "button"
            );


        editButton.textContent =
            "Edit";


        editButton.addEventListener(
            "click",
            () => editSet(set)
        );


        const deleteButton =
            document.createElement(
                "button"
            );


        deleteButton.textContent =
            "Delete";


        deleteButton.className =
            "button-danger";


        deleteButton.addEventListener(
            "click",
            () => deleteSet(set.id)
        );


        actions.appendChild(
            editButton
        );


        actions.appendChild(
            deleteButton
        );


        item.appendChild(
            info
        );


        item.appendChild(
            actions
        );


        setsList.appendChild(
            item
        );
    }
}


/* ============================================================
   EDIT SET
   ============================================================ */

function editSet(
    set
) {

    editingSetId =
        set.id;


    const fields = {
        id: set.id,
        displayName: set.displayName,
        releaseDate: set.releaseDate,
        releaseTime: set.releaseTime
    };


    for (
        const [
            name,
            value
        ] of Object.entries(fields)
    ) {

        const field =
            setForm.elements[name];


        if (field) {

            field.value =
                value || "";
        }
    }


    const submitButton =
        document.getElementById(
            "set-submit-button"
        );


    if (submitButton) {

        submitButton.textContent =
            "Update Set";
    }


    const setFormTitle =
        document.getElementById(
            "set-form-title"
        );


    if (setFormTitle) {

        setFormTitle.textContent =
            "Edit Set";
    }


    setForm.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


/* ============================================================
   DELETE SET
   ============================================================ */

async function deleteSet(
    setId
) {

    if (!setId) {
        return;
    }


    /*
     * The server will also enforce deletion rules.
     *
     * In particular, a set containing cards should not be deleted
     * unless the server allows it.
     */

    if (
        !window.confirm(
            `Delete set ${setId}?`
        )
    ) {

        return;
    }


    try {

        setStatus(
            "Deleting set...",
            "info"
        );


        await apiRequest(
            `/api/admin/sets/${encodeURIComponent(setId)}`,
            {
                method: "DELETE"
            }
        );


        setStatus(
            "Set deleted successfully.",
            "success"
        );


        if (
            editingSetId === setId
        ) {

            resetSetForm();
        }


        await loadSets();


    } catch (error) {

        console.error(error);

        setStatus(
            error.message,
            "error"
        );
    }
}


/* ============================================================
   CARD FORM
   ============================================================ */

function resetCardForm() {

    editingCardId =
        null;


    if (!cardForm) {
        return;
    }


    cardForm.reset();


    /*
     * Remove all dynamically created abilities.
     */

    if (abilitiesList) {

        abilitiesList.innerHTML =
            "";
    }


    /*
     * Every new card starts with one ability editor.
     */

    addAbilityEditor();


    const submitButton =
        document.getElementById(
            "card-submit-button"
        );


    if (submitButton) {

        submitButton.textContent =
            "Create Card";
    }


    const cardFormTitle =
        document.getElementById(
            "card-form-title"
        );


    if (cardFormTitle) {

        cardFormTitle.textContent =
            "Create Card";
    }


    const artworkPreview =
        document.getElementById(
            "card-artwork-preview"
        );


    if (artworkPreview) {

        artworkPreview.removeAttribute(
            "src"
        );

        artworkPreview.classList.add(
            "hidden"
        );
    }
}


/*
 * Convert a resource editor into a plain object.
 */
function readAbilityEditor(
    editor
) {

    const nameInput =
        editor.querySelector(
            ".ability-name"
        );


    const resourceRows =
        editor.querySelectorAll(
            ".resource-row"
        );


    const requiredResources = {};


    for (
        const row of resourceRows
    ) {

        const resourceNameInput =
            row.querySelector(
                ".resource-name"
            );


        const amountInput =
            row.querySelector(
                ".resource-amount"
            );


        const resourceName =
            String(
                resourceNameInput?.value ||
                ""
            ).trim();


        const amount =
            Number(
                amountInput?.value || 0
            );


        if (
            resourceName &&
            Number.isFinite(amount) &&
            amount > 0
        ) {

            requiredResources[
                resourceName
            ] =
                amount;
        }
    }


    const effectsInput =
        editor.querySelector(
            ".effects-json"
        );


    let effects = [];


    if (effectsInput) {

        const text =
            effectsInput.value.trim();


        if (text) {

            try {

                effects =
                    JSON.parse(text);

            } catch {

                throw new Error(
                    `Invalid effects JSON in ability "${nameInput?.value || "Unnamed Ability"}".`
                );
            }
        }
    }


    return {
        id:
            editor.dataset.abilityId ||
            `ability-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 7)}`,

        name:
            String(
                nameInput?.value ||
                ""
            ).trim(),

        requiredResources,

        effects
    };
}


/*
 * Read every ability from the card form.
 */
function readAbilities() {

    if (!abilitiesList) {
        return [];
    }


    const editors =
        abilitiesList.querySelectorAll(
            ".ability-editor"
        );


    return Array.from(
        editors,
        readAbilityEditor
    );
}


/*
 * Read card metadata.
 */
function getCardFormData() {

    const formData =
        new FormData(
            cardForm
        );


    const hp =
        Number(
            formData.get("hp")
        );


    const power =
        Number(
            formData.get("power")
        );


    const cardLimit =
        Number(
            formData.get("cardLimit")
        );


    return {
        id:
            formData.get("id") ||
            undefined,

        name:
            String(
                formData.get("name") ||
                ""
            ).trim(),

        setId:
            String(
                formData.get("setId") ||
                ""
            ).trim(),

        rarity:
            String(
                formData.get("rarity") ||
                ""
            ).trim(),

        hp:
            Number.isFinite(hp)
                ? hp
                : 0,

        power:
            Number.isFinite(power)
                ? power
                : 0,

        cardLimit:
            Number.isFinite(cardLimit)
                ? cardLimit
                : 4,

        isSpecialEventCard:
            formData.get(
                "isSpecialEventCard"
            ) === "on",

        abilities:
            readAbilities()
    };
}


/* ============================================================
   ABILITY EDITOR
   ============================================================ */

function addAbilityEditor(
    ability = null
) {

    if (!abilitiesList) {
        return;
    }


    const editor =
        document.createElement(
            "div"
        );


    editor.className =
        "ability-editor";


    editor.dataset.abilityId =
        ability?.id ||
        `ability-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 7)}`;


    const header =
        document.createElement(
            "div"
        );


    header.className =
        "ability-header";


    const title =
        document.createElement(
            "h3"
        );


    title.className =
        "ability-title";


    title.textContent =
        "Ability";


    const removeButton =
        document.createElement(
            "button"
        );


    removeButton.type =
        "button";


    removeButton.className =
        "ability-remove button-danger";


    removeButton.textContent =
        "Remove Ability";


    removeButton.addEventListener(
        "click",
        () => {

            editor.remove();

        }
    );


    header.appendChild(
        title
    );


    header.appendChild(
        removeButton
    );


    editor.appendChild(
        header
    );


    /*
     * Ability name.
     */

    const nameGroup =
        document.createElement(
            "div"
        );


    nameGroup.className =
        "form-group";


    const nameLabel =
        document.createElement(
            "label"
        );


    nameLabel.className =
        "form-label";


    nameLabel.textContent =
        "Ability Name";


    const nameInput =
        document.createElement(
            "input"
        );


    nameInput.type =
        "text";


    nameInput.className =
        "ability-name";


    nameInput.placeholder =
        "Example: Quick Strike";


    nameInput.value =
        ability?.name ||
        "";


    nameGroup.appendChild(
        nameLabel
    );


    nameGroup.appendChild(
        nameInput
    );


    editor.appendChild(
        nameGroup
    );


    /*
     * Resource requirements.
     *
     * Resources belong to the individual ability rather than
     * the entire card.
     */

    const resourceGroup =
        document.createElement(
            "div"
        );


    resourceGroup.className =
        "form-group";


    resourceGroup.style.marginTop =
        "16px";


    const resourceLabel =
        document.createElement(
            "label"
        );


    resourceLabel.className =
        "form-label";


    resourceLabel.textContent =
        "Required Resources";


    const resourceList =
        document.createElement(
            "div"
        );


    resourceList.className =
        "resource-list";


    const addResourceButton =
        document.createElement(
            "button"
        );


    addResourceButton.type =
        "button";


    addResourceButton.className =
        "button-secondary";


    addResourceButton.textContent =
        "Add Resource Requirement";


    addResourceButton.addEventListener(
        "click",
        () => {

            addResourceRow(
                resourceList
            );

        }
    );


    resourceGroup.appendChild(
        resourceLabel
    );


    resourceGroup.appendChild(
        resourceList
    );


    resourceGroup.appendChild(
        addResourceButton
    );


    editor.appendChild(
        resourceGroup
    );


    /*
     * Restore existing resources when editing a card.
     */

    const resources =
        ability?.requiredResources ||
        {};


    for (
        const [
            resourceName,
            amount
        ] of Object.entries(resources)
    ) {

        addResourceRow(
            resourceList,
            resourceName,
            amount
        );
    }


    /*
     * Effects JSON.
     */

    const effectsGroup =
        document.createElement(
            "div"
        );


    effectsGroup.className =
        "form-group";


    effectsGroup.style.marginTop =
        "16px";


    const effectsLabel =
        document.createElement(
            "label"
        );


    effectsLabel.className =
        "form-label";


    effectsLabel.textContent =
        "Effects JSON";


    const effectsHelp =
        document.createElement(
            "p"
        );


    effectsHelp.className =
        "form-help";


    effectsHelp.textContent =
        "The server/game rules interpret these effects.";


    const effectsInput =
        document.createElement(
            "textarea"
        );


    effectsInput.className =
        "effects-json";


    effectsInput.value =
        prettyJSON(
            ability?.effects ||
            []
        );


    effectsGroup.appendChild(
        effectsLabel
    );


    effectsGroup.appendChild(
        effectsHelp
    );


    effectsGroup.appendChild(
        effectsInput
    );


    editor.appendChild(
        effectsGroup
    );


    abilitiesList.appendChild(
        editor
    );
}


/*
 * Add one resource requirement row.
 */
function addResourceRow(
    resourceList,
    resourceName = "",
    amount = 1
) {

    const row =
        document.createElement(
            "div"
        );


    row.className =
        "resource-row";


    const nameInput =
        document.createElement(
            "input"
        );


    nameInput.type =
        "text";


    nameInput.className =
        "resource-name";


    nameInput.placeholder =
        "Resource name";


    nameInput.value =
        resourceName;


    const amountInput =
        document.createElement(
            "input"
        );


    amountInput.type =
        "number";


    amountInput.className =
        "resource-amount";


    amountInput.min =
        "1";


    amountInput.step =
        "1";


    amountInput.value =
        amount;


    const removeButton =
        document.createElement(
            "button"
        );


    removeButton.type =
        "button";


    removeButton.className =
        "resource-remove button-danger";


    removeButton.textContent =
        "Remove";


    removeButton.addEventListener(
        "click",
        () => {

            row.remove();

        }
    );


    row.appendChild(
        nameInput
    );


    row.appendChild(
        amountInput
    );


    row.appendChild(
        removeButton
    );


    resourceList.appendChild(
        row
    );
}


/* ============================================================
   CARD SUBMISSION
   ============================================================ */

async function submitCardForm(
    event
) {

    event.preventDefault();


    try {

        setStatus(
            editingCardId
                ? "Updating card..."
                : "Creating card...",
            "info"
        );


        const data =
            getCardFormData();


        if (!data.name) {

            throw new Error(
                "A card name is required."
            );
        }


        if (!data.setId) {

            throw new Error(
                "A set must be selected."
            );
        }


        if (!data.rarity) {

            throw new Error(
                "A card rarity is required."
            );
        }


        if (!data.abilities.length) {

            throw new Error(
                "A card must have at least one ability."
            );
        }


        for (
            const ability
            of data.abilities
        ) {

            if (!ability.name) {

                throw new Error(
                    "Every ability must have a name."
                );
            }
        }


        const method =
            editingCardId
                ? "PUT"
                : "POST";


        const url =
            editingCardId
                ? `/api/admin/cards/${encodeURIComponent(editingCardId)}`
                : "/api/admin/cards";


        const result =
            await apiRequest(
                url,
                {
                    method,

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(data)
                }
            );


        /*
         * Card artwork is uploaded after the metadata exists.
         */

        const artworkInput =
            document.getElementById(
                "card-artwork"
            );


        const createdCardId =
            editingCardId ||
            result?.card?.id ||
            result?.id ||
            data.id;


        if (
            artworkInput &&
            artworkInput.files &&
            artworkInput.files.length > 0 &&
            createdCardId
        ) {

            await uploadCardArtwork(
                createdCardId,
                artworkInput.files[0]
            );
        }


        setStatus(
            editingCardId
                ? "Card updated successfully."
                : "Card created successfully.",
            "success"
        );


        resetCardForm();


        await loadCards();

    } catch (error) {

        console.error(error);

        setStatus(
            error.message,
            "error"
        );
    }
}


/* ============================================================
   CARD ARTWORK
   ============================================================ */

async function uploadCardArtwork(
    cardId,
    file
) {

    const formData =
        new FormData();


    formData.append(
        "cardId",
        cardId
    );


    formData.append(
        "artwork",
        file
    );


    await apiRequest(
        "/api/admin/cards/upload",
        {
            method: "POST",

            body: formData
        }
    );
}


/* ============================================================
   LOAD CARDS
   ============================================================ */

async function loadCards() {

    if (!cardsList) {
        return;
    }


    cardsList.innerHTML =
        `<p class="manager-list-item-meta">
            Loading cards...
        </p>`;


    try {

        const result =
            await apiRequest(
                "/api/admin/cards"
            );


        const cards =
            Array.isArray(result)
                ? result
                : result.cards || [];


        renderCards(
            cards
        );

    } catch (error) {

        console.error(error);

        cardsList.innerHTML =
            `<p class="manager-list-item-meta">
                Failed to load cards.
            </p>`;
    }
}


/*
 * Render card list.
 */
function renderCards(
    cards
) {

    if (!cards.length) {

        cardsList.innerHTML =
            `<p class="manager-list-item-meta">
                No cards have been created yet.
            </p>`;

        return;
    }


    cardsList.innerHTML =
        "";


    for (
        const card
        of cards
    ) {

        const item =
            document.createElement(
                "div"
            );


        item.className =
            "manager-list-item";


        const info =
            document.createElement(
                "div"
            );


        info.className =
            "manager-list-item-info";


        const title =
            document.createElement(
                "p"
            );


        title.className =
            "manager-list-item-title";


        title.textContent =
            `${card.id || ""} — ${card.name || "Unnamed Card"}`;


        const meta =
            document.createElement(
                "p"
            );


        meta.className =
            "manager-list-item-meta";


        meta.textContent =
            `Set: ${card.setId || "?"} | Rarity: ${card.rarity || "?"} | HP: ${card.hp ?? 0} | Power: ${card.power ?? 0}`;


        info.appendChild(
            title
        );


        info.appendChild(
            meta
        );


        const actions =
            document.createElement(
                "div"
            );


        actions.className =
            "manager-list-item-actions";


        const editButton =
            document.createElement(
                "button"
            );


        editButton.textContent =
            "Edit";


        editButton.addEventListener(
            "click",
            () => editCard(card)
        );


        const deleteButton =
            document.createElement(
                "button"
            );


        deleteButton.textContent =
            "Delete";


        deleteButton.className =
            "button-danger";


        deleteButton.addEventListener(
            "click",
            () => deleteCard(card.id)
        );


        actions.appendChild(
            editButton
        );


        actions.appendChild(
            deleteButton
        );


        item.appendChild(
            info
        );


        item.appendChild(
            actions
        );


        cardsList.appendChild(
            item
        );
    }
}


/* ============================================================
   EDIT CARD
   ============================================================ */

function editCard(
    card
) {

    editingCardId =
        card.id;


    const fields = {
        id: card.id,
        name: card.name,
        setId: card.setId,
        rarity: card.rarity,
        hp: card.hp,
        power: card.power,
        cardLimit: card.cardLimit
    };


    for (
        const [
            name,
            value
        ] of Object.entries(fields)
    ) {

        const field =
            cardForm.elements[name];


        if (field) {

            field.value =
                value ?? "";
        }
    }


    const specialEventCheckbox =
        cardForm.elements[
            "isSpecialEventCard"
        ];


    if (specialEventCheckbox) {

        specialEventCheckbox.checked =
            Boolean(
                card.isSpecialEventCard
            );
    }


    /*
     * Replace the existing ability editors.
     */

    if (abilitiesList) {

        abilitiesList.innerHTML =
            "";


        const abilities =
            Array.isArray(
                card.abilities
            )
                ? card.abilities
                : [];


        for (
            const ability
            of abilities
        ) {

            addAbilityEditor(
                ability
            );
        }


        if (!abilities.length) {

            addAbilityEditor();
        }
    }


    const submitButton =
        document.getElementById(
            "card-submit-button"
        );


    if (submitButton) {

        submitButton.textContent =
            "Update Card";
    }


    const cardFormTitle =
        document.getElementById(
            "card-form-title"
        );


    if (cardFormTitle) {

        cardFormTitle.textContent =
            "Edit Card";
    }


    cardForm.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


/* ============================================================
   DELETE CARD
   ============================================================ */

async function deleteCard(
    cardId
) {

    if (!cardId) {
        return;
    }


    if (
        !window.confirm(
            `Delete card ${cardId}?`
        )
    ) {

        return;
    }


    try {

        setStatus(
            "Deleting card...",
            "info"
        );


        await apiRequest(
            `/api/admin/cards/${encodeURIComponent(cardId)}`,
            {
                method: "DELETE"
            }
        );


        setStatus(
            "Card deleted successfully.",
            "success"
        );


        if (
            editingCardId === cardId
        ) {

            resetCardForm();
        }


        await loadCards();


    } catch (error) {

        console.error(error);

        setStatus(
            error.message,
            "error"
        );
    }
}


/* ============================================================
   FORM EVENTS
   ============================================================ */

if (setForm) {

    setForm.addEventListener(
        "submit",
        submitSetForm
    );
}


if (cardForm) {

    cardForm.addEventListener(
        "submit",
        submitCardForm
    );
}


if (addAbilityButton) {

    addAbilityButton.addEventListener(
        "click",
        () => addAbilityEditor()
    );
}


if (cancelSetButton) {

    cancelSetButton.addEventListener(
        "click",
        resetSetForm
    );
}


if (cancelCardButton) {

    cancelCardButton.addEventListener(
        "click",
        resetCardForm
    );
}


/* ============================================================
   FILE PREVIEWS
   ============================================================ */

function setupImagePreview(
    inputId,
    previewId
) {

    const input =
        document.getElementById(
            inputId
        );


    const preview =
        document.getElementById(
            previewId
        );


    if (
        !input ||
        !preview
    ) {

        return;
    }


    input.addEventListener(
        "change",
        () => {

            const file =
                input.files?.[0];


            if (!file) {

                preview.removeAttribute(
                    "src"
                );

                preview.classList.add(
                    "hidden"
                );

                return;
            }


            /*
             * Only create previews for image files.
             */

            if (
                !file.type.startsWith(
                    "image/"
                )
            ) {

                preview.removeAttribute(
                    "src"
                );

                preview.classList.add(
                    "hidden"
                );

                return;
            }


            const objectURL =
                URL.createObjectURL(
                    file
                );


            preview.src =
                objectURL;


            preview.classList.remove(
                "hidden"
            );


            /*
             * Release the temporary object URL once the image
             * has loaded.
             */

            preview.onload =
                () => {

                    URL.revokeObjectURL(
                        objectURL
                    );

                };
        }
    );
}


/* ============================================================
   INITIALIZATION
   ============================================================ */

async function initializeSetManager() {

    /*
     * Make sure the ability editor starts in a useful state.
     */

    if (
        abilitiesList &&
        abilitiesList.children.length === 0
    ) {

        addAbilityEditor();
    }


    setupImagePreview(
        "set-cover",
        "set-cover-preview"
    );


    setupImagePreview(
        "card-artwork",
        "card-artwork-preview"
    );


    /*
     * Load existing data.
     */

    await Promise.all([
        loadSets(),
        loadCards()
    ]);
}


initializeSetManager();
```
