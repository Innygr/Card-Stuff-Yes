"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { isLocalHost, parseAppUrl, shouldOpenExternally, shouldAllowNavigation } = require("./url-policy");

test("accepts HTTPS application URLs", () => {
    assert.equal(parseAppUrl("https://example.test/game").origin, "https://example.test");
});

test("allows plain HTTP only on loopback development hosts", () => {
    assert.equal(parseAppUrl("http://localhost:8080").hostname, "localhost");
    assert.equal(parseAppUrl("http://127.0.0.1:8080").hostname, "127.0.0.1");
    assert.equal(parseAppUrl("http://[::1]:8080").hostname, "[::1]");
    assert.throws(() => parseAppUrl("http://example.test"), /HTTPS/);
});

test("recognizes IPv4 and IPv6 loopback host forms", () => {
    assert.equal(isLocalHost("localhost"), true);
    assert.equal(isLocalHost("127.0.0.1"), true);
    assert.equal(isLocalHost("::1"), true);
    assert.equal(isLocalHost("[::1]"), true);
    assert.equal(isLocalHost("127.0.0.2"), false);
    assert.equal(isLocalHost("localhost.example.test"), false);
});

test("rejects malformed URLs and embedded credentials", () => {
    assert.throws(() => parseAppUrl("not a url"), /valid absolute URL/);
    assert.throws(() => parseAppUrl("https://user:pass@example.test"), /credentials/);
});

test("keeps navigation on the configured origin", () => {
    const appUrl = parseAppUrl("https://example.test");
    assert.equal(shouldAllowNavigation("https://example.test/account", appUrl), true);
    assert.equal(shouldAllowNavigation("https://other.test", appUrl), false);
    assert.equal(shouldAllowNavigation("javascript:alert(1)", appUrl), false);
    assert.equal(shouldAllowNavigation("https://example.test:444/account", appUrl), false);
});

test("opens only external HTTPS links outside the app", () => {
    const appUrl = parseAppUrl("https://example.test");
    assert.equal(shouldOpenExternally("https://other.test/path", appUrl), true);
    assert.equal(shouldOpenExternally("https://example.test/path", appUrl), false);
    assert.equal(shouldOpenExternally("http://other.test", appUrl), false);
    assert.equal(shouldOpenExternally("javascript:alert(1)", appUrl), false);
    assert.equal(shouldOpenExternally("mailto:user@example.test", appUrl), false);
});

test("allows localhost-to-localhost navigation during development", () => {
    const appUrl = parseAppUrl("http://localhost:3000");
    assert.equal(shouldAllowNavigation("http://127.0.0.1:6565/api-docs", appUrl), true);
    assert.equal(shouldAllowNavigation("http://[::1]:6565/api-docs", appUrl), true);
    assert.equal(shouldAllowNavigation("http://example.test", appUrl), false);
});
