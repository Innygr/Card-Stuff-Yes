"use strict";

const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { test } = require("node:test");
const { createCommunityJoinHttpHandler, MAX_BODY_BYTES } = require("../community-join-http");

function request(body, { method = "POST", contentType = "application/json" } = {}) {
    const req = Readable.from(body === null ? [] : [Buffer.from(typeof body === "string" ? body : JSON.stringify(body))]);
    req.method = method;
    req.headers = { "content-type": contentType };
    return req;
}

function response() {
    return {
        status: 0,
        headers: {},
        body: "",
        writeHead(status, headers) { this.status = status; this.headers = { ...this.headers, ...headers }; },
        setHeader(name, value) { this.headers[name] = value; },
        end(body) { this.body = body || ""; }
    };
}

function handler(overrides = {}) {
    const calls = { provision: [], rate: 0, redeem: [], session: [] };
    const value = createCommunityJoinHttpHandler({
        redeemer: {
            async redeem(token) {
                calls.redeem.push(token);
                return { accepted: true, player: {
                    externalSubject: "opaque-subject", issuer: "https://accounts.example.test",
                    serverId: "community:test"
                }};
            }
        },
        async provisionPlayer(identity) {
            calls.provision.push(identity);
            return { id: "local-player-1", name: "Player One", secret: "must-not-leak" };
        },
        async rateLimit() { calls.rate += 1; return true; },
        async establishSession(req, res, player) { calls.session.push(player.id); res.setHeader("Set-Cookie", "csyPlayerId=" + player.id); },
        ...overrides
    });
    return { handle: value, calls };
}

test("community join HTTP handler redeems ticket and exposes only local public player fields", async () => {
    const f = handler();
    const res = response();
    assert.equal(await f.handle(request({ ticket: "t".repeat(64) }), res), true);
    assert.equal(res.status, 200);
    assert.equal(res.headers["Cache-Control"], "no-store");
    assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
    assert.deepEqual(JSON.parse(res.body), {
        player: { id: "local-player-1", name: "Player One" },
        serverId: "community:test"
    });
    assert.deepEqual(f.calls.provision, [{
        externalSubject: "opaque-subject",
        issuer: "https://accounts.example.test",
        serverId: "community:test"
    }]);
    assert.deepEqual(f.calls.redeem, ["t".repeat(64)]);
    assert.deepEqual(f.calls.session, ["local-player-1"]);
});

test("community join HTTP handler rejects wrong method and content type before rate limiting", async () => {
    const f = handler();
    let res = response();
    await f.handle(request({}, { method: "GET" }), res);
    assert.equal(res.status, 405);
    res = response();
    await f.handle(request({}, { contentType: "text/plain" }), res);
    assert.equal(res.status, 415);
    assert.equal(f.calls.rate, 0);
});

test("community join HTTP handler rate limits before reading or redeeming", async () => {
    const f = handler({ async rateLimit() { return false; } });
    const res = response();
    await f.handle(request({ ticket: "t".repeat(64) }), res);
    assert.equal(res.status, 429);
    assert.equal(f.calls.redeem.length, 0);
});

test("community join HTTP handler rejects malformed, oversized and extra-field bodies", async () => {
    const f = handler();
    let res = response();
    await f.handle(request("{"), res);
    assert.equal(res.status, 400);
    res = response();
    await f.handle(request({ ticket: "t".repeat(64), accountId: "forged" }), res);
    assert.equal(res.status, 400);
    res = response();
    await f.handle(request("x".repeat(MAX_BODY_BYTES + 1)), res);
    assert.equal(res.status, 413);
    assert.equal(f.calls.redeem.length, 0);
});

test("community join HTTP handler rejects invalid and replayed tickets without provisioning", async () => {
    const f = handler({ redeemer: { async redeem() {
        return { accepted: false, reason: "ticket_already_used_or_expired" };
    }}});
    const res = response();
    await f.handle(request({ ticket: "t".repeat(64) }), res);
    assert.equal(res.status, 401);
    assert.equal(f.calls.provision.length, 0);
});

test("community join HTTP handler hides redemption storage errors", async () => {
    const f = handler({ redeemer: { async redeem() { throw new Error("database password must not leak"); } } });
    const res = response();
    await f.handle(request({ ticket: "t".repeat(64) }), res);
    assert.equal(res.status, 503);
    assert.doesNotMatch(res.body, /password|database/i);
});

test("community join HTTP handler asks for a new ticket if local provisioning fails", async () => {
    const f = handler({ async provisionPlayer() { throw new Error("local persistence failed"); } });
    const res = response();
    await f.handle(request({ ticket: "t".repeat(64) }), res);
    assert.equal(res.status, 503);
    assert.match(res.body, /new sign-in ticket/i);
});

test("community join HTTP handler validates dependencies", () => {
    assert.throws(() => createCommunityJoinHttpHandler({}), /redeemer/);
    assert.throws(() => createCommunityJoinHttpHandler({
        redeemer: { redeem() {} }, rateLimit() {}
    }), /provisioning/);
});
