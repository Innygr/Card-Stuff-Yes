// admin.js
"use strict"; const identityElement = document.getElementById( "admin-identity" ); const statusElement = document.getElementById( "admin-status" ); const logoutButton = document.getElementById( "logout-button" ); const playersList = document.getElementById( "players-list" ); const newsList = document.getElementById( "news-list" ); const newsForm = document.getElementById( "news-form" ); const newsId = document.getElementById( "news-id" ); const newsTitle = document.getElementById( "news-title" ); const newsSummary = document.getElementById( "news-summary" ); const newsContent = document.getElementById( "news-content" ); const newsPublished = document.getElementById( "news-published" ); const newsFeatured = document.getElementById( "news-featured" ); const cancelNewsButton = document.getElementById( "cancel-news-button" ); function setStatus(message, type = "") { statusElement.textContent = message; statusElement.className = "status-message"; if (type) { statusElement.classList.add( type ); } } const adminApiBaseUrl = String(window.CSY_CONFIG?.apiBaseUrl || "").replace(/\/+$/, ""); async function adminFetch( url, options = {} ) { const response = await fetch( adminApiBaseUrl + url, { credentials: "include", ...options } ); const data = await response.json() .catch(() => ({})); if (!response.ok) { throw new Error( data.error || "Admin request failed." ); } return data; } /* ============================================================ ADMIN SESSION ============================================================ */ function showAdminGateError(title, message) {
    const gate = document.getElementById("admin-access-gate");
    const heading = document.getElementById("admin-access-title");
    const detail = document.getElementById("admin-access-message");
    if (heading) heading.textContent = title;
    if (detail) detail.textContent = message;
    const image = gate && gate.querySelector(".loading-neginny");
    if (image) image.hidden = true;
    const dots = gate && gate.querySelector(".loading-dots");
    if (dots) dots.hidden = true;
    if (gate && !gate.querySelector("[data-admin-retry]")) {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = "Try again";
        retry.dataset.adminRetry = "true";
        retry.addEventListener("click", () => window.location.reload());
        retry.style.cssText = "margin-top:20px;padding:12px 22px;border:0;border-radius:8px;cursor:pointer;font-weight:bold;";
        gate.appendChild(retry);
    }
}
async function loadAdmin() {
    try {
        const response = await fetch(adminApiBaseUrl + "/api/admin/me", {
            credentials: "include",
            cache: "no-store"
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) {
            const returnTo = encodeURIComponent("https://admin.cardstuffyes.ca/");
            window.location.replace("https://account.cardstuffyes.ca/login.html?returnTo=" + returnTo);
            return false;
        }
        if (response.status === 403) {
            showAdminGateError("Access denied", "Your account rank is " + String(data.rank || "player") + ". Owner or Admin access is required.");
            return false;
        }
        if (!response.ok) throw new Error(data.error || "The server could not verify your account.");
        const admin = data.admin || {};
        if (!["owner", "admin"].includes(String(admin.rank || "").toLowerCase())) {
            showAdminGateError("Access denied", "Owner or Admin access is required.");
            return false;
        }
        identityElement.textContent = admin.username ? "Signed in as " + admin.username + " (" + admin.rank + ")" : "Administrator";
        const gate = document.getElementById("admin-access-gate");
        if (gate) gate.remove();
        return true;
    } catch (error) {
        showAdminGateError("Unable to verify access", error.message || "The database could not be reached. Try again.");
        return false;
    }
} /* ============================================================ PLAYERS ============================================================ */ let adminCardCatalog = null;
async function buildCollectionControls(player) {
    if (!adminCardCatalog) {
        const data = await adminFetch("/api/cards");
        adminCardCatalog = Array.isArray(data.cards) ? data.cards : [];
    }
    const controls = document.createElement("div");
    controls.className = "player-collection-controls";
    const card = document.createElement("select");
    card.setAttribute("aria-label", "Card to assign");
    for (const item of adminCardCatalog) {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.name + " (" + item.id + ")";
        card.appendChild(option);
    }
    const quantity = document.createElement("input");
    quantity.type = "number";
    quantity.min = "0";
    quantity.max = "999";
    quantity.step = "1";
    quantity.value = "0";
    quantity.setAttribute("aria-label", "Owned card quantity");
    const save = document.createElement("button");
    save.type = "button";
    save.className = "admin-button";
    save.textContent = "Set quantity";
    save.addEventListener("click", async () => {
        const amount = Number(quantity.value);
        if (!Number.isInteger(amount) || amount < 0 || amount > 999) {
            setStatus("Card quantity must be between 0 and 999.", "error");
            return;
        }
        save.disabled = true;
        try {
            await adminFetch("/api/admin/players/" + encodeURIComponent(player.id) +
                "/collection/" + encodeURIComponent(card.value), {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ quantity: amount })
                });
            setStatus("Card collection updated for " + (player.username || "player") + ".", "success");
        } catch (error) {
            setStatus(error.message, "error");
        } finally {
            save.disabled = false;
        }
    });
    controls.append(card, quantity, save);
    return controls;
}
async function loadPlayers() { playersList.innerHTML = `<p class="loading-text"> Loading players... </p>`; try { const data = await adminFetch( "/api/admin/players" ); const players = Array.isArray(data) ? data : data.players || []; if (!players.length) { playersList.innerHTML = `<p class="empty-text"> No players found. </p>`; return; } playersList.innerHTML = ""; for (const player of players) { const row = document.createElement( "div" ); row.className = "player-row"; const information = document.createElement( "div" ); information.innerHTML = ` <div class="player-name"> ${escapeHTML( player.username || "Unknown Player" )} </div> <div class="player-id"> ID: ${escapeHTML( String( player.id ?? "" ) )} </div> `; const rank = document.createElement( "select" ); rank.className = "player-rank"; const ranks = [ "player", "mod", "admin" ]; for (const rankName of ranks) { const option = document.createElement( "option" ); option.value = rankName; option.textContent = rankName; if ( player.rank === rankName ) { option.selected = true; } rank.appendChild( option ); } rank.addEventListener( "change", async () => { await updatePlayerRank( player.id, rank.value, rank ); } ); row.appendChild( information ); row.appendChild( rank ); try { row.appendChild(await buildCollectionControls(player)); } catch (error) { const unavailable = document.createElement("span"); unavailable.textContent = "Collection controls unavailable: " + error.message; row.appendChild(unavailable); } playersList.appendChild( row ); } } catch (error) { playersList.innerHTML = `<p class="empty-text"> ${escapeHTML( error.message )} </p>`; } } async function updatePlayerRank( playerId, rank, select ) { select.disabled = true; try { await adminFetch( `/api/admin/players/${encodeURIComponent( playerId )}/rank`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rank }) } ); setStatus( "Player rank updated.", "success" ); } catch (error) { setStatus( error.message, "error" ); await loadPlayers(); } finally { select.disabled = false; } } /* ============================================================ NEWS ============================================================ */ async function loadNews() { newsList.innerHTML = `<p class="loading-text"> Loading news... </p>`; try { const data = await adminFetch( "/api/admin/news" ); const posts = Array.isArray(data) ? data : data.news || data.posts || []; if (!posts.length) { newsList.innerHTML = `<p class="empty-text"> No news posts found. </p>`; return; } newsList.innerHTML = ""; for (const post of posts) { const row = document.createElement( "article" ); row.className = "news-row"; const title = document.createElement( "h3" ); title.className = "news-row-title"; title.textContent = post.title || "Untitled"; const summary = document.createElement( "p" ); summary.className = "news-row-summary"; summary.textContent = post.summary || ""; const meta = document.createElement( "div" ); meta.className = "news-row-meta"; meta.textContent = [ post.published ? "Published" : "Draft", post.featured ? "Featured" : "" ] .filter(Boolean) .join(" • "); const actions = document.createElement( "div" ); actions.className = "news-row-actions"; const editButton = document.createElement( "button" ); editButton.className = "admin-button"; editButton.type = "button"; editButton.textContent = "Edit"; editButton.addEventListener( "click", () => { fillNewsForm( post ); } ); const deleteButton = document.createElement( "button" ); deleteButton.className = "admin-button"; deleteButton.type = "button"; deleteButton.textContent = "Delete"; deleteButton.addEventListener( "click", () => { deleteNews( post.id ); } ); actions.appendChild( editButton ); actions.appendChild( deleteButton ); row.appendChild( title ); row.appendChild( summary ); row.appendChild( meta ); row.appendChild( actions ); newsList.appendChild( row ); } } catch (error) { newsList.innerHTML = `<p class="empty-text"> ${escapeHTML( error.message )} </p>`; } } function fillNewsForm(post) { newsId.value = post.id ?? ""; newsTitle.value = post.title ?? ""; newsSummary.value = post.summary ?? ""; newsContent.value = post.content ?? ""; newsPublished.checked = Boolean( post.published ); newsFeatured.checked = Boolean( post.featured ); window.scrollTo({ top: 0, behavior: "smooth" }); } function clearNewsForm() { newsForm.reset(); newsId.value = ""; } newsForm.addEventListener( "submit", async (event) => { event.preventDefault(); const id = newsId.value.trim(); const payload = { title: newsTitle.value.trim(), summary: newsSummary.value.trim(), content: newsContent.value, published: newsPublished.checked, featured: newsFeatured.checked }; try { if (id) { await adminFetch( `/api/admin/news/${encodeURIComponent( id )}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify( payload ) } ); } else { await adminFetch( "/api/admin/news", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify( payload ) } ); } clearNewsForm(); setStatus( "News post saved.", "success" ); await loadNews(); } catch (error) { setStatus( error.message, "error" ); } } ); cancelNewsButton.addEventListener( "click", clearNewsForm ); async function deleteNews(id) { try { await adminFetch( `/api/admin/news/${encodeURIComponent( id )}`, { method: "DELETE" } ); setStatus( "News post deleted.", "success" ); await loadNews(); } catch (error) { setStatus( error.message, "error" ); } } /* ============================================================ LOGOUT ============================================================ */ logoutButton.addEventListener( "click", async () => { logoutButton.disabled = true; try { await adminFetch( "/api/auth/logout", { method: "POST" } ); } finally { window.location.href = "https://account.cardstuffyes.ca/login.html"; } } ); /* ============================================================ UTILITIES ============================================================ */ function escapeHTML(value) { return String(value) .replaceAll("&", "&amp;") .replaceAll("<", "&lt;") .replaceAll(">", "&gt;") .replaceAll('"', "&quot;") .replaceAll("'", "&#039;"); } /* ============================================================ STARTUP ============================================================ */ (async function initAdmin() { if (!(await loadAdmin())) return; await Promise.all([ loadPlayers(), loadNews() ]); })();

/* ============================================================
   SERVER LOGS
   ============================================================ */
const logsOutput = document.getElementById("server-logs-output");
const logsUpdated = document.getElementById("server-logs-updated");
const logsFilter = document.getElementById("server-logs-filter");
const logsRefresh = document.getElementById("server-logs-refresh");
const logsCopy = document.getElementById("server-logs-copy");
const logsDownload = document.getElementById("server-logs-download");
let latestLogText = "";

async function loadServerLogs() {
    if (!logsOutput) return;
    logsRefresh.disabled = true;
    try {
        const data = await adminFetch("/api/admin/server-logs?level=" + encodeURIComponent(logsFilter.value));
        latestLogText = (data.lines || []).join("\n");
        logsOutput.textContent = latestLogText || "No log lines match this filter.";
        logsUpdated.textContent = "Updated " + new Date(data.updatedAt).toLocaleString() + " · " + (data.lines || []).length + " lines";
    } catch (error) {
        logsOutput.textContent = error.message;
        logsUpdated.textContent = "Could not refresh logs.";
    } finally {
        logsRefresh.disabled = false;
    }
}
if (logsRefresh) {
    logsRefresh.addEventListener("click", loadServerLogs);
    logsFilter.addEventListener("change", loadServerLogs);
    logsCopy.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(latestLogText);
            logsUpdated.textContent = "Logs copied to clipboard.";
        } catch {
            logsUpdated.textContent = "Clipboard access was blocked by the browser.";
        }
    });
    logsDownload.addEventListener("click", () => {
        const blob = new Blob([latestLogText], { type: "text/plain;charset=utf-8" });
        const href = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = href;
        link.download = "card-stuff-yes-server-logs.txt";
        link.click();
        URL.revokeObjectURL(href);
    });
    loadServerLogs();
    window.setInterval(loadServerLogs, 10000);
}
