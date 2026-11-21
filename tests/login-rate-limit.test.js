"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createRateLimiter } = require("../login-rate-limit");

function requestFor(ip) {
    return { headers: {}, socket: { remoteAddress: ip } };
}

test("login rate limiter blocks attempts after the configured threshold", () => {
    const rateLimited = createRateLimiter({ limit: 2 });
    const request = requestFor("192.0.2.10");
    assert.equal(rateLimited(request), false);
    assert.equal(rateLimited(request), false);
    assert.equal(rateLimited(request), true);
});

test("login rate limiter bounds memory for many distinct source addresses", () => {
    const rateLimited = createRateLimiter({ maxEntries: 25, limit: 10 });
    for (let index = 0; index < 100; index += 1) {
        rateLimited(requestFor("192.0.2." + index));
    }
    assert.equal(rateLimited.size, 25);
    // Eviction is oldest-first; a new address must not grow the map.
    rateLimited(requestFor("198.51.100.1"));
    assert.equal(rateLimited.size, 25);
});

test("login rate limiter resets an address after the window expires", () => {
    let clock = 1000;
    const rateLimited = createRateLimiter({ limit: 1, windowMs: 500, now: () => clock });
    const request = requestFor("192.0.2.20");
    assert.equal(rateLimited(request), false);
    assert.equal(rateLimited(request), true);
    clock += 500;
    assert.equal(rateLimited(request), false);
    assert.equal(rateLimited.size, 1);
});

test("untrusted forwarded headers cannot rotate a caller's rate-limit identity", () => {
    const rateLimited = createRateLimiter({ limit: 1, trustProxy: false });
    const request = forwarded => ({
        headers: {
            "cf-connecting-ip": forwarded,
            "x-forwarded-for": forwarded
        },
        socket: { remoteAddress: "192.0.2.30" }
    });
    assert.equal(rateLimited(request("198.51.100.1")), false);
    assert.equal(rateLimited(request("198.51.100.2")), true);
    assert.equal(rateLimited.size, 1);
});

test("trusted proxy mode uses the configured proxy client-address header", () => {
    const rateLimited = createRateLimiter({ limit: 1, trustProxy: true });
    const request = forwarded => ({
        headers: {
            "cf-connecting-ip": forwarded,
            "x-forwarded-for": forwarded
        },
        socket: { remoteAddress: "127.0.0.1" }
    });
    assert.equal(rateLimited(request("198.51.100.1")), false);
    assert.equal(rateLimited(request("198.51.100.2")), false);
    assert.equal(rateLimited(request("198.51.100.1")), true);
    assert.equal(rateLimited.size, 2);
});
