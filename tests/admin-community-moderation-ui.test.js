"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const script = fs.readFileSync(path.join(root, "admin.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "admin.css"), "utf8");
const apiDocs = fs.readFileSync(path.join(root, "docs", "COMMUNITY-SERVER-API.md"), "utf8");

test("admin page exposes the community moderation section and accessible status", () => {
    assert.match(html, /id="community-servers-section"/);
    assert.match(html, /id="community-servers-refresh"/);
    assert.match(html, /id="community-servers-updated"[^>]*aria-live="polite"/);
    assert.match(html, /id="community-servers-list"/);
});

test("moderation UI calls the documented operator endpoints", () => {
    assert.match(script, /\/api\/admin\/community-servers/);
    assert.match(script, /\/events/);
    assert.match(script, /"approve"/);
    assert.match(script, /"revoke"/);
    assert.match(apiDocs, /### Admin panel workflow[\s\S]*?\*\*Community Server Moderation\*\*/);
});

test("moderation UI renders server-controlled values as text, not HTML", () => {
    assert.match(script, /function addCommunityDetail\(container, label, value\)/);
    assert.match(script, /createTextNode\(/);
    assert.match(script, /title\.textContent = server\.displayName/);
    assert.match(script, /item\.textContent = when \+/);
    assert.doesNotMatch(script, /innerHTML\s*=\s*[^\n]*server\./);
});

test("moderation actions require confirmation and constrain revocation reasons", () => {
    assert.match(script, /confirm\("Approve this verified server/);
    assert.match(script, /confirm\("Revoke this community server/);
    assert.match(script, /reason\.length > 240/);
});

test("moderation panel styles status, action, and history elements", () => {
    assert.match(styles, /\.community-server-card/);
    assert.match(styles, /\.community-server-status\.status-approved/);
    assert.match(styles, /\.danger-button/);
    assert.match(styles, /\.community-server-history/);
});

test("failed moderation history loads can be retried when expanded again", () => {
    assert.match(script, /loadCommunityServerEvents\(server\.serverId, events\)\.then\(loaded =>/);
    assert.match(script, /else delete history\.dataset\.loaded/);
});
