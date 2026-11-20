"use strict";

const crypto = require("node:crypto");

const MAX_TICKET_LIFETIME_SECONDS = 120;
const CLOCK_SKEW_SECONDS = 5;
const TOKEN_TYPE = "CSY-JOIN";

function encode(value) {
    return Buffer.from(value).toString("base64url");
}

function decodeJson(value) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
        throw new Error("Malformed ticket encoding.");
    }
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function issueJoinTicket({
    privateKey,
    keyId,
    issuer,
    audience,
    subject,
    now = Math.floor(Date.now() / 1000),
    lifetimeSeconds = 60,
    ticketId = crypto.randomUUID()
}) {
    if (!privateKey || !keyId || !issuer || !audience || !subject) {
        throw new TypeError("Signing key, key ID, issuer, audience, and opaque subject are required.");
    }
    if (!Number.isSafeInteger(now) || !Number.isInteger(lifetimeSeconds) ||
        lifetimeSeconds < 1 || lifetimeSeconds > MAX_TICKET_LIFETIME_SECONDS) {
        throw new RangeError("Join ticket lifetime must be between 1 and 120 seconds.");
    }
    if (typeof ticketId !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(ticketId)) {
        throw new TypeError("Ticket ID must be an opaque URL-safe value.");
    }

    const header = { alg: "EdDSA", typ: TOKEN_TYPE, kid: keyId };
    const payload = {
        iss: issuer,
        aud: audience,
        sub: subject,
        iat: now,
        nbf: now,
        exp: now + lifetimeSeconds,
        jti: ticketId,
        scope: "game:join"
    };
    const signingInput = encode(JSON.stringify(header)) + "." + encode(JSON.stringify(payload));
    const signature = crypto.sign(null, Buffer.from(signingInput), privateKey);
    return signingInput + "." + signature.toString("base64url");
}

function verifyJoinTicket(token, {
    publicKeys,
    issuer,
    audience,
    now = Math.floor(Date.now() / 1000),
    clockSkewSeconds = CLOCK_SKEW_SECONDS
}) {
    if (typeof token !== "string" || token.length > 4096) throw new Error("Invalid join ticket.");
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Malformed join ticket.");

    const header = decodeJson(parts[0]);
    const payload = decodeJson(parts[1]);
    if (!header || header.alg !== "EdDSA" || header.typ !== TOKEN_TYPE ||
        typeof header.kid !== "string" || !publicKeys || !publicKeys[header.kid]) {
        throw new Error("Untrusted join ticket signing key.");
    }
    if (!/^[A-Za-z0-9_-]+$/.test(parts[2])) throw new Error("Malformed ticket signature.");
    const signingInput = parts[0] + "." + parts[1];
    const signature = Buffer.from(parts[2], "base64url");
    if (!crypto.verify(null, Buffer.from(signingInput), publicKeys[header.kid], signature)) {
        throw new Error("Invalid join ticket signature.");
    }

    if (payload.iss !== issuer || payload.aud !== audience || payload.scope !== "game:join") {
        throw new Error("Join ticket is not valid for this server or purpose.");
    }
    if (typeof payload.sub !== "string" || payload.sub.length < 1 || payload.sub.length > 128 ||
        typeof payload.jti !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(payload.jti) ||
        !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.nbf) ||
        !Number.isSafeInteger(payload.exp)) {
        throw new Error("Invalid join ticket claims.");
    }
    if (payload.exp <= payload.iat || payload.exp - payload.iat > MAX_TICKET_LIFETIME_SECONDS ||
        payload.nbf > payload.exp || payload.iat > now + clockSkewSeconds ||
        payload.nbf > now + clockSkewSeconds || payload.exp < now - clockSkewSeconds) {
        throw new Error("Join ticket is expired or outside its validity window.");
    }
    return Object.freeze({
        issuer: payload.iss,
        audience: payload.aud,
        subject: payload.sub,
        ticketId: payload.jti,
        expiresAt: payload.exp,
        scope: payload.scope
    });
}

class JoinTicketReplayGuard {
    constructor({ maxEntries = 100000 } = {}) {
        if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 1000000) {
            throw new RangeError("Replay guard capacity must be between 1 and 1,000,000.");
        }
        this.maxEntries = maxEntries;
        this.used = new Map();
    }

    consume(ticket, now = Math.floor(Date.now() / 1000)) {
        if (!ticket || typeof ticket.ticketId !== "string" ||
            !Number.isSafeInteger(ticket.expiresAt) || !Number.isSafeInteger(now)) {
            throw new TypeError("A verified join ticket and valid time are required.");
        }
        for (const [id, expiry] of this.used) {
            if (expiry < now) this.used.delete(id);
        }
        if (ticket.expiresAt < now || this.used.has(ticket.ticketId)) return false;
        if (this.used.size >= this.maxEntries) return false;
        this.used.set(ticket.ticketId, ticket.expiresAt);
        return true;
    }
}

module.exports = {
    MAX_TICKET_LIFETIME_SECONDS,
    issueJoinTicket,
    verifyJoinTicket,
    JoinTicketReplayGuard
};
