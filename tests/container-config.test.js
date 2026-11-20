"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");

test("package and server CI agree on the supported Node 22 runtime", () => {
    const manifest = JSON.parse(read("package.json"));
    const workflow = read(".github/workflows/multiplayer-check.yml");
    assert.equal(manifest.engines.node, ">=22 <23");
    assert.match(workflow, /node-version:\s*22/);
    assert.match(read("Dockerfile"), /^FROM node:22-alpine/m);
});

test("container runs as an unprivileged user with a real API health check", () => {
    const dockerfile = read("Dockerfile");
    assert.match(dockerfile, /^FROM node:22-alpine/m);
    assert.match(dockerfile, /^USER node$/m);
    assert.match(dockerfile, /npm install --omit=dev/);
    assert.match(dockerfile, /127\.0\.0\.1:6565\/api\/health/);
    assert.doesNotMatch(dockerfile, /npm install[^\n]*--no-package-lock/);
});

test("Compose binds to loopback by default and persists private state", () => {
    const compose = read("compose.yaml");
    assert.match(compose, /\$\{CSY_BIND_ADDRESS:-127\.0\.0\.1\}:6565:6565/);
    assert.match(compose, /card-stuff-yes-data:\/app\/private-data/);
    assert.match(compose, /read_only:\s*true/);
    assert.match(compose, /cap_drop:[\s\S]*?- ALL/);
    assert.match(compose, /no-new-privileges:true/);
    assert.doesNotMatch(compose, /private-logs:/);
});

test("Docker build context excludes runtime data and credentials", () => {
    const ignore = read(".dockerignore");
    for (const entry of [".env", "private-data", "private-logs", "*.pem", "*.key"]) {
        assert.ok(ignore.split(/\r?\n/).includes(entry), `missing .dockerignore entry: ${entry}`);
    }
});
