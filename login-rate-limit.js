"use strict";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 10000;

function createRateLimiter({ windowMs = WINDOW_MS, maxEntries = MAX_ENTRIES, limit = 10 } = {}) {
    const attempts = new Map();

    function rateLimited(req) {
        const ip = String(req.headers["cf-connecting-ip"] ||
            String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
            req.socket.remoteAddress || "unknown");
        const now = Date.now();
        for (const [key, value] of attempts) {
            if (value.resetAt <= now) attempts.delete(key);
        }

        let entry = attempts.get(ip);
        if (!entry || entry.resetAt <= now) entry = { count: 0, resetAt: now + windowMs };
        entry.count += 1;
        attempts.delete(ip);
        attempts.set(ip, entry);

        // Bound memory use when requests arrive with many distinct source IPs.
        while (attempts.size > maxEntries) attempts.delete(attempts.keys().next().value);
        return entry.count > limit;
    }

    Object.defineProperty(rateLimited, "size", { get: () => attempts.size });
    return rateLimited;
}

const rateLimited = createRateLimiter();
module.exports = { rateLimited, createRateLimiter };
