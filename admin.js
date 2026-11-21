// admin.js "use strict"; const identityElement = document.getElementById( "admin-identity" ); const statusElement = document.getElementById( "admin-status" ); const logoutButton = document.getElementById( "logout-button" ); const playersList = document.getElementById( "players-list" ); const newsList = document.getElementById( "news-list" ); const newsForm = document.getElementById( "news-form" ); const newsId = document.getElementById( "news-id" ); const newsTitle = document.getElementById( "news-title" ); const newsSummary = document.getElementById( "news-summary" ); const newsContent = document.getElementById( "news-content" ); const newsPublished = document.getElementById( "news-published" ); const newsFeatured = document.getElementById( "news-featured" ); const cancelNewsButton = document.getElementById( "cancel-news-button" ); function setStatus(message, type = "") { statusElement.textContent = message; statusElement.className = "status-message"; if (type) { statusElement.classList.add( type ); } } const adminApiBaseUrl = String(window.CSY_CONFIG?.apiBaseUrl || "").replace(/\/+$/, ""); async function adminFetch( url, options = {} ) { const response = await fetch( adminApiBaseUrl + url, { credentials: "include", ...options } ); const data = await response.json() .catch(() => ({})); if (!response.ok) { throw new Error( data.error || "Admin request failed." ); } return data; } /* ============================================================ ADMIN SESSION ============================================================ */ async function loadAdmin() { try { const data = await adminFetch( "/api/admin/me" ); const admin = data.admin || data.player || data; identityElement.textContent = admin.username ? `Signed in as ${admin.username}` : "Administrator"; } catch (error) { window.location.href = "./admin-login.html"; } } /* ============================================================ PLAYERS ============================================================ */ async function loadPlayers() { playersList.innerHTML = `<p class="loading-text"> Loading players... </p>`; try { const data = await adminFetch( "/api/admin/players" ); const players = Array.isArray(data) ? data : data.players || []; if (!players.length) { playersList.innerHTML = `<p class="empty-text"> No players found. </p>`; return; } playersList.innerHTML = ""; for (const player of players) { const row = document.createElement( "div" ); row.className = "player-row"; const information = document.createElement( "div" ); information.innerHTML = ` <div class="player-name"> ${escapeHTML( player.username || "Unknown Player" )} </div> <div class="player-id"> ID: ${escapeHTML( String( player.id ?? "" ) )} </div> `; const rank = document.createElement( "select" ); rank.className = "player-rank"; const ranks = [ "player", "mod", "admin", "owner" ]; for (const rankName of ranks) { const option = document.createElement( "option" ); option.value = rankName; option.textContent = rankName; if ( player.rank === rankName ) { option.selected = true; } rank.appendChild( option ); } rank.addEventListener( "change", async () => { await updatePlayerRank( player.id, rank.value, rank ); } ); row.appendChild( information ); row.appendChild( rank ); playersList.appendChild( row ); } } catch (error) { playersList.innerHTML = `<p class="empty-text"> ${escapeHTML( error.message )} </p>`; } } async function updatePlayerRank( playerId, rank, select ) { select.disabled = true; try { await adminFetch( `/api/admin/players/${encodeURIComponent( playerId )}/rank`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rank }) } ); setStatus( "Player rank updated.", "success" ); } catch (error) { setStatus( error.message, "error" ); await loadPlayers(); } finally { select.disabled = false; } } /* ============================================================ NEWS ============================================================ */ async function loadNews() { newsList.innerHTML = `<p class="loading-text"> Loading news... </p>`; try { const data = await adminFetch( "/api/admin/news" ); const posts = Array.isArray(data) ? data : data.news || data.posts || []; if (!posts.length) { newsList.innerHTML = `<p class="empty-text"> No news posts found. </p>`; return; } newsList.innerHTML = ""; for (const post of posts) { const row = document.createElement( "article" ); row.className = "news-row"; const title = document.createElement( "h3" ); title.className = "news-row-title"; title.textContent = post.title || "Untitled"; const summary = document.createElement( "p" ); summary.className = "news-row-summary"; summary.textContent = post.summary || ""; const meta = document.createElement( "div" ); meta.className = "news-row-meta"; meta.textContent = [ post.published ? "Published" : "Draft", post.featured ? "Featured" : "" ] .filter(Boolean) .join(" • "); const actions = document.createElement( "div" ); actions.className = "news-row-actions"; const editButton = document.createElement( "button" ); editButton.className = "admin-button"; editButton.type = "button"; editButton.textContent = "Edit"; editButton.addEventListener( "click", () => { fillNewsForm( post ); } ); const deleteButton = document.createElement( "button" ); deleteButton.className = "admin-button"; deleteButton.type = "button"; deleteButton.textContent = "Delete"; deleteButton.addEventListener( "click", () => { deleteNews( post.id ); } ); actions.appendChild( editButton ); actions.appendChild( deleteButton ); row.appendChild( title ); row.appendChild( summary ); row.appendChild( meta ); row.appendChild( actions ); newsList.appendChild( row ); } } catch (error) { newsList.innerHTML = `<p class="empty-text"> ${escapeHTML( error.message )} </p>`; } } function fillNewsForm(post) { newsId.value = post.id ?? ""; newsTitle.value = post.title ?? ""; newsSummary.value = post.summary ?? ""; newsContent.value = post.content ?? ""; newsPublished.checked = Boolean( post.published ); newsFeatured.checked = Boolean( post.featured ); window.scrollTo({ top: 0, behavior: "smooth" }); } function clearNewsForm() { newsForm.reset(); newsId.value = ""; } newsForm.addEventListener( "submit", async (event) => { event.preventDefault(); const id = newsId.value.trim(); const payload = { title: newsTitle.value.trim(), summary: newsSummary.value.trim(), content: newsContent.value, published: newsPublished.checked, featured: newsFeatured.checked }; try { if (id) { await adminFetch( `/api/admin/news/${encodeURIComponent( id )}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify( payload ) } ); } else { await adminFetch( "/api/admin/news", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify( payload ) } ); } clearNewsForm(); setStatus( "News post saved.", "success" ); await loadNews(); } catch (error) { setStatus( error.message, "error" ); } } ); cancelNewsButton.addEventListener( "click", clearNewsForm ); async function deleteNews(id) { try { await adminFetch( `/api/admin/news/${encodeURIComponent( id )}`, { method: "DELETE" } ); setStatus( "News post deleted.", "success" ); await loadNews(); } catch (error) { setStatus( error.message, "error" ); } } /* ============================================================ LOGOUT ============================================================ */ logoutButton.addEventListener( "click", async () => { logoutButton.disabled = true; try { await adminFetch( "/api/admin/logout", { method: "POST" } ); } finally { window.location.href = "./admin-login.html"; } } ); /* ============================================================ UTILITIES ============================================================ */ function escapeHTML(value) { return String(value) .replaceAll("&", "&amp;") .replaceAll("<", "&lt;") .replaceAll(">", "&gt;") .replaceAll('"', "&quot;") .replaceAll("'", "&#039;"); } /* ============================================================ STARTUP ============================================================ */ (async function initAdmin() { await loadAdmin(); await Promise.all([ loadPlayers(), loadNews() ]); })();

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


/* ============================================================
   COMMUNITY SERVER MODERATION
   ============================================================ */
const communityServersList = document.getElementById("community-servers-list");
const communityServersRefresh = document.getElementById("community-servers-refresh");
const communityServersUpdated = document.getElementById("community-servers-updated");

function addCommunityDetail(container, label, value) {
    const line = document.createElement("p");
    line.className = "community-server-detail";
    const strong = document.createElement("strong");
    strong.textContent = label + ": ";
    line.appendChild(strong);
    line.appendChild(document.createTextNode(value == null || value === "" ? "—" : String(value)));
    container.appendChild(line);
}

async function loadCommunityServerEvents(serverId, target) {
    target.textContent = "Loading moderation history...";
    try {
        const data = await adminFetch("/api/admin/community-servers/" + encodeURIComponent(serverId) + "/events");
        const events = Array.isArray(data.events) ? data.events : [];
        target.replaceChildren();
        if (!events.length) {
            target.textContent = "No moderation events recorded.";
            return true;
        }
        for (const event of events) {
            const item = document.createElement("li");
            const when = event.createdAt ? new Date(event.createdAt).toLocaleString() : "Unknown time";
            item.textContent = when + " · " + event.action + " · " + (event.actor || "Unknown actor") +
                (event.reason ? " · " + event.reason : "");
            target.appendChild(item);
        }
        return true;
    } catch (error) {
        target.textContent = "Could not load history: " + error.message;
        return false;
    }
}

async function moderateCommunityServer(server, action, button) {
    if (action === "approve" && !window.confirm("Approve this verified server for the public directory?")) return;
    let reason = "";
    if (action === "revoke") {
        reason = window.prompt("Optional revocation reason (up to 240 characters):", "") ;
        if (reason === null) return;
        if (reason.length > 240) {
            setStatus("Revocation reason must be 240 characters or fewer.", "error");
            return;
        }
        if (!window.confirm("Revoke this community server?")) return;
    }
    button.disabled = true;
    try {
        await adminFetch("/api/admin/community-servers/" + encodeURIComponent(server.serverId) + "/" + action, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(action === "revoke" ? { reason } : {})
        });
        setStatus("Community server " + (action === "approve" ? "approved." : "revoked."), "success");
        await loadCommunityServers();
    } catch (error) {
        setStatus(error.message, "error");
        button.disabled = false;
    }
}

async function loadCommunityServers() {
    if (!communityServersList) return;
    communityServersRefresh.disabled = true;
    communityServersList.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "loading-text";
    loading.textContent = "Loading community server registrations...";
    communityServersList.appendChild(loading);
    try {
        const data = await adminFetch("/api/admin/community-servers");
        const servers = Array.isArray(data.servers) ? data.servers : [];
        communityServersList.replaceChildren();
        if (!servers.length) {
            const empty = document.createElement("p");
            empty.className = "empty-text";
            empty.textContent = "No community server registrations found. The registry migration must be installed before this section can load.";
            communityServersList.appendChild(empty);
        }
        for (const server of servers) {
            const card = document.createElement("article");
            card.className = "community-server-card";
            const heading = document.createElement("div");
            heading.className = "community-server-heading";
            const title = document.createElement("h3");
            title.textContent = server.displayName || server.serverId;
            const status = document.createElement("span");
            status.className = "community-server-status status-" + String(server.status || "unknown");
            status.textContent = String(server.status || "unknown");
            heading.append(title, status);
            card.appendChild(heading);
            addCommunityDetail(card, "Server ID", server.serverId);
            addCommunityDetail(card, "Endpoint", server.endpoint);
            addCommunityDetail(card, "Owner", server.ownerUsername || server.ownerAccountId);
            addCommunityDetail(card, "Ownership verified", server.verifiedAt ? new Date(server.verifiedAt).toLocaleString() : "No");
            if (server.approvedAt) addCommunityDetail(card, "Approved", new Date(server.approvedAt).toLocaleString() + (server.approvedBy ? " by " + server.approvedBy : ""));
            if (server.revokedAt) addCommunityDetail(card, "Revoked", new Date(server.revokedAt).toLocaleString() + (server.revokedBy ? " by " + server.revokedBy : ""));
            if (server.revocationReason) addCommunityDetail(card, "Revocation reason", server.revocationReason);
            const actions = document.createElement("div");
            actions.className = "community-server-actions";
            if (server.status === "pending" && server.verifiedAt) {
                const approve = document.createElement("button");
                approve.type = "button";
                approve.className = "admin-button";
                approve.textContent = "Approve";
                approve.addEventListener("click", () => moderateCommunityServer(server, "approve", approve));
                actions.appendChild(approve);
            }
            if (server.status !== "revoked") {
                const revoke = document.createElement("button");
                revoke.type = "button";
                revoke.className = "admin-button danger-button";
                revoke.textContent = "Revoke";
                revoke.addEventListener("click", () => moderateCommunityServer(server, "revoke", revoke));
                actions.appendChild(revoke);
            }
            card.appendChild(actions);
            const history = document.createElement("details");
            history.className = "community-server-history";
            const summary = document.createElement("summary");
            summary.textContent = "Moderation history";
            const events = document.createElement("ol");
            events.className = "community-server-events";
            history.append(summary, events);
            history.addEventListener("toggle", () => {
                if (history.open && !history.dataset.loaded) {
                    history.dataset.loaded = "loading";
                    loadCommunityServerEvents(server.serverId, events).then(loaded => {
                        if (loaded) history.dataset.loaded = "true";
                        else delete history.dataset.loaded;
                    });
                }
            });
            card.appendChild(history);
            communityServersList.appendChild(card);
        }
        communityServersUpdated.textContent = "Updated " + new Date().toLocaleString() + " · " + servers.length + " registrations";
    } catch (error) {
        communityServersList.replaceChildren();
        const message = document.createElement("p");
        message.className = "empty-text";
        message.textContent = error.message;
        communityServersList.appendChild(message);
        communityServersUpdated.textContent = "Could not refresh registrations.";
    } finally {
        communityServersRefresh.disabled = false;
    }
}

if (communityServersRefresh) {
    communityServersRefresh.addEventListener("click", loadCommunityServers);
    loadCommunityServers();
}
