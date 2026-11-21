"use strict";

const MAX_BODY_BYTES = 8192;

function writeJson(res, status, body) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
    });
    res.end(JSON.stringify(body));
}

function createCommunityJoinHttpHandler({ redeemer, provisionPlayer, rateLimit, establishSession = async () => {} }) {
    if (!redeemer || typeof redeemer.redeem !== "function") {
        throw new TypeError("A configured community join redeemer is required.");
    }
    if (typeof provisionPlayer !== "function") {
        throw new TypeError("A local player provisioning function is required.");
    }
    if (typeof rateLimit !== "function") {
        throw new TypeError("A request rate-limit function is required.");
    }

    return async function handleCommunityJoin(req, res) {
        if (req.method !== "POST") {
            writeJson(res, 405, { error: "Method not allowed." });
            return true;
        }
        if (!/^application\/json(?:\s*;|\s*$)/i.test(String(req.headers["content-type"] || ""))) {
            writeJson(res, 415, { error: "Content-Type must be application/json." });
            return true;
        }
        let allowed;
        try {
            allowed = await rateLimit(req);
        } catch {
            writeJson(res, 503, { error: "Community sign-in is temporarily unavailable." });
            return true;
        }
        if (allowed !== true) {
            writeJson(res, 429, { error: "Too many sign-in attempts. Try again shortly." });
            return true;
        }

        let raw = "";
        let size = 0;
        try {
            for await (const chunk of req) {
                size += chunk.length;
                if (size > MAX_BODY_BYTES) {
                    writeJson(res, 413, { error: "Request body is too large." });
                    return true;
                }
                raw += chunk.toString("utf8");
            }
        } catch {
            writeJson(res, 400, { error: "Could not read request body." });
            return true;
        }

        let body;
        try {
            body = JSON.parse(raw);
        } catch {
            writeJson(res, 400, { error: "Request body must be valid JSON." });
            return true;
        }
        if (!body || typeof body !== "object" || Array.isArray(body) ||
            Object.keys(body).some(key => key !== "ticket") ||
            typeof body.ticket !== "string" || body.ticket.length < 32 || body.ticket.length > 8192) {
            writeJson(res, 400, { error: "Provide only a valid join ticket." });
            return true;
        }

        let redemption;
        try {
            redemption = await redeemer.redeem(body.ticket);
        } catch {
            // Do not disclose token-verification details or database errors.
            writeJson(res, 503, { error: "Community sign-in is temporarily unavailable." });
            return true;
        }
        if (!redemption || redemption.accepted !== true ||
            !redemption.player || typeof redemption.player.externalSubject !== "string") {
            writeJson(res, 401, { error: "This sign-in ticket is invalid, expired, or already used." });
            return true;
        }

        try {
            const player = await provisionPlayer({
                externalSubject: redemption.player.externalSubject,
                issuer: redemption.player.issuer,
                serverId: redemption.player.serverId
            });
            if (!player || typeof player.id !== "string" || typeof player.name !== "string") {
                throw new Error("Local player provisioning returned an invalid player.");
            }
            await establishSession(req, res, player);
            writeJson(res, 200, {
                player: { id: player.id, name: player.name },
                serverId: redemption.player.serverId
            });
        } catch {
            // Ticket consumption is intentionally not rolled back. Retrying a
            // consumed ticket must never create duplicate identities.
            writeJson(res, 503, { error: "Could not create a local player. Request a new sign-in ticket." });
        }
        return true;
    };
}

module.exports = { createCommunityJoinHttpHandler, MAX_BODY_BYTES };
