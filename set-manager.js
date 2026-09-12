/* ================================================================
   CARD STUFF YES - SET MANAGER JAVASCRIPT

   This file controls:

   - Set creation
   - Set editing
   - Set cover previews
   - Single card uploads
   - Batch card uploads
   - Set/card loading
   - Card previews
   - Manager permissions

   The server remains authoritative for all actual changes.
   ================================================================ */


/* ================================================================
   API HELPER

   Sends requests to the Card Stuff Yes backend and converts
   responses into JavaScript objects.
   ================================================================ */

async function apiRequest(url, options = {}) {

    const response = await fetch(url, {

        credentials: "same-origin",

        ...options

    });


    let data = null;

    try {

        data = await response.json();

    } catch {

        data = null;

    }


    if (!response.ok) {

        const message =
            data?.error ||
            data?.message ||
            `Request failed with status ${response.status}`;

        throw new Error(message);

    }


    return data;

}


/* ================================================================
   DOM ELEMENTS

   Stores references to the page controls.
   ================================================================ */

const accessWarning =
    document.getElementById("access-warning");


const setForm =
    document.getElementById("set-form");

const setIdInput =
    document.getElementById("set-id");

const setNameInput =
    document.getElementById("set-name");

const releaseDateInput =
    document.getElementById("release-date");

const releaseTimeInput =
    document.getElementById("release-time");

const coverArtInput =
    document.getElementById("cover-art");

const coverPreview =
    document.getElementById("cover-preview");

const coverPreviewImage =
    document.getElementById("cover-preview-image");

const setSubmitButton =
    document.getElementById("set-submit-button");

const cancelEditButton =
    document.getElementById("cancel-edit-button");

const setFormStatus =
    document.getElementById("set-form-status");

const refreshSetsButton =
    document.getElementById("refresh-sets-button");

const setsList =
    document.getElementById("sets-list");


const cardForm =
    document.getElementById("card-form");

const cardImageInput =
    document.getElementById("card-image");

const cardNameInput =
    document.getElementById("card-name");

const cardSetSelect =
    document.getElementById("card-set");

const cardStatsInput =
    document.getElementById("card-stats");

const cardRarityInput =
    document.getElementById("card-rarity");

const cardPowerInput =
    document.getElementById("card-power");

const specialEventCardInput =
    document.getElementById("special-event-card");

const cardLimitInput =
    document.getElementById("card-limit");

const cardFormStatus =
    document.getElementById("card-form-status");


const batchForm =
    document.getElementById("batch-form");

const batchSetSelect =
    document.getElementById("batch-set");

const batchImagesInput =
    document.getElementById("batch-images");

const batchRarityInput =
    document.getElementById("batch-rarity");

const batchPowerInput =
    document.getElementById("batch-power");

const batchSpecialEventCardInput =
    document.getElementById("batch-special-event-card");

const batchCardLimitInput =
    document.getElementById("batch-card-limit");

const batchFileList =
    document.getElementById("batch-file-list");

const batchFormStatus =
    document.getElementById("batch-form-status");


const refreshCardsButton =
    document.getElementById("refresh-cards-button");

const cardsList =
    document.getElementById("cards-list");


const cardOverlay =
    document.getElementById("card-overlay");

const overlayCardImage =
    document.getElementById("overlay-card-image");

const closeOverlayButton =
    document.getElementById("close-overlay-button");


/* ================================================================
   STATE

   Keeps temporary UI state.

   The server remains the source of truth.
   ================================================================ */

let sets = [];

let cards = [];

let editingSetId = null;


/* ================================================================
   HTML ESCAPING

   Prevents metadata returned by the server from being inserted
   into the page as executable HTML.
   ================================================================ */

function escapeHTML(value) {

    return String(value ?? "")

        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


/* ================================================================
   DATE CONVERSION

   The UI uses MM-DD-YYYY.

   The server can continue storing dates in its normalized
   YYYY-MM-DD representation.
   ================================================================ */

function displayDateToServerDate(value) {

    const match =
        /^(\d{2})-(\d{2})-(\d{4})$/.exec(
            value.trim()
        );


    if (!match) {

        throw new Error(
            "Release date must use MM-DD-YYYY."
        );

    }


    const month = Number(match[1]);

    const day = Number(match[2]);

    const year = Number(match[3]);


    const date =
        new Date(
            Date.UTC(
                year,
                month - 1,
                day
            )
        );


    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {

        throw new Error(
            "Release date is not valid."
        );

    }


    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

}


/* ================================================================
   SERVER DATE TO UI DATE
   ================================================================ */

function serverDateToDisplayDate(value) {

    if (!value) {

        return "";

    }


    const match =
        /^(\d{4})-(\d{2})-(\d{2})$/.exec(
            value
        );


    if (!match) {

        return value;

    }


    return `${match[2]}-${match[3]}-${match[1]}`;

}


/* ================================================================
   STATUS DISPLAY

   Shows a message below a form.
   ================================================================ */

function setStatus(element, message, type = "") {

    element.textContent = message;

    element.classList.remove(
        "success-message",
        "error-message"
    );


    if (type === "success") {

        element.classList.add(
            "success-message"
        );

    }


    if (type === "error") {

        element.classList.add(
            "error-message"
        );

    }

}


/* ================================================================
   SET SELECT OPTIONS

   Keeps both card upload forms synchronized with the currently
   available sets.
   ================================================================ */

function populateSetSelects() {

    const selects = [
        cardSetSelect,
        batchSetSelect
    ];


    for (const select of selects) {

        const currentValue =
            select.value;


        select.innerHTML =
            '<option value="">Select a set</option>';


        for (const set of sets) {

            const option =
                document.createElement("option");

            option.value =
                set.id;

            option.textContent =
                `${set.id} - ${set.displayName}`;

            select.appendChild(option);

        }


        if (
            sets.some(
                set => set.id === currentValue
            )
        ) {

            select.value =
                currentValue;

        }

    }

}


/* ================================================================
   COVER PREVIEW

   Shows the selected set cover before uploading it.
   ================================================================ */

coverArtInput.addEventListener(
    "change",
    () => {

        const file =
            coverArtInput.files?.[0];


        if (!file) {

            coverPreview.classList.add(
                "hidden"
            );

            coverPreviewImage.src = "";

            return;

        }


        if (
            file.type !==
            "image/png"
        ) {

            setStatus(
                setFormStatus,
                "Cover art must be a PNG file.",
                "error"
            );

            coverArtInput.value = "";

            return;

        }


        const objectURL =
            URL.createObjectURL(file);


        coverPreviewImage.src =
            objectURL;

        coverPreview.classList.remove(
            "hidden"
        );


        coverPreviewImage.onload =
            () => {

                URL.revokeObjectURL(
                    objectURL
                );

            };

    }
);


/* ================================================================
   LOAD SETS

   Gets the sets from the server.

   The backend determines which sets the current user is allowed
   to see.
   ================================================================ */

async function loadSets() {

    setsList.innerHTML =
        '<p class="loading-message">Loading sets...</p>';


    try {

        const data =
            await apiRequest(
                "/api/admin/sets"
            );


        sets =
            Array.isArray(data)
                ? data
                : Array.isArray(data.sets)
                    ? data.sets
                    : [];


        renderSets();

        populateSetSelects();

    } catch (error) {

        setsList.innerHTML =
            `<p class="error-message">${escapeHTML(error.message)}</p>`;

    }

}


/* ================================================================
   RENDER SETS

   Creates the visual list of sets.
   ================================================================ */

function renderSets() {

    if (!sets.length) {

        setsList.innerHTML =
            '<p class="loading-message">No sets have been created yet.</p>';

        return;

    }


    setsList.innerHTML = "";


    for (const set of sets) {

        const item =
            document.createElement("article");

        item.className =
            "set-item";


        const coverPath =
            set.coverArt
                ? `/set-covers/${encodeURIComponent(set.coverArt)}`
                : "";


        if (coverPath) {

            item.innerHTML +=
                `
                <img
                    class="set-cover"
                    src="${coverPath}"
                    alt="${escapeHTML(set.displayName)} cover art"
                >
                `;

        } else {

            item.innerHTML +=
                `
                <div class="set-cover-placeholder">
                    No Cover Art
                </div>
                `;

        }


        item.innerHTML +=
            `
            <div class="set-info">

                <h3>
                    ${escapeHTML(set.displayName)}
                </h3>

                <div class="set-id">
                    ${escapeHTML(set.id)}
                </div>

                <div class="set-release">
                    Release:
                    ${escapeHTML(
                        serverDateToDisplayDate(
                            set.releaseDate
                        )
                    )}
                    at
                    ${escapeHTML(
                        set.releaseTime || ""
                    )}
                    Pacific Time
                </div>

                <div class="set-actions">

                    <button
                        class="manager-button secondary-button edit-set-button"
                        type="button"
                        data-set-id="${escapeHTML(set.id)}"
                    >
                        EDIT
                    </button>

                    <button
                        class="manager-button delete-set-button"
                        type="button"
                        data-set-id="${escapeHTML(set.id)}"
                    >
                        DELETE
                    </button>

                </div>

            </div>
            `;


        setsList.appendChild(item);

    }


    document
        .querySelectorAll(".edit-set-button")
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        startEditingSet(
                            button.dataset.setId
                        );

                    }
                );

            }
        );


    document
        .querySelectorAll(".delete-set-button")
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        deleteSet(
                            button.dataset.setId
                        );

                    }
                );

            }
        );

}


/* ================================================================
   RESET SET FORM
   ================================================================ */

function resetSetForm() {

    editingSetId = null;

    setForm.reset();

    setSubmitButton.textContent =
        "CREATE SET";

    cancelEditButton.classList.add(
        "hidden"
    );

    coverPreview.classList.add(
        "hidden"
    );

    coverPreviewImage.src = "";

    setStatus(
        setFormStatus,
        ""
    );

}


/* ================================================================
   START SET EDITING

   Loads an existing set into the form.
   ================================================================ */

function startEditingSet(setId) {

    const set =
        sets.find(
            item => item.id === setId
        );


    if (!set) {

        return;

    }


    editingSetId =
        set.id;


    setIdInput.value =
        set.id;

    setNameInput.value =
        set.displayName || "";

    releaseDateInput.value =
        serverDateToDisplayDate(
            set.releaseDate
        );

    releaseTimeInput.value =
        set.releaseTime || "";


    setSubmitButton.textContent =
        "SAVE SET";

    cancelEditButton.classList.remove(
        "hidden"
    );


    if (set.coverArt) {

        coverPreviewImage.src =
            `/set-covers/${encodeURIComponent(set.coverArt)}`;

        coverPreview.classList.remove(
            "hidden"
        );

    }


    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

}


/* ================================================================
   SET FORM SUBMISSION

   Uses the backend's multipart endpoint so the cover PNG can be
   sent together with the set metadata.
   ================================================================ */

setForm.addEventListener(
    "submit",
    async event => {

        event.preventDefault();


        try {

            const releaseDate =
                displayDateToServerDate(
                    releaseDateInput.value
                );


            const formData =
                new FormData();


            formData.append(
                "setId",
                setIdInput.value.trim()
            );

            formData.append(
                "displayName",
                setNameInput.value.trim()
            );

            formData.append(
                "releaseDate",
                releaseDate
            );

            formData.append(
                "releaseTime",
                releaseTimeInput.value
            );


            if (
                coverArtInput.files &&
                coverArtInput.files[0]
            ) {

                formData.append(
                    "coverArt",
                    coverArtInput.files[0]
                );

            }


            const url =
                editingSetId
                    ? `/api/admin/sets/${encodeURIComponent(editingSetId)}`
                    : "/api/admin/sets";


            const method =
                editingSetId
                    ? "PUT"
                    : "POST";


            setStatus(
                setFormStatus,
                editingSetId
                    ? "Saving set..."
                    : "Creating set..."
            );


            await apiRequest(
                url,
                {
                    method,
                    body: formData
                }
            );


            setStatus(
                setFormStatus,
                editingSetId
                    ? "Set saved successfully."
                    : "Set created successfully.",
                "success"
            );


            resetSetForm();

            await loadSets();

        } catch (error) {

            setStatus(
                setFormStatus,
                error.message,
                "error"
            );

        }

    }
);


/* ================================================================
   CANCEL EDITING
   ================================================================ */

cancelEditButton.addEventListener(
    "click",
    resetSetForm
);


/* ================================================================
   DELETE SET

   The backend should reject deletion when the set still contains
   cards.
   ================================================================ */

async function deleteSet(setId) {

    const set =
        sets.find(
            item => item.id === setId
        );


    if (!set) {

        return;

    }


    const confirmed =
        window.confirm(
            `Delete set ${set.id} - ${set.displayName}?`
        );


    if (!confirmed) {

        return;

    }


    try {

        await apiRequest(
            `/api/admin/sets/${encodeURIComponent(setId)}`,
            {
                method: "DELETE"
            }
        );


        await loadSets();

        await loadCards();

    } catch (error) {

        window.alert(
            error.message
        );

    }

}


/* ================================================================
   SINGLE CARD FORM

   Uploads one card.

   The server automatically assigns the next card ID for the
   selected set.
   ================================================================ */

cardForm.addEventListener(
    "submit",
    async event => {

        event.preventDefault();


        const image =
            cardImageInput.files?.[0];


        if (!image) {

            setStatus(
                cardFormStatus,
                "Select a PNG card image.",
                "error"
            );

            return;

        }


        if (
            image.type !==
            "image/png"
        ) {

            setStatus(
                cardFormStatus,
                "Card images must be PNG files.",
                "error"
            );

            return;

        }


        try {

            let stats = {};


            if (
                cardStatsInput.value.trim()
            ) {

                stats =
                    JSON.parse(
                        cardStatsInput.value
                    );

            }


            const formData =
                new FormData();


            formData.append(
                "image",
                image
            );

            formData.append(
                "name",
                cardNameInput.value.trim()
            );

            formData.append(
                "set",
                cardSetSelect.value
            );

            formData.append(
                "stats",
                JSON.stringify(stats)
            );

            formData.append(
                "rarity",
                cardRarityInput.value
            );

            formData.append(
                "power",
                cardPowerInput.value
            );

            formData.append(
                "isSpecialEventCard",
                specialEventCardInput.checked
                    ? "true"
                    : "false"
            );

            formData.append(
                "cardLimit",
                cardLimitInput.value
            );


            setStatus(
                cardFormStatus,
                "Uploading card..."
            );


            const result =
                await apiRequest(
                    "/api/admin/cards/upload",
                    {
                        method: "POST",
                        body: formData
                    }
                );


            setStatus(
                cardFormStatus,
                `Card ${result.card?.id || "uploaded"} successfully.`,
                "success"
            );


            cardForm.reset();

            cardPowerInput.value =
                "0";

            cardLimitInput.value =
                "1";


            await loadCards();

        } catch (error) {

            setStatus(
                cardFormStatus,
                error.message,
                "error"
            );

        }

    }
);


/* ================================================================
   BATCH FILE DISPLAY

   Shows all selected files before uploading them.
   ================================================================ */

batchImagesInput.addEventListener(
    "change",
    () => {

        batchFileList.innerHTML = "";


        const files =
            Array.from(
                batchImagesInput.files || []
            );


        if (!files.length) {

            return;

        }


        for (const file of files) {

            const item =
                document.createElement("div");

            item.className =
                "batch-file-item";

            item.textContent =
                file.name;

            batchFileList.appendChild(
                item
            );

        }

    }
);


/* ================================================================
   BATCH CARD UPLOAD

   Every selected image becomes a separate card.

   The server assigns the IDs in the selected set.
   ================================================================ */

batchForm.addEventListener(
    "submit",
    async event => {

        event.preventDefault();


        const files =
            Array.from(
                batchImagesInput.files || []
            );


        if (!files.length) {

            setStatus(
                batchFormStatus,
                "Select at least one PNG card image.",
                "error"
            );

            return;

        }


        const invalidFile =
            files.find(
                file =>
                    file.type !==
                    "image/png"
            );


        if (invalidFile) {

            setStatus(
                batchFormStatus,
                `${invalidFile.name} is not a PNG file.`,
                "error"
            );

            return;

        }


        try {

            const formData =
                new FormData();


            formData.append(
                "set",
                batchSetSelect.value
            );

            formData.append(
                "rarity",
                batchRarityInput.value
            );

            formData.append(
                "power",
                batchPowerInput.value
            );

            formData.append(
                "isSpecialEventCard",
                batchSpecialEventCardInput.checked
                    ? "true"
                    : "false"
            );

            formData.append(
                "cardLimit",
                batchCardLimitInput.value
            );


            for (const file of files) {

                formData.append(
                    "images",
                    file
                );

            }


            setStatus(
                batchFormStatus,
                `Uploading ${files.length} card${files.length === 1 ? "" : "s"}...`
            );


            const result =
                await apiRequest(
                    "/api/admin/cards/batch-upload",
                    {
                        method: "POST",
                        body: formData
                    }
                );


            const uploaded =
                Array.isArray(result.cards)
                    ? result.cards
                    : [];


            setStatus(
                batchFormStatus,
                `Uploaded ${uploaded.length} card${uploaded.length === 1 ? "" : "s"} successfully.`,
                "success"
            );


            batchForm.reset();

            batchFileList.innerHTML =
                "";


            batchPowerInput.value =
                "0";

            batchCardLimitInput.value =
                "1";


            await loadCards();

        } catch (error) {

            setStatus(
                batchFormStatus,
                error.message,
                "error"
            );

        }

    }
);


/* ================================================================
   LOAD CARDS
   ================================================================ */

async function loadCards() {

    cardsList.innerHTML =
        '<p class="loading-message">Loading cards...</p>';


    try {

        const data =
            await apiRequest(
                "/api/admin/cards"
            );


        cards =
            Array.isArray(data)
                ? data
                : Array.isArray(data.cards)
                    ? data.cards
                    : [];


        renderCards();

    } catch (error) {

        cardsList.innerHTML =
            `<p class="error-message">${escapeHTML(error.message)}</p>`;

    }

}


/* ================================================================
   RENDER CARDS
   ================================================================ */

function renderCards() {

    if (!cards.length) {

        cardsList.innerHTML =
            '<p class="loading-message">No cards have been uploaded yet.</p>';

        return;

    }


    cardsList.innerHTML = "";


    for (const card of cards) {

        const item =
            document.createElement("article");

        item.className =
            "card-item";


        const imagePath =
            card.image ||
            `/card-images/${encodeURIComponent(card.id)}.png`;


        item.innerHTML =
            `
            <img
                class="card-image"
                src="${imagePath}"
                alt="${escapeHTML(card.name || card.id)}"
                data-card-image="${imagePath}"
            >

            <div class="card-info">

                <h3>
                    ${escapeHTML(
                        card.name || card.id
                    )}
                </h3>

                <p>
                    ID:
                    ${escapeHTML(card.id)}
                </p>

                <p>
                    Set:
                    ${escapeHTML(card.set || "")}
                </p>

                <p>
                    Rarity:
                    ${escapeHTML(card.rarity || "")}
                </p>

                <p>
                    Power:
                    ${escapeHTML(card.power ?? "")}
                </p>

                <p>
                    Deck Limit:
                    ${escapeHTML(card.cardLimit ?? "")}
                </p>

                ${
                    card.isSpecialEventCard
                        ? `
                        <span class="special-card-label">
                            SPECIAL EVENT CARD
                        </span>
                        `
                        : ""
                }

            </div>
            `;


        cardsList.appendChild(item);

    }


    cardsList
        .querySelectorAll(".card-image")
        .forEach(
            image => {

                image.addEventListener(
                    "click",
                    () => {

                        openCardOverlay(
                            image.dataset.cardImage
                        );

                    }
                );

            }
        );

}


/* ================================================================
   CARD IMAGE OVERLAY
   ================================================================ */

function openCardOverlay(imagePath) {

    overlayCardImage.src =
        imagePath;

    cardOverlay.classList.remove(
        "hidden"
    );

    cardOverlay.setAttribute(
        "aria-hidden",
        "false"
    );

}


/* ================================================================
   CLOSE CARD OVERLAY
   ================================================================ */

function closeCardOverlay() {

    cardOverlay.classList.add(
        "hidden"
    );

    cardOverlay.setAttribute(
        "aria-hidden",
        "true"
    );

    overlayCardImage.src = "";

}


closeOverlayButton.addEventListener(
    "click",
    closeCardOverlay
);


cardOverlay.addEventListener(
    "click",
    event => {

        if (
            event.target ===
            cardOverlay
        ) {

            closeCardOverlay();

        }

    }
);


/* ================================================================
   KEYBOARD ACCESS

   Escape closes the card preview.
   ================================================================ */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key ===
            "Escape"
        ) {

            closeCardOverlay();

        }

    }
);


/* ================================================================
   REFRESH BUTTONS
   ================================================================ */

refreshSetsButton.addEventListener(
    "click",
    loadSets
);


refreshCardsButton.addEventListener(
    "click",
    loadCards
);


/* ================================================================
   PERMISSION CHECK

   The backend decides whether the user is actually allowed to use
   this page.

   Owner and Mod access are expected.
   ================================================================ */

async function checkAccess() {

    try {

        const data =
            await apiRequest(
                "/api/me"
            );


        const player =
            data.player ||
            data;


        const allowed =
            player &&
            (
                player.rank === "Owner" ||
                player.rank === "Mod" ||
                player.rank === "Moderator"
            );


        if (!allowed) {

            accessWarning.classList.remove(
                "hidden"
            );

            setForm.classList.add(
                "hidden"
            );

            return false;

        }


        accessWarning.classList.add(
            "hidden"
        );

        return true;

    } catch {

        accessWarning.classList.remove(
            "hidden"
        );

        return false;

    }

}


/* ================================================================
   INITIALIZATION

   Loads everything when the page is ready.
   ================================================================ */

async function initializeSetManager() {

    const allowed =
        await checkAccess();


    if (!allowed) {

        return;

    }


    await loadSets();

    await loadCards();

}


/* ================================================================
   START
   ================================================================ */

initializeSetManager();
