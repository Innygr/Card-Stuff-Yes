"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createRateLimiter } = require("../login-rate-limit");

function requestFor(ip) {
    return { headers: { "x-forwarded-for": ip }, socket: { remoteAddress: "127.0.0.1" } };
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
