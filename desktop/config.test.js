"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const mainSource = fs.readFileSync(path.join(root, "main.js"), "utf8");

test("desktop package targets Windows NSIS and Linux AppImage/DEB", () => {
    assert.deepEqual(pkg.build.win.target[0], { target: "nsis", arch: ["x64"] });
    assert.equal(pkg.build.deb.maintainer, "Team Blacklight");
    assert.ok(pkg.scripts["dist:win"].includes("--win nsis --x64"));
    assert.ok(pkg.scripts["dist:linux"].includes("--linux AppImage deb --x64"));
});

test("local distribution scripts explicitly disable publishing", () => {
    assert.ok(pkg.scripts["dist:win"].includes("--publish never"));
    assert.ok(pkg.scripts["dist:linux"].includes("--publish never"));
});

test("Electron renderer keeps its security boundaries enabled", () => {
    assert.match(mainSource, /contextIsolation:\s*true/);
    assert.match(mainSource, /nodeIntegration:\s*false/);
    assert.match(mainSource, /sandbox:\s*true/);
    assert.match(mainSource, /webSecurity:\s*true/);
});

test("desktop process enforces single-instance, navigation guards, and recoverable load failures", () => {
    assert.match(mainSource, /requestSingleInstanceLock\(\)/);
    assert.match(mainSource, /on\("will-redirect",\s*guardNavigation\)/);
    assert.match(mainSource, /on\("will-navigate",\s*guardNavigation\)/);
    assert.match(mainSource, /did-fail-load/);
    assert.match(mainSource, /buttons:\s*\["Retry",\s*"Quit"\]/);
    assert.match(mainSource, /offline play is not available yet/i);
});

test("preload exposes no privileged renderer bridge", () => {
    const preloadSource = fs.readFileSync(path.join(root, "preload.js"), "utf8");
    assert.doesNotMatch(preloadSource, /contextBridge|ipcRenderer|require\s*\(/);
});
