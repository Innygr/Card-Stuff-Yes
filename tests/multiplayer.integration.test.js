"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const net = require("node:net");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");

const ROOT = path.resolve(__dirname, "..");
let child;
let baseUrl;
let serverPort;
let serverOutput = "";
const stateFile = path.join(os.tmpdir(), "csy-multiplayer-state-" + process.pid + "-" + Date.now() + ".json");

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

function startServer() {
    child = spawn(process.execPath, [path.join(ROOT, "server.js")], {
        cwd: ROOT,
        env: {
            ...process.env,
            HOST: "127.0.0.1",
            PORT: String(serverPort),
            CSY_STATE_FILE: stateFile
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

test("private server source is not served as a static file", async () => {
    const response = await fetch(baseUrl + "/server.js");
    assert.equal(response.status, 404);
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
    assert.equal(guestAfterRestart.data.match.yourHand.length, 5);
});
