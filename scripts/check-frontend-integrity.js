"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const failures = [];
const htmlFiles = [];
const cssFiles = [];

function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "_site") continue;
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile()) {
            if (entry.name.endsWith(".html")) htmlFiles.push(full);
            if (entry.name.endsWith(".css")) cssFiles.push(full);
        }
    }
}

function localTarget(reference, sourceFile) {
    const value = reference.trim();
    if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) return null;
    const clean = value.split(/[?#]/, 1)[0];
    if (!clean) return null;
    const target = clean.startsWith("/")
        ? path.resolve(root, "." + clean)
        : path.resolve(path.dirname(sourceFile), clean);
    if (target !== root && !target.startsWith(root + path.sep)) {
        failures.push(sourceFile + ": reference escapes site root: " + reference);
        return null;
    }
    return target;
}

function check(reference, sourceFile, kind) {
    const target = localTarget(reference, sourceFile);
    if (!target) return;
    const candidates = [target];
    if (kind === "navigation" && reference.endsWith("/")) candidates.push(path.join(target, "index.html"));
    if (!candidates.some(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile())) {
        failures.push(path.relative(root, sourceFile) + ": missing " + kind + " " + reference);
    }
}

walk(root);

for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    for (const match of html.matchAll(/<(script|img|source|audio|video|iframe)\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) {
        check(match[2], file, match[1].toLowerCase() + " source");
    }
    for (const match of html.matchAll(/<link\b([^>]*?)\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
        if (/\b(?:stylesheet|icon|preload|manifest)\b/i.test(match[1])) check(match[2], file, "link asset");
    }
}

for (const file of cssFiles) {
    const css = fs.readFileSync(file, "utf8");
    if (/^\\s*```/.test(css) || /```\\s*$/.test(css)) {
        failures.push(path.relative(root, file) + ": CSS contains Markdown code fences; remove the wrapper.");
    }
    for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
        check(match[1], file, "CSS asset");
    }
    for (const match of css.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']/gi)) {
        check(match[1], file, "CSS import");
    }
}

if (failures.length) {
    console.error("Frontend integrity check failed:");
    for (const failure of failures) console.error(" - " + failure);
    process.exitCode = 1;
} else {
    console.log("Frontend integrity check passed: " + htmlFiles.length + " HTML files and " + cssFiles.length + " CSS files scanned.");
}
