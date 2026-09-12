/*

* ============================================================
* CARD STUFF YES - SET MANAGER JAVASCRIPT
* ============================================================
*
* This file controls the Set Manager.
*
* It handles:
*
* * Owner/Mod access checking
* * Loading sets
* * Creating sets
* * Editing sets
* * Deleting sets
* * Loading cards
* * Uploading cards
* * Assigning cards to sets
* * Card names
* * Card stats
* * Card rarity
* * Card power
* * Event special cards
* * Card limits
*
* The server remains authoritative for all actual changes.
*
* ============================================================
  */

/* ============================================================
API HELPER
============================================================ */

/*

* Sends a request to the Card Stuff Yes server API.
*
* JSON requests are handled automatically.
* FormData requests are also supported for image uploads.
  */
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

  ```
   const message =
       data?.error ||
       data?.message ||
       `Request failed with status ${response.status}`;

   throw new Error(message);
  ```

  }

  return data;
  }

/* ============================================================
DOM HELPERS
============================================================ */

function getElement(id) {
return document.getElementById(id);
}

/*

* Safely escapes text before inserting it into HTML.
  */
  function escapeHTML(value) {

  return String(value ?? "")
  .replaceAll("&", "&")
  .replaceAll("<", "<")
  .replaceAll(">", ">")
  .replaceAll('"', """)
  .replaceAll("'", "'");
  }

/*

* Displays a message at the top of the manager.
  */
  function showMessage(message, type = "success") {

  const element = getElement("message");

  if (!element) {
  return;
  }

  element.textContent = message;

  element.className =
  `message visible ${type}`;

}

/*

* Removes the current message.
  */
  function clearMessage() {

  const element = getElement("message");

  if (!element) {
  return;
  }

  element.textContent = "";

  element.className =
  "message";
  }

/* ============================================================
APPLICATION STATE
============================================================ */

let sets = [];
let cards = [];

let editingSetId = null;

/* ============================================================
ACCESS CONTROL
============================================================ */

/*

* Only Owners and Mods should be able to use the Set Manager.
*
* The server also checks permissions.
* This browser-side check is only for the interface.
  */
  async function checkAccess() {

  const player = await apiRequest("/api/me");

  if (!player) {
  throw new Error("You must be signed in.");
  }

  if (
  player.rank !== "Owner" &&
  player.rank !== "Mod"
  ) {
  throw new Error(
  "You do not have permission to use the Set Manager."
  );
  }

  return player;
  }

/* ============================================================
SET LOADING
============================================================ */

/*

* Gets all sets from the administration API.
  */
  async function loadSets() {

  const data =
  await apiRequest("/api/admin/sets");

  sets =
  Array.isArray(data)
  ? data
  : Array.isArray(data.sets)
  ? data.sets
  : [];

  renderSets();
  populateSetSelector();
  }

/* ============================================================
CARD LOADING
============================================================ */

/*

* Gets all cards from the administration API.
  */
  async function loadCards() {

  const data =
  await apiRequest("/api/admin/cards");

  cards =
  Array.isArray(data)
  ? data
  : Array.isArray(data.cards)
  ? data.cards
  : [];

  renderCards();
  }

/* ============================================================
SET SELECTOR
============================================================ */

/*

* Rebuilds the set dropdown used by the card upload form.
  */
  function populateSetSelector() {

  const selector =
  getElement("cardSet");

  if (!selector) {
  return;
  }

  selector.innerHTML =
  `<option value="">Select a set...</option>`;

  for (const set of sets) {

  ```
   const option =
       document.createElement("option");

   option.value =
       set.id;

   option.textContent =
       `${set.id} — ${set.displayName}`;

   selector.appendChild(option);
  ```

  }
  }

/* ============================================================
SET STATUS
============================================================ */

/*

* Determines whether a set has already been released.
*
* The server remains authoritative about release times.
* This is only used to display the manager interface.
  */
  function getSetStatus(set) {

  if (!set.releaseDate) {
  return {
  text: "No release date",
  className: "scheduled"
  };
  }

  const releaseDate =
  new Date(
  `${set.releaseDate}T${set.releaseTime || "00:00"}:00`
  );

  if (
  Number.isNaN(
  releaseDate.getTime()
  )
  ) {
  return {
  text: "Invalid release date",
  className: "scheduled"
  };
  }

  if (
  Date.now() >=
  releaseDate.getTime()
  ) {
  return {
  text: "Released",
  className: "released"
  };
  }

  return {
  text: "Scheduled",
  className: "scheduled"
  };
  }

/* ============================================================
SET RENDERING
============================================================ */

/*

* Displays all existing sets.
  */
  function renderSets() {

  const container =
  getElement("setList");

  if (!container) {
  return;
  }

  if (sets.length === 0) {

  ```
   container.innerHTML =
       `<div class="empty-state">
           No sets have been created yet.
       </div>`;

   return;
  ```

  }

  container.innerHTML =
  sets.map(set => {

  ```
       const status =
           getSetStatus(set);

       const releaseDate =
           set.releaseDate
               ? escapeHTML(set.releaseDate)
               : "Not scheduled";

       const releaseTime =
           set.releaseTime
               ? escapeHTML(set.releaseTime)
               : "00:00";

       return `
           <article class="set-card">

               <div class="set-card-info">

                   <h3>
                       ${escapeHTML(set.displayName)}
                   </h3>

                   <div class="set-id">
                       ${escapeHTML(set.id)}
                   </div>

                   <div class="set-release">
                       Release:
                       ${releaseDate}
                       at
                       ${releaseTime}
                       Pacific Time
                   </div>

                   <span class="set-status ${status.className}">
                       ${escapeHTML(status.text)}
                   </span>

               </div>

               <div class="set-card-actions">

                   <button
                       type="button"
                       data-action="edit-set"
                       data-set-id="${escapeHTML(set.id)}"
                   >
                       Edit
                   </button>

                   <button
                       type="button"
                       class="danger-button"
                       data-action="delete-set"
                       data-set-id="${escapeHTML(set.id)}"
                   >
                       Delete
                   </button>

               </div>

           </article>
       `;

   }).join("");
  ```

}

/* ============================================================
CARD RENDERING
============================================================ */

/*

* Displays cards currently known to the Set Manager.
  */
  function renderCards() {

  const container =
  getElement("cardList");

  if (!container) {
  return;
  }

  if (cards.length === 0) {

  ```
   container.innerHTML =
       `<div class="empty-state">
           No cards have been uploaded yet.
       </div>`;

   return;
  ```

  }

  container.innerHTML =
  cards.map(card => {

  ```
       const stats =
           typeof card.stats === "object"
               ? JSON.stringify(card.stats)
               : String(card.stats ?? "");

       return `
           <article class="card-entry">

               ${
                   card.imageUrl
                       ? `
                           <img
                               class="card-entry-image"
                               src="${escapeHTML(card.imageUrl)}"
                               alt="${escapeHTML(card.name || card.id)}"
                               loading="lazy"
                           >
                         `
                       : ""
               }

               <div class="card-entry-name">
                   ${escapeHTML(card.name)}
               </div>

               <div class="card-entry-id">
                   ${escapeHTML(card.id)}
               </div>

               <div class="card-entry-details">

                   <div>
                       Set:
                       ${escapeHTML(card.setId)}
                   </div>

                   <div>
                       Rarity:
                       ${escapeHTML(card.rarity)}
                   </div>

                   <div>
                       Power:
                       ${escapeHTML(card.power)}
                   </div>

                   <div>
                       Limit:
                       ${escapeHTML(card.cardLimit)}
                   </div>

                   <div>
                       Event:
                       ${card.isEventSpecialCard ? "Yes" : "No"}
                   </div>

               </div>

               ${
                   stats
                       ? `
                           <details>
                               <summary>Card Stats</summary>
                               <pre>${escapeHTML(stats)}</pre>
                           </details>
                         `
                       : ""
               }

           </article>
       `;

   }).join("");
  ```

}

/* ============================================================
SET ID GENERATION
============================================================ */

/*

* Generates the next available set ID.
*
* Example:
*
* Existing:
* S01
* S02
*
* New:
* S03
  */
  function generateNextSetId() {

  let highestNumber = 0;

  for (const set of sets) {

  ```
   const match =
       /^S(\d+)$/.exec(
           String(set.id || "")
       );

   if (!match) {
       continue;
   }

   const number =
       Number.parseInt(
           match[1],
           10
       );

   if (
       Number.isFinite(number) &&
       number > highestNumber
   ) {
       highestNumber = number;
   }
  ```

  }

  return `S${String(highestNumber + 1).padStart(2, "0")}`;
  }

/* ============================================================
CARD ID GENERATION
============================================================ */

/*

* Generates the next card ID inside a set.
*
* Example:
*
* S01-01
* S01-02
* S01-03
*
* The next card becomes:
*
* S01-04
  */
  function generateNextCardId(setId) {

  let highestNumber = 0;

  for (const card of cards) {

  ```
   if (
       String(card.setId) !==
       String(setId)
   ) {
       continue;
   }

   const match =
       new RegExp(
           `^${setId}-(\\d+)$`
       ).exec(
           String(card.id || "")
       );

   if (!match) {
       continue;
   }

   const number =
       Number.parseInt(
           match[1],
           10
       );

   if (
       Number.isFinite(number) &&
       number > highestNumber
   ) {
       highestNumber = number;
   }
  ```

  }

  return `${setId}-${String(highestNumber + 1).padStart(2, "0")}`;
  }

/* ============================================================
SET FORM RESET
============================================================ */

/*

* Clears the Set form and switches it back to creation mode.
  */
  function resetSetForm() {

  editingSetId = null;

  const form =
  getElement("setForm");

  if (form) {
  form.reset();
  }

  const setId =
  getElement("setId");

  if (setId) {
  setId.value =
  generateNextSetId();

  ```
   setId.readOnly = false;
  ```

  }

  const submitButton =
  getElement("setSubmit");

  if (submitButton) {
  submitButton.textContent =
  "Create Set";
  }

  const cancelButton =
  getElement("setCancel");

  if (cancelButton) {
  cancelButton.hidden = true;
  }
  }

/* ============================================================
EDIT SET
============================================================ */

/*

* Loads a set into the Set form for editing.
  */
  function editSet(setId) {

  const set =
  sets.find(
  item =>
  String(item.id) ===
  String(setId)
  );

  if (!set) {
  showMessage(
  "That set could not be found.",
  "error"
  );

  ```
   return;
  ```

  }

  editingSetId =
  set.id;

  getElement("setId").value =
  set.id;

  getElement("setId").readOnly =
  true;

  getElement("setDisplayName").value =
  set.displayName || "";

  getElement("setReleaseDate").value =
  set.releaseDate || "";

  getElement("setReleaseTime").value =
  set.releaseTime || "00:00";

  const submitButton =
  getElement("setSubmit");

  if (submitButton) {
  submitButton.textContent =
  "Save Set";
  }

  const cancelButton =
  getElement("setCancel");

  if (cancelButton) {
  cancelButton.hidden = false;
  }

  getElement("setDisplayName")?.focus();

  window.scrollTo({
  top: 0,
  behavior: "smooth"
  });
  }

/* ============================================================
CREATE / UPDATE SET
============================================================ */

/*

* Sends the Set form to the server.
  */
  async function submitSetForm(event) {

  event.preventDefault();

  clearMessage();

  const id =
  getElement("setId").value.trim();

  const displayName =
  getElement("setDisplayName").value.trim();

  const releaseDate =
  getElement("setReleaseDate").value;

  const releaseTime =
  getElement("setReleaseTime").value ||
  "00:00";

  if (!id) {

  ```
   showMessage(
       "Set ID is required.",
       "error"
   );

   return;
  ```

  }

  if (!displayName) {

  ```
   showMessage(
       "Set display name is required.",
       "error"
   );

   return;
  ```

  }

  const payload = {
  id,
  displayName,
  releaseDate,
  releaseTime,
  timeZone: "America/Vancouver"
  };

  const submitButton =
  getElement("setSubmit");

  if (submitButton) {
  submitButton.disabled = true;
  }

  try {

  ```
   if (editingSetId) {

       await apiRequest(
           `/api/admin/sets/${encodeURIComponent(editingSetId)}`,
           {
               method: "PUT",
               headers: {
                   "Content-Type":
                       "application/json"
               },
               body:
                   JSON.stringify(payload)
           }
       );

       showMessage(
           "Set updated successfully."
       );

   } else {

       await apiRequest(
           "/api/admin/sets",
           {
               method: "POST",
               headers: {
                   "Content-Type":
                       "application/json"
               },
               body:
                   JSON.stringify(payload)
           }
       );

       showMessage(
           "Set created successfully."
       );
   }

   resetSetForm();

   await loadSets();
  ```

  } catch (error) {

  ```
   showMessage(
       error.message,
       "error"
   );
  ```

  } finally {

  ```
   if (submitButton) {
       submitButton.disabled = false;
   }
  ```

  }
  }

/* ============================================================
DELETE SET
============================================================ */

/*

* Deletes a set.
*
* The server should refuse the deletion if cards still belong
* to the set.
  */
  async function deleteSet(setId) {

  const set =
  sets.find(
  item =>
  String(item.id) ===
  String(setId)
  );

  if (!set) {
  return;
  }

  const confirmed =
  window.confirm(
  `Delete the set "${set.displayName}" (${set.id})?`
  );

  if (!confirmed) {
  return;
  }

  try {

  ```
   await apiRequest(
       `/api/admin/sets/${encodeURIComponent(setId)}`,
       {
           method: "DELETE"
       }
   );

   showMessage(
       "Set deleted successfully."
   );

   await loadSets();
  ```

  } catch (error) {

  ```
   showMessage(
       error.message,
       "error"
   );
  ```

  }
  }

/* ============================================================
CARD STATS VALIDATION
============================================================ */

/*

* Card Stats are stored as JSON.
*
* This checks that the text entered by the manager is valid JSON
* before it is sent to the server.
  */
  function parseCardStats() {

  const input =
  getElement("cardStats");

  const text =
  input?.value.trim() || "";

  if (!text) {
  return {};
  }

  try {

  ```
   const parsed =
       JSON.parse(text);

   if (
       parsed === null ||
       typeof parsed !== "object" ||
       Array.isArray(parsed)
   ) {
       throw new Error(
           "Card stats must be a JSON object."
       );
   }

   return parsed;
  ```

  } catch (error) {

  ```
   throw new Error(
       `Invalid Card Stats JSON: ${error.message}`
   );
  ```

  }
  }

/* ============================================================
CARD FORM RESET
============================================================ */

/*

* Clears the card upload form.
  */
  function resetCardForm() {

  const form =
  getElement("cardForm");

  if (form) {
  form.reset();
  }

  const cardStats =
  getElement("cardStats");

  if (cardStats) {
  cardStats.value =
  "{}";
  }
  }

/* ============================================================
CARD UPLOAD
============================================================ */

/*

* Uploads a new card and its artwork.
*
* The server assigns the final card ID.
  */
  async function submitCardForm(event) {

  event.preventDefault();

  clearMessage();

  const image =
  getElement("cardImage")?.files?.[0];

  const cardName =
  getElement("cardName").value.trim();

  const cardSet =
  getElement("cardSet").value;

  const rarity =
  getElement("cardRarity").value;

  const power =
  getElement("cardPower").value;

  const isEventSpecialCard =
  getElement("isEventSpecialCard").checked;

  const cardLimit =
  getElement("cardLimit").value;

  if (!image) {

  ```
   showMessage(
       "Please select a card image.",
       "error"
   );

   return;
  ```

  }

  if (!cardName) {

  ```
   showMessage(
       "Card name is required.",
       "error"
   );

   return;
  ```

  }

  if (!cardSet) {

  ```
   showMessage(
       "Please specify a set.",
       "error"
   );

   return;
  ```

  }

  let cardStats;

  try {

  ```
   cardStats =
       parseCardStats();
  ```

  } catch (error) {

  ```
   showMessage(
       error.message,
       "error"
   );

   return;
  ```

  }

  const formData =
  new FormData();

  formData.append(
  "image",
  image
  );

  formData.append(
  "name",
  cardName
  );

  formData.append(
  "setId",
  cardSet
  );

  formData.append(
  "stats",
  JSON.stringify(cardStats)
  );

  formData.append(
  "rarity",
  rarity
  );

  formData.append(
  "power",
  power
  );

  formData.append(
  "isEventSpecialCard",
  String(isEventSpecialCard)
  );

  formData.append(
  "cardLimit",
  cardLimit
  );

  const submitButton =
  getElement("cardSubmit");

  if (submitButton) {
  submitButton.disabled = true;
  }

  try {

  ```
   const result =
       await apiRequest(
           "/api/admin/cards/upload",
           {
               method: "POST",
               body: formData
           }
       );

   const uploadedCard =
       result?.card;

   if (uploadedCard?.id) {

       showMessage(
           `Card uploaded successfully as ${uploadedCard.id}.`
       );

   } else {

       showMessage(
           "Card uploaded successfully."
       );
   }

   resetCardForm();

   await loadCards();
  ```

  } catch (error) {

  ```
   showMessage(
       error.message,
       "error"
   );
  ```

  } finally {

  ```
   if (submitButton) {
       submitButton.disabled = false;
   }
  ```

  }
  }

/* ============================================================
EVENT HANDLERS
============================================================ */

/*

* Handles buttons inside the dynamically generated Set list.
  */
  function handleSetListClick(event) {

  const button =
  event.target.closest(
  "button[data-action]"
  );

  if (!button) {
  return;
  }

  const action =
  button.dataset.action;

  const setId =
  button.dataset.setId;

  if (action === "edit-set") {
  editSet(setId);
  }

  if (action === "delete-set") {
  deleteSet(setId);
  }
  }

/* ============================================================
INITIALIZATION
============================================================ */

/*

* Starts the Set Manager once the page is ready.
  */
  async function initializeSetManager() {

  try {

  ```
   await checkAccess();

   await Promise.all([
       loadSets(),
       loadCards()
   ]);

   resetSetForm();
  ```

  } catch (error) {

  ```
   showMessage(
       error.message,
       "error"
   );

   /*
    * Disable the forms if the user is not allowed to
    * manage sets/cards.
    */

   const setForm =
       getElement("setForm");

   if (setForm) {
       setForm.querySelectorAll(
           "input, select, textarea, button"
       ).forEach(
           element =>
               element.disabled = true
       );
   }

   const cardForm =
       getElement("cardForm");

   if (cardForm) {
       cardForm.querySelectorAll(
           "input, select, textarea, button"
       ).forEach(
           element =>
               element.disabled = true
       );
   }
  ```

  }
  }

/* ============================================================
PAGE EVENT SETUP
============================================================ */

document.addEventListener(
"DOMContentLoaded",
() => {

```
    getElement("setForm")
        ?.addEventListener(
            "submit",
            submitSetForm
        );

    getElement("cardForm")
        ?.addEventListener(
            "submit",
            submitCardForm
        );

    getElement("setList")
        ?.addEventListener(
            "click",
            handleSetListClick
        );

    getElement("setCancel")
        ?.addEventListener(
            "click",
            resetSetForm
        );

    initializeSetManager();
}
```

);
