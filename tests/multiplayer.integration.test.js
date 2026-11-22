"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const net = require("node:net");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { after, before, test } = require("node:test");

const ROOT = path.resolve(__dirname, "..");
let child;
let baseUrl;
let serverPort;
let serverOutput = "";
let stateFile = path.join(os.tmpdir(), "csy-multiplayer-state-" + process.pid + "-" + Date.now() + ".json");
const adminSalt = crypto.randomBytes(16);
const adminPassword = "test-only-admin-password";
const adminPasswordHash = "scrypt:" + adminSalt.toString("hex") + ":" +
    crypto.scryptSync(adminPassword, adminSalt, 64).toString("hex");
const adminUsers = JSON.stringify([
    { username: "integration-owner", rank: "owner", passwordHash: adminPasswordHash }
]);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function findFreePort() {
    const probe = net.createServer();
    await new Promise((resolve, reject) => {
        probe.once("error", reject);
        probe.listen(0, "127.0.0.1", resolve);
    });
    const address = probe.address();
    const port = address.port;
    await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
    return port;
}

class ApiClient {
    constructor() {
        this.cookie = "";
    }

    async request(route, { method = "GET", body } = {}) {
        const headers = {};
        if (this.cookie) headers.cookie = this.cookie;
        if (body !== undefined) headers["Content-Type"] = "application/json";

        const response = await fetch(baseUrl + route, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const setCookie = response.headers.get("set-cookie");
        if (setCookie) this.cookie = setCookie.split(";")[0];

        const data = await response.json().catch(() => ({}));
        return { status: response.status, data };
    }
}



function beginPartialAction(client, matchId) {
    const body = JSON.stringify({ type: "end_turn" });
    let resolveResult;
    let rejectResult;
    const result = new Promise((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
    });
    const request = http.request(
        new URL("/api/multiplayer/matches/" + matchId + "/action", baseUrl),
        {
            method: "POST",
            headers: {
                Cookie: client.cookie,
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body)
            }
        },
        response => {
            let raw = "";
            response.setEncoding("utf8");
            response.on("data", chunk => { raw += chunk; });
            response.on("end", () => {
                let data = {};
                try { data = JSON.parse(raw); } catch {}
                resolveResult({ status: response.statusCode, data });
            });
        }
    );
    request.on("error", rejectResult);
    request.write('{"type":');
    return {
        finish() { request.end('"end_turn"}'); },
        result
    };
}

async function waitForServer() {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) {
            throw new Error("Server exited before becoming ready. Output: " + serverOutput);
        }
        try {
            const response = await fetch(baseUrl + "/multiplayer.html");
            if (response.ok) return;
        } catch {
            // The server may not have started listening yet.
        }
        await sleep(100);
    }
    throw new Error("Server did not become ready. Output: " + serverOutput);
}

function startServer(extraEnv = {}) {
    child = spawn(process.execPath, [path.join(ROOT, "server.js")], {
        cwd: ROOT,
        env: {
            ...process.env,
            HOST: "127.0.0.1",
            PORT: String(serverPort),
            CSY_STATE_FILE: stateFile,
            CSY_ALLOWED_ORIGINS: "https://frontend.example,https://pvp.cardstuffyes.ca,https://admin.cardstuffyes.ca",
            // The integration harness simulates TLS termination at a trusted
            // reverse proxy; production defaults remain proxy-untrusted.
            CSY_TRUST_PROXY: "true",
            CSY_ADMIN_USERS: adminUsers,
            ...extraEnv
        },
        stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.on("data", chunk => { serverOutput += chunk.toString(); });
    child.stderr.on("data", chunk => { serverOutput += chunk.toString(); });
    return waitForServer();
}

async function stopServer() {
    if (!child || child.exitCode !== null) return;
    const exiting = once(child, "exit");
    child.kill("SIGTERM");
    await Promise.race([exiting, sleep(2000)]);
    if (child.exitCode === null) {
        child.kill("SIGKILL");
        await Promise.race([once(child, "exit"), sleep(1000)]);
    }
}

before(async () => {
    serverPort = await findFreePort();
    baseUrl = "http://127.0.0.1:" + serverPort;
    await startServer();
});

after(async () => {
    await stopServer();
    fs.rmSync(stateFile, { force: true });
    fs.rmSync(stateFile + ".tmp", { force: true });
});

function requestWithHost(route, host, headers = {}, method = "GET", body) {
    return new Promise((resolve, reject) => {
        const request = http.request(new URL(route, baseUrl), {
            method,
            headers: { Host: host, ...headers }
        }, response => {
            let body = "";
            response.setEncoding("utf8");
            response.on("data", chunk => { body += chunk; });
            response.on("end", () => resolve({
                status: response.statusCode,
                headers: response.headers,
                body
            }));
        });
        request.on("error", reject);
        request.end(body);
    });
}

test("subdomains route to their intended application pages", async () => {
    const solo = await requestWithHost("/", "play.cardstuffyes.ca");
    assert.equal(solo.status, 200);
    assert.match(solo.body, /Battle Arena/);

    const pvp = await requestWithHost("/", "pvp.cardstuffyes.ca");
    assert.equal(pvp.status, 200);
    assert.match(pvp.body, /Online Battle/);

    const cards = await requestWithHost("/", "cards.cardstuffyes.ca");
    assert.equal(cards.status, 200);
    assert.match(cards.body, /Set Manager/);
    assert.ok(!cards.body.startsWith(String.fromCharCode(96).repeat(3)));

    const api = await requestWithHost("/api/health", "api.cardstuffyes.ca");
    assert.equal(api.status, 200);
    assert.equal(JSON.parse(api.body).ok, true);

    const blockedApiPage = await requestWithHost("/", "api.cardstuffyes.ca");
    assert.equal(blockedApiPage.status, 404);

    const unknown = await requestWithHost("/", "unknown.cardstuffyes.ca");
    assert.equal(unknown.status, 404);

    const www = await requestWithHost("/play?mode=solo", "www.cardstuffyes.ca", {
        "X-Forwarded-Proto": "https"
    });
    assert.equal(www.status, 308);
    assert.equal(www.headers.location, "https://cardstuffyes.ca/play?mode=solo");
});

test("API subdomain allows the PvP frontend origin and rejects others", async () => {
    const allowed = await requestWithHost("/api/multiplayer/me", "api.cardstuffyes.ca", {
        Origin: "https://pvp.cardstuffyes.ca"
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers["access-control-allow-origin"], "https://pvp.cardstuffyes.ca");
    assert.equal(allowed.headers["access-control-allow-credentials"], "true");

    const denied = await requestWithHost("/api/multiplayer/me", "api.cardstuffyes.ca", {
        Origin: "https://untrusted.example"
    });
    assert.equal(denied.status, 403);
});


test("admin frontend can authenticate against the API subdomain with a host-only secure session", async () => {
    const origin = "https://admin.cardstuffyes.ca";
    const preflight = await requestWithHost("/api/admin/login", "api.cardstuffyes.ca", {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type"
    }, "OPTIONS");
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers["access-control-allow-origin"], origin);
    assert.equal(preflight.headers["access-control-allow-credentials"], "true");
    assert.match(preflight.headers["access-control-allow-methods"], /POST/);

    const deniedPreflight = await requestWithHost("/api/admin/login", "api.cardstuffyes.ca", {
        Origin: "https://untrusted.example",
        "Access-Control-Request-Method": "POST"
    }, "OPTIONS");
    assert.equal(deniedPreflight.status, 403);

    const login = await requestWithHost("/api/admin/login", "api.cardstuffyes.ca", {
        Origin: origin,
        "X-Forwarded-Proto": "https",
        "Content-Type": "application/json"
    }, "POST", JSON.stringify({ username: "integration-owner", password: adminPassword }));
    assert.equal(login.status, 200);
    assert.equal(login.headers["access-control-allow-origin"], origin);
    const setCookie = Array.isArray(login.headers["set-cookie"])
        ? login.headers["set-cookie"][0]
        : login.headers["set-cookie"];
    assert.doesNotMatch(setCookie, /Domain=/i);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    assert.match(setCookie, /Secure/i);
    const cookie = setCookie.split(";")[0];

    const session = await requestWithHost("/api/admin/me", "api.cardstuffyes.ca", {
        Origin: origin,
        Cookie: cookie,
        "X-Forwarded-Proto": "https"
    });
    assert.equal(session.status, 200);
    assert.equal(JSON.parse(session.body).admin.username, "integration-owner");

    const logs = await requestWithHost("/api/admin/server-logs", "api.cardstuffyes.ca", {
        Origin: origin,
        Cookie: cookie,
        "X-Forwarded-Proto": "https"
    });
    assert.equal(logs.status, 200);
    assert.ok(Array.isArray(JSON.parse(logs.body).lines));

    // A simple cross-origin POST must not be able to sign the owner out.
    const csrfLogout = await requestWithHost("/api/admin/logout", "api.cardstuffyes.ca", {
        Origin: "https://untrusted.example",
        Cookie: cookie,
        "X-Forwarded-Proto": "https"
    }, "POST", "{}");
    assert.equal(csrfLogout.status, 403);
    const stillSignedIn = await requestWithHost("/api/admin/me", "api.cardstuffyes.ca", {
        Origin: origin,
        Cookie: cookie,
        "X-Forwarded-Proto": "https"
    });
    assert.equal(stillSignedIn.status, 200);

    // The admin page is only a static shell. The host-only API cookie is not
    // exposed to the admin subdomain; privileged data stays behind /api/admin.
    const adminPage = await requestWithHost("/admin.html", "admin.cardstuffyes.ca", {
        "X-Forwarded-Proto": "https"
    });
    assert.equal(adminPage.status, 200);
    assert.match(adminPage.body, /Admin Panel/);

    const noSession = await requestWithHost("/api/admin/me", "api.cardstuffyes.ca", {
        Origin: origin,
        "X-Forwarded-Proto": "https"
    });
    assert.equal(noSession.status, 401);

    const logout = await requestWithHost("/api/admin/logout", "api.cardstuffyes.ca", {
        Origin: origin,
        Cookie: cookie,
        "X-Forwarded-Proto": "https"
    }, "POST", "{}");
    assert.equal(logout.status, 200);

    const expired = await requestWithHost("/api/admin/me", "api.cardstuffyes.ca", {
        Origin: origin,
        Cookie: cookie,
        "X-Forwarded-Proto": "https"
    });
    assert.equal(expired.status, 401);
});

test("API health and allowlisted cross-origin preflight work", async () => {
    const health = await fetch(baseUrl + "/api/health");
    assert.equal(health.status, 200);
    const healthData = await health.json();
    assert.equal(healthData.ok, true);
    assert.equal(healthData.online, true);
    assert.equal(healthData.service, "card-stuff-yes-api");

    const preflight = await fetch(baseUrl + "/api/multiplayer/matches", {
        method: "OPTIONS",
        headers: {
            Origin: "https://frontend.example",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type"
        }
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "https://frontend.example");
    assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");

    const denied = await fetch(baseUrl + "/api/multiplayer/matches", {
        method: "OPTIONS",
        headers: { Origin: "https://not-allowed.example" }
    });
    assert.equal(denied.status, 403);
});

test("oversized JSON requests receive a 400 response", async () => {
    const response = await fetch(baseUrl + "/api/multiplayer/name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "x".repeat(20000) })
    });
    assert.equal(response.status, 400);
    const data = await response.json();
    assert.match(data.error, /too large/i);
});

test("waiting matches survive a server restart", async () => {
    const host = new ApiClient();
    const created = await host.request("/api/multiplayer/matches", { method: "POST" });
    assert.equal(created.status, 201);
    const matchId = created.data.match.id;

    await stopServer();
    await startServer();

    const resumed = await host.request("/api/multiplayer/current");
    assert.equal(resumed.status, 200);
    assert.equal(resumed.data.match.id, matchId);
    assert.equal(resumed.data.match.status, "waiting");
    assert.equal(resumed.data.match.opponent, null);
});

test("solo and multiplayer games receive the same shared card catalog", async () => {
    const response = await fetch(baseUrl + "/api/cards");
    assert.equal(response.status, 200);
    const payload = await response.json();
    const sourceCatalog = JSON.parse(fs.readFileSync(path.join(ROOT, "cards.json"), "utf8"));
    assert.equal(payload.count, sourceCatalog.length);
    assert.deepEqual(payload.cards, sourceCatalog);
    assert.equal(payload.cards.length, 120);
    assert.equal(new Set(payload.cards.map(card => card.id)).size, 120);
});

test("two guests can create and join a match; turns are enforced", async () => {
    const host = new ApiClient();
    const guest = new ApiClient();

    const hostProfile = await host.request("/api/multiplayer/name", {
        method: "POST", body: { name: "Host Player" }
    });
    assert.equal(hostProfile.status, 200);
    assert.equal(hostProfile.data.player.name, "Host Player");

    const created = await host.request("/api/multiplayer/matches", { method: "POST" });
    assert.equal(created.status, 201);
    assert.equal(created.data.match.status, "waiting");
    assert.match(created.data.match.id, /^[A-F0-9]{12}$/);

    const forbiddenView = await guest.request(
        "/api/multiplayer/matches/" + created.data.match.id
    );
    assert.equal(forbiddenView.status, 403);

    const guestProfile = await guest.request("/api/multiplayer/me");
    assert.equal(guestProfile.status, 200);

    const joined = await guest.request(
        "/api/multiplayer/matches/" + created.data.match.id + "/join",
        { method: "POST" }
    );
    assert.equal(joined.status, 200);
    assert.equal(joined.data.match.status, "active");
    assert.equal(joined.data.match.yourHand.length, 5);
    assert.equal(joined.data.match.you.handCount, 5);
    assert.equal(joined.data.match.opponent.handCount, 5);

    const hostView = await host.request(
        "/api/multiplayer/matches/" + created.data.match.id
    );
    assert.equal(hostView.status, 200);
    assert.equal(hostView.data.match.activePlayerId, hostView.data.match.you.playerId);

    const outOfTurn = await guest.request(
        "/api/multiplayer/matches/" + created.data.match.id + "/action",
        { method: "POST", body: { type: "end_turn" } }
    );
    assert.equal(outOfTurn.status, 409);
    assert.match(outOfTurn.data.error, /not your turn/i);

    const endedTurn = await host.request(
        "/api/multiplayer/matches/" + created.data.match.id + "/action",
        { method: "POST", body: { type: "end_turn" } }
    );
    assert.equal(endedTurn.status, 200);
    assert.equal(endedTurn.data.match.turn, 2);
    assert.equal(endedTurn.data.match.activePlayerId, guestProfile.data.player.id);
    assert.equal(endedTurn.data.match.opponent.name, guestProfile.data.player.name);
});

test("server rejects cards not owned by the active player's hand", async () => {
    const host = new ApiClient();
    const guest = new ApiClient();

    const created = await host.request("/api/multiplayer/matches", { method: "POST" });
    assert.equal(created.status, 201);
    const matchId = created.data.match.id;

    const joined = await guest.request(
        "/api/multiplayer/matches/" + matchId + "/join",
        { method: "POST" }
    );
    assert.equal(joined.status, 200);

    const before = await host.request("/api/multiplayer/matches/" + matchId);
    const energyBefore = before.data.match.you.energy;

    const forgedCard = await host.request(
        "/api/multiplayer/matches/" + matchId + "/action",
        { method: "POST", body: { type: "play_card", instanceId: "not-a-real-card-instance" } }
    );
    assert.equal(forgedCard.status, 400);
    assert.match(forgedCard.data.error, /not in your hand/i);

    const afterState = await host.request("/api/multiplayer/matches/" + matchId);
    assert.equal(afterState.data.match.you.energy, energyBefore);
    assert.equal(afterState.data.match.you.handCount, before.data.match.you.handCount);
});

test("a player cannot create or join a second unfinished match", async () => {
    const host = new ApiClient();
    const guest = new ApiClient();

    const first = await host.request("/api/multiplayer/matches", { method: "POST" });
    assert.equal(first.status, 201);

    const second = await host.request("/api/multiplayer/matches", { method: "POST" });
    assert.equal(second.status, 409);

    const guestMatch = await guest.request("/api/multiplayer/matches", { method: "POST" });
    assert.equal(guestMatch.status, 201);

    const joinExisting = await guest.request(
        "/api/multiplayer/matches/" + first.data.match.id + "/join",
        { method: "POST" }
    );
    assert.equal(joinExisting.status, 409);
});

test("multiplayer exposes all five independent Magik resource pools", async () => {
    const host = new ApiClient();
    const guest = new ApiClient();
    const created = await host.request("/api/multiplayer/matches", { method: "POST" });
    const joined = await guest.request("/api/multiplayer/matches/" + created.data.match.id + "/join", { method: "POST" });
    assert.equal(joined.status, 200);
    const resources = joined.data.match.you.resources;
    assert.deepEqual(Object.keys(resources).sort(), ["astralMagik", "bloodMagik", "darkMagik", "gildedMagik", "magik"].sort());
    assert.deepEqual(resources, { magik: 1, astralMagik: 1, gildedMagik: 1, bloodMagik: 1, darkMagik: 1 });
});

test("Magik draw is limited to once per turn", async () => {
    const host = new ApiClient();
    const guest = new ApiClient();

    const created = await host.request("/api/multiplayer/matches", { method: "POST" });
    const matchId = created.data.match.id;
    const joined = await guest.request(
        "/api/multiplayer/matches/" + matchId + "/join",
        { method: "POST" }
    );
    assert.equal(joined.status, 200);

    const firstDraw = await host.request(
        "/api/multiplayer/matches/" + matchId + "/action",
        { method: "POST", body: { type: "draw" } }
    );
    assert.equal(firstDraw.status, 200);
    assert.equal(firstDraw.data.match.you.magik, 0);

    const secondDraw = await host.request(
        "/api/multiplayer/matches/" + matchId + "/action",
        { method: "POST", body: { type: "draw" } }
    );
    assert.equal(secondDraw.status, 400);
    assert.match(secondDraw.data.error, /already used/i);
});

test("private server-side source files are not served as static files", async () => {
    for (const file of ["/server.js", "/server-set-manager-module.js", "/admin-server-patch.js"]) {
        const response = await fetch(baseUrl + file);
        assert.equal(response.status, 404, file + " should not be publicly served");
    }
});


test("leaving a waiting match cancels it and makes it unavailable", async () => {
    const host = new ApiClient();
    const guest = new ApiClient();

    const created = await host.request("/api/multiplayer/matches", { method: "POST" });
    assert.equal(created.status, 201);
    const matchId = created.data.match.id;

    const left = await host.request(
        "/api/multiplayer/matches/" + matchId + "/leave",
        { method: "POST" }
    );
    assert.equal(left.status, 200);

    const viewAfterLeave = await host.request("/api/multiplayer/matches/" + matchId);
    assert.equal(viewAfterLeave.status, 404);

    const lobby = await guest.request("/api/multiplayer/matches");
    assert.equal(lobby.status, 200);
    assert.equal(lobby.data.matches.some(match => match.id === matchId), false);
});

test("leaving an active match awards the opponent a forfeit win", async () => {
    const host = new ApiClient();
    const guest = new ApiClient();

    const created = await host.request("/api/multiplayer/matches", { method: "POST" });
    assert.equal(created.status, 201);
    const matchId = created.data.match.id;

    const joined = await guest.request(
        "/api/multiplayer/matches/" + matchId + "/join",
        { method: "POST" }
    );
    assert.equal(joined.status, 200);

    const guestProfile = await guest.request("/api/multiplayer/me");

    const left = await host.request(
        "/api/multiplayer/matches/" + matchId + "/leave",
        { method: "POST" }
    );
    assert.equal(left.status, 200);

    const guestView = await guest.request("/api/multiplayer/matches/" + matchId);
    assert.equal(guestView.status, 200);
    assert.equal(guestView.data.match.status, "finished");
    assert.equal(guestView.data.match.result, guestProfile.data.player.id);
    assert.equal(guestView.data.match.activePlayerId, null);
    assert.match(guestView.data.match.log[0].message, /wins by forfeit/i);

    const actionAfterForfeit = await guest.request(
        "/api/multiplayer/matches/" + matchId + "/action",
        { method: "POST", body: { type: "end_turn" } }
    );
    assert.equal(actionAfterForfeit.status, 409);
    assert.match(actionAfterForfeit.data.error, /not active/i);

});

test("player names are sanitized and length-limited", async () => {
    const client = new ApiClient();

    const tooShort = await client.request("/api/multiplayer/name", {
        method: "POST",
        body: { name: " <>" }
    });
    assert.equal(tooShort.status, 400);

    const updated = await client.request("/api/multiplayer/name", {
        method: "POST",
        body: { name: "  <b>Astral   Player</b>  " + "x".repeat(40) }
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.player.name.includes("<"), false);
    assert.equal(updated.data.player.name.includes(">"), false);
    assert.ok(updated.data.player.name.length <= 20);
    assert.match(updated.data.player.name, /^bAstral Player\/b/);
});


test("simultaneous end-turn requests cannot advance two turns", async () => {
    const host = new ApiClient();
    const guest = new ApiClient();

    const created = await host.request("/api/multiplayer/matches", { method: "POST" });
    assert.equal(created.status, 201);
    const matchId = created.data.match.id;

    const joined = await guest.request(
        "/api/multiplayer/matches/" + matchId + "/join",
        { method: "POST" }
    );
    assert.equal(joined.status, 200);

    const first = beginPartialAction(host, matchId);
    const second = beginPartialAction(host, matchId);

    // Keep both requests inside readJson() simultaneously, after they have
    // passed the initial turn check but before either action can execute.
    await sleep(50);
    first.finish();
    second.finish();

    const results = await Promise.all([first.result, second.result]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);

    const finalView = await guest.request("/api/multiplayer/matches/" + matchId);
    assert.equal(finalView.status, 200);
    assert.equal(finalView.data.match.turn, 2);
    assert.equal(finalView.data.match.activePlayerId, finalView.data.match.you.playerId);
});


test("current-match endpoint restores only the caller's unfinished match", async () => {
    const host = new ApiClient();
    const guest = new ApiClient();
    const stranger = new ApiClient();

    const noMatch = await host.request("/api/multiplayer/current");
    assert.equal(noMatch.status, 200);
    assert.equal(noMatch.data.match, null);

    const created = await host.request("/api/multiplayer/matches", { method: "POST" });
    assert.equal(created.status, 201);
    const matchId = created.data.match.id;

    const hostResume = await host.request("/api/multiplayer/current");
    assert.equal(hostResume.status, 200);
    assert.equal(hostResume.data.match.id, matchId);
    assert.equal(hostResume.data.match.status, "waiting");

    const strangerResume = await stranger.request("/api/multiplayer/current");
    assert.equal(strangerResume.status, 200);
    assert.equal(strangerResume.data.match, null);

    const joined = await guest.request(
        "/api/multiplayer/matches/" + matchId + "/join",
        { method: "POST" }
    );
    assert.equal(joined.status, 200);

    const guestResume = await guest.request("/api/multiplayer/current");
    assert.equal(guestResume.status, 200);
    assert.equal(guestResume.data.match.id, matchId);
    assert.equal(guestResume.data.match.status, "active");
    assert.equal(guestResume.data.match.yourHand.length, 5);

    const hostActiveResume = await host.request("/api/multiplayer/current");
    assert.equal(hostActiveResume.status, 200);
    assert.equal(hostActiveResume.data.match.id, matchId);
    assert.equal(hostActiveResume.data.match.status, "active");

    const left = await host.request(
        "/api/multiplayer/matches/" + matchId + "/leave",
        { method: "POST" }
    );
    assert.equal(left.status, 200);

    const finishedResume = await guest.request("/api/multiplayer/current");
    assert.equal(finishedResume.status, 200);
    assert.equal(finishedResume.data.match, null);
});


test("players and unfinished matches survive a server restart", async () => {
    const host = new ApiClient();
    const guest = new ApiClient();

    const named = await host.request("/api/multiplayer/name", {
        method: "POST",
        body: { name: "Persistent Host" }
    });
    assert.equal(named.status, 200);

    const created = await host.request("/api/multiplayer/matches", { method: "POST" });
    assert.equal(created.status, 201);
    const matchId = created.data.match.id;

    const joined = await guest.request(
        "/api/multiplayer/matches/" + matchId + "/join",
        { method: "POST" }
    );
    assert.equal(joined.status, 200);

    const endedTurn = await host.request(
        "/api/multiplayer/matches/" + matchId + "/action",
        { method: "POST", body: { type: "end_turn" } }
    );
    assert.equal(endedTurn.status, 200);
    assert.equal(endedTurn.data.match.turn, 2);

    await stopServer();
    await startServer();

    const hostAfterRestart = await host.request("/api/multiplayer/current");
    assert.equal(hostAfterRestart.status, 200);
    assert.equal(hostAfterRestart.data.match.id, matchId);
    assert.equal(hostAfterRestart.data.match.turn, 2);
    assert.equal(hostAfterRestart.data.match.you.name, "Persistent Host");

    const guestAfterRestart = await guest.request("/api/multiplayer/current");
    assert.equal(guestAfterRestart.status, 200);
    assert.equal(guestAfterRestart.data.match.id, matchId);
    assert.equal(guestAfterRestart.data.match.status, "active");
    // The guest starts turn 2 and automatically draws one card.
    assert.equal(guestAfterRestart.data.match.yourHand.length, 6);
});


test("private multiplayer state snapshot is never served as a static file", async () => {
    const response = await fetch(baseUrl + "/private-data/multiplayer-state.json");
    assert.equal(response.status, 404);
});


test("stale matches are pruned immediately when the server starts", async () => {
    const host = new ApiClient();
    const created = await host.request("/api/multiplayer/matches", { method: "POST" });
    assert.equal(created.status, 201);
    const matchId = created.data.match.id;

    const snapshot = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    const savedMatch = snapshot.matches.find(match => match.id === matchId);
    assert.ok(savedMatch, "created match should be in the snapshot");
    savedMatch.updatedAt = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(stateFile, JSON.stringify(snapshot), { mode: 0o600 });

    await stopServer();
    await startServer();

    const resumed = await host.request("/api/multiplayer/current");
    assert.equal(resumed.status, 200);
    assert.equal(resumed.data.match, null);

    const cleanedSnapshot = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    assert.equal(cleanedSnapshot.matches.some(match => match.id === matchId), false);
});


test("startup rejects a corrupt active match with a missing combatant", async () => {
    const host = new ApiClient();
    const guest = new ApiClient();

    const created = await host.request("/api/multiplayer/matches", { method: "POST" });
    assert.equal(created.status, 201);
    const matchId = created.data.match.id;
    const joined = await guest.request(
        "/api/multiplayer/matches/" + matchId + "/join",
        { method: "POST" }
    );
    assert.equal(joined.status, 200);

    const snapshot = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    const savedMatch = snapshot.matches.find(match => match.id === matchId);
    assert.ok(savedMatch);
    savedMatch.players[1] = null;
    fs.writeFileSync(stateFile, JSON.stringify(snapshot), { mode: 0o600 });

    await stopServer();
    await startServer();

    const hostResume = await host.request("/api/multiplayer/current");
    assert.equal(hostResume.status, 200);
    assert.equal(hostResume.data.match, null);
    const guestResume = await guest.request("/api/multiplayer/current");
    assert.equal(guestResume.status, 200);
    assert.equal(guestResume.data.match, null);
});

test("startup removes invalid player records from the saved snapshot", async () => {
    const player = new ApiClient();
    const profile = await player.request("/api/multiplayer/name", {
        method: "POST", body: { name: "Snapshot Player" }
    });
    assert.equal(profile.status, 200);

    const snapshot = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    snapshot.players.push({ id: 42, name: "Invalid Player Record" });
    fs.writeFileSync(stateFile, JSON.stringify(snapshot), { mode: 0o600 });

    await stopServer();
    await startServer();

    const cleanedSnapshot = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    assert.equal(
        cleanedSnapshot.players.some(item => item.id === 42),
        false,
        "invalid player record should be removed from the persisted snapshot"
    );
    const resumed = await player.request("/api/multiplayer/me");
    assert.equal(resumed.status, 200);
    assert.equal(resumed.data.player.name, "Snapshot Player");
});


test("guest capacity is enforced and reported as service unavailable", async () => {
    await stopServer();
    stateFile = path.join(os.tmpdir(), "csy-multiplayer-capacity-" + process.pid + "-" + Date.now() + ".json");
    await startServer({ CSY_MAX_GUEST_PLAYERS: "1" });

    const first = new ApiClient();
    const second = new ApiClient();

    const admitted = await first.request("/api/multiplayer/me");
    assert.equal(admitted.status, 200);
    assert.ok(admitted.data.player.id);

    // An identity participating in an unfinished match is retained by the
    // capacity cleanup policy and cannot be evicted to admit another guest.
    const match = await first.request("/api/multiplayer/matches", { method: "POST" });
    assert.equal(match.status, 201);

    const rejected = await second.request("/api/multiplayer/me");
    assert.equal(rejected.status, 503);
    assert.match(rejected.data.error, /at capacity/i);

    const existingSession = await first.request("/api/multiplayer/me");
    assert.equal(existingSession.status, 200);
    assert.equal(existingSession.data.player.id, admitted.data.player.id);
});


test("match capacity rejects additional matches without disturbing the existing match", async () => {
    await stopServer();
    stateFile = path.join(os.tmpdir(), "csy-match-capacity-" + process.pid + "-" + Date.now() + ".json");
    await startServer({ CSY_MAX_MATCHES: "1" });

    const firstHost = new ApiClient();
    const secondHost = new ApiClient();

    const first = await firstHost.request("/api/multiplayer/matches", { method: "POST" });
    assert.equal(first.status, 201);
    const matchId = first.data.match.id;

    const rejected = await secondHost.request("/api/multiplayer/matches", { method: "POST" });
    assert.equal(rejected.status, 503);
    assert.match(rejected.data.error, /capacity/i);

    const stillAvailable = await firstHost.request("/api/multiplayer/matches/" + matchId);
    assert.equal(stillAvailable.status, 200);
    assert.equal(stillAvailable.data.match.id, matchId);
    assert.equal(stillAvailable.data.match.status, "waiting");
});
