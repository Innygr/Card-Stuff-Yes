"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { after, before, test } = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const stateFile = path.join(os.tmpdir(), "csy-account-state-" + process.pid + "-" + Date.now() + ".json");
const accountFile = path.join(os.tmpdir(), "csy-account-store-" + process.pid + "-" + Date.now() + ".json");
const allowedOrigin = "https://account.cardstuffyes.ca";
let child;
let port;
let baseUrl;
let output = "";

async function freePort() {
    const probe = net.createServer();
    await new Promise((resolve, reject) => {
        probe.once("error", reject);
        probe.listen(0, "127.0.0.1", resolve);
    });
    const value = probe.address().port;
    await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
    return value;
}

async function waitReady() {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error("Server exited: " + output);
        try {
            const response = await fetch(baseUrl + "/api/health");
            if (response.ok) return;
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 80));
    }
    throw new Error("Server did not start: " + output);
}

async function startServer() {
    child = spawn(process.execPath, [path.join(ROOT, "server.js")], {
        cwd: ROOT,
        env: {
            ...process.env,
            HOST: "127.0.0.1",
            PORT: String(port),
            CSY_STATE_FILE: stateFile,
            CSY_ACCOUNT_FILE: accountFile,
            CSY_ALLOWED_ORIGINS: allowedOrigin
        },
        stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.on("data", chunk => { output += chunk.toString(); });
    child.stderr.on("data", chunk => { output += chunk.toString(); });
    await waitReady();
}

async function stopServer() {
    if (!child || child.exitCode !== null) return;
    const exiting = once(child, "exit");
    child.kill("SIGTERM");
    await Promise.race([exiting, new Promise(resolve => setTimeout(resolve, 2000))]);
    if (child.exitCode === null) {
        child.kill("SIGKILL");
        await Promise.race([once(child, "exit"), new Promise(resolve => setTimeout(resolve, 1000))]);
    }
}

class Client {
    constructor() { this.cookies = new Map(); }

    async request(route, { method = "GET", body, origin = allowedOrigin } = {}) {
        const headers = { Origin: origin };
        if (this.cookies.size) headers.Cookie = [...this.cookies].map(([key, value]) => key + "=" + value).join("; ");
        if (body !== undefined) headers["Content-Type"] = "application/json";
        const response = await fetch(baseUrl + route, {
            method, headers, body: body === undefined ? undefined : JSON.stringify(body)
        });
        const setCookies = typeof response.headers.getSetCookie === "function"
            ? response.headers.getSetCookie()
            : String(response.headers.get("set-cookie") || "").split(/, (?=csy[A-Za-z]+=)/);
        for (const value of setCookies) {
            const first = value.split(";")[0];
            const index = first.indexOf("=");
            if (index < 0) continue;
            const key = first.slice(0, index);
            const cookieValue = first.slice(index + 1);
            if (!cookieValue) this.cookies.delete(key);
            else this.cookies.set(key, cookieValue);
        }
        const data = await response.json().catch(() => ({}));
        return { status: response.status, data };
    }
}

before(async () => {
    port = await freePort();
    baseUrl = "http://127.0.0.1:" + port;
    await startServer();
});

after(async () => {
    await stopServer();
    for (const file of [stateFile, stateFile + ".tmp", accountFile, accountFile + ".tmp"]) {
        fs.rmSync(file, { force: true });
    }
});

test("accounts securely link to an existing guest and survive restart", async () => {
    const owner = new Client();
    const guestProfile = await owner.request("/api/multiplayer/me");
    assert.equal(guestProfile.status, 200);
    const guestId = guestProfile.data.player.id;

    const loginPage = await fetch(baseUrl + "/login.html");
    assert.equal(loginPage.status, 200);
    assert.match(await loginPage.text(), /Create account/);

    const match = await owner.request("/api/multiplayer/matches", { method: "POST" });
    assert.equal(match.status, 201);
    const matchId = match.data.match.id;

    const weak = await owner.request("/api/auth/register", {
        method: "POST", body: { username: "CardPlayer", password: "short" }
    });
    assert.equal(weak.status, 400);

    const registered = await owner.request("/api/auth/register", {
        method: "POST", body: { username: "CardPlayer", password: "A-long-passphrase-2026!" }
    });
    assert.equal(registered.status, 201);
    assert.equal(registered.data.linkedGuestPlayerId, guestId);
    assert.equal(registered.data.player.id, guestId);
    assert.ok(owner.cookies.has("csyAccountSession"));
    assert.equal(owner.cookies.get("csyPlayerId"), guestId);

    const profileSaved = await owner.request("/api/account/profile", {
        method: "PUT",
        body: { displayName: "Card Captain", bio: "A player profile that follows my account." }
    });
    assert.equal(profileSaved.status, 200);
    assert.deepEqual(profileSaved.data.profile, {
        displayName: "Card Captain",
        bio: "A player profile that follows my account."
    });
    const tooLongBio = await owner.request("/api/account/profile", {
        method: "PUT", body: { bio: "x".repeat(241) }
    });
    assert.equal(tooLongBio.status, 400);
    const profileRead = await owner.request("/api/account/profile");
    assert.equal(profileRead.data.profile.displayName, "Card Captain");

    const settingsSaved = await owner.request("/api/account/settings", {
        method: "PUT",
        body: { masterVolume: 65, reducedMotion: true, colorblindMode: "off", onlineStatus: "online" }
    });
    assert.equal(settingsSaved.status, 200);
    assert.equal(settingsSaved.data.settings.masterVolume, 65);
    assert.equal(settingsSaved.data.settings.reducedMotion, true);
    const invalidSettings = await owner.request("/api/account/settings", {
        method: "PUT", body: { masterVolume: 100000, unknownSetting: true }
    });
    assert.equal(invalidSettings.status, 400);
    const settingsRead = await owner.request("/api/account/settings");
    assert.equal(settingsRead.data.settings.masterVolume, 65);

    const duplicate = await new Client().request("/api/auth/register", {
        method: "POST", body: { username: "cardplayer", password: "Another-long-passphrase!" }
    });
    assert.equal(duplicate.status, 409);

    const untrusted = await new Client().request("/api/auth/register", {
        method: "POST", origin: "https://untrusted.example",
        body: { username: "Intruder", password: "A-long-passphrase-2026!" }
    });
    assert.equal(untrusted.status, 403);

    const missingOrigin = await fetch(baseUrl + "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "NoOrigin", password: "A-long-passphrase-2026!" })
    });
    assert.equal(missingOrigin.status, 403);

    const nonJson = await fetch(baseUrl + "/api/auth/register", {
        method: "POST",
        headers: { Origin: allowedOrigin },
        body: JSON.stringify({ username: "NoJson", password: "A-long-passphrase-2026!" })
    });
    assert.equal(nonJson.status, 415);

    const accountFileText = fs.readFileSync(accountFile, "utf8");
    assert.equal(accountFileText.includes("A-long-passphrase-2026!"), false);
    assert.equal(accountFileText.includes(owner.cookies.get("csyAccountSession")), false);
    const privateAccountStore = await fetch(baseUrl + "/private-data/accounts.json");
    assert.equal(privateAccountStore.status, 404);

    await stopServer();
    await startServer();

    const accountAfterRestart = await owner.request("/api/auth/me");
    assert.equal(accountAfterRestart.status, 200);
    assert.equal(accountAfterRestart.data.player.id, guestId);
    assert.equal(accountAfterRestart.data.player.profile.displayName, "Card Captain");
    const settingsAfterRestart = await owner.request("/api/account/settings");
    assert.equal(settingsAfterRestart.data.settings.masterVolume, 65);
    assert.equal(settingsAfterRestart.data.settings.reducedMotion, true);

    const matchAfterRestart = await owner.request("/api/multiplayer/current");
    assert.equal(matchAfterRestart.status, 200);
    assert.equal(matchAfterRestart.data.match.id, matchId);

    const duplicateLogin = new Client();
    const wrongPassword = await duplicateLogin.request("/api/auth/login", {
        method: "POST", body: { username: "CardPlayer", password: "not-the-password" }
    });
    assert.equal(wrongPassword.status, 401);

    const login = await duplicateLogin.request("/api/auth/login", {
        method: "POST", body: { username: "cardplayer", password: "A-long-passphrase-2026!" }
    });
    assert.equal(login.status, 200);
    assert.equal(duplicateLogin.cookies.get("csyPlayerId"), guestId);
    assert.equal(duplicateLogin.cookies.has("csyAccountSession"), true);

    const restoredPlayer = await duplicateLogin.request("/api/multiplayer/me");
    assert.equal(restoredPlayer.status, 200);
    assert.equal(restoredPlayer.data.player.id, guestId);

    const changed = await duplicateLogin.request("/api/auth/change-password", {
        method: "POST",
        body: {
            currentPassword: "A-long-passphrase-2026!",
            newPassword: "A-new-secure-passphrase-2026!"
        }
    });
    assert.equal(changed.status, 200);

    const revokedSession = await duplicateLogin.request("/api/auth/me");
    assert.equal(revokedSession.status, 401);
    assert.equal((await owner.request("/api/auth/me")).status, 401, "password change revokes every active session");

    const oldPassword = await new Client().request("/api/auth/login", {
        method: "POST",
        body: { username: "CardPlayer", password: "A-long-passphrase-2026!" }
    });
    assert.equal(oldPassword.status, 401);

    const newPassword = await new Client().request("/api/auth/login", {
        method: "POST",
        body: { username: "CardPlayer", password: "A-new-secure-passphrase-2026!" }
    });
    assert.equal(newPassword.status, 200);

    const signedOut = await newPasswordClientLogout(newPassword);
    assert.equal(signedOut, true);
});

async function newPasswordClientLogout(result) {
    // Logout is verified below using a dedicated client so the cookie jar is explicit.
    const client = new Client();
    const login = await client.request("/api/auth/login", {
        method: "POST", body: { username: "CardPlayer", password: "A-new-secure-passphrase-2026!" }
    });
    assert.equal(login.status, 200);
    const logout = await client.request("/api/auth/logout", { method: "POST", body: {} });
    assert.equal(logout.status, 200);
    assert.equal(client.cookies.has("csyPlayerId"), false);
    assert.equal((await client.request("/api/auth/me")).status, 401);
    return logout.status === 200;
}
