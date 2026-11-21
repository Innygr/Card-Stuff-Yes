"use strict";

const crypto = require("node:crypto");
const { issueJoinTicket } = require("./community-join-tickets");

const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

function requireSecret(value, label) {
    if (typeof value !== "string" || value.length < 32) {
        throw new Error(label + " must be configured with at least 32 characters.");
    }
    return value;
}

function validateSigningKey(privateKey, keyId) {
    if (!privateKey || typeof privateKey !== "object" ||
        privateKey.asymmetricKeyType !== "ed25519" ||
        privateKey.type !== "private") {
        throw new TypeError("Every join-ticket signing key must be an Ed25519 private key.");
    }
    if (typeof keyId !== "string" || !KEY_ID_PATTERN.test(keyId)) {
        throw new TypeError("Every signing key must have a valid key ID.");
    }
    const publicJwk = crypto.createPublicKey(privateKey).export({ format: "jwk" });
    return Object.freeze({
        keyId,
        privateKey,
        publicJwk: Object.freeze({
            kty: publicJwk.kty,
            crv: publicJwk.crv,
            x: publicJwk.x,
            use: "sig",
            alg: "EdDSA",
            kid: keyId
        })
    });
}

function createCommunityJoinIssuer({
    privateKey,
    keyId,
    signingKeys,
    activeKeyId,
    issuer,
    subjectSecret,
    now = () => Math.floor(Date.now() / 1000)
}) {
    if (typeof issuer !== "string" || issuer.length < 1 || issuer.length > 256) {
        throw new TypeError("A valid issuer identifier is required.");
    }
    requireSecret(subjectSecret, "The account-subject HMAC secret");
    if (typeof now !== "function") throw new TypeError("A clock function is required.");

    // Preserve the original single-key API while supporting an explicit
    // overlap set for planned rotation. Only the selected active key signs.
    const configuredKeys = signingKeys === undefined
        ? [{ privateKey, keyId }]
        : signingKeys;
    if (!Array.isArray(configuredKeys) || configuredKeys.length < 1 || configuredKeys.length > 32) {
        throw new TypeError("Between 1 and 32 Ed25519 signing keys are required.");
    }
    const keys = new Map();
    for (const item of configuredKeys) {
        if (!item || typeof item !== "object") {
            throw new TypeError("Every signing key entry must be an object.");
        }
        const validated = validateSigningKey(item.privateKey, item.keyId);
        if (keys.has(validated.keyId)) {
            throw new TypeError("Signing key IDs must be unique.");
        }
        keys.set(validated.keyId, validated);
    }
    const selectedKeyId = activeKeyId === undefined ? keyId : activeKeyId;
    if (typeof selectedKeyId !== "string" || !keys.has(selectedKeyId)) {
        throw new TypeError("The active signing key ID must identify a configured key.");
    }
    const activeKey = keys.get(selectedKeyId);
    const publicKeySet = Object.freeze({
        keys: Object.freeze([...keys.values()].map(item => item.publicJwk))
    });

    function opaqueSubject(accountId, serverId) {
        if (typeof accountId !== "string" || accountId.length < 1 || accountId.length > 256 ||
            typeof serverId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(serverId)) {
            throw new TypeError("A valid account reference and exact server ID are required.");
        }
        return crypto.createHmac("sha256", subjectSecret)
            .update(serverId, "utf8")
            .update("\\0")
            .update(accountId, "utf8")
            .digest("base64url");
    }

    return Object.freeze({
        publicKeySet,
        activeKeyId: selectedKeyId,
        issueForAccount({ accountId, serverId }) {
            const subject = opaqueSubject(accountId, serverId);
            return issueJoinTicket({
                privateKey: activeKey.privateKey,
                keyId: activeKey.keyId,
                issuer,
                audience: serverId,
                subject,
                now: now(),
                lifetimeSeconds: 60
            });
        }
    });
}

function createCommunityJoinIssuerFromEnvironment({ now } = {}) {
    const issuer = process.env.CSY_JOIN_ISSUER;
    const subjectSecret = process.env.CSY_JOIN_SUBJECT_SECRET;
    if (!issuer || !subjectSecret) {
        throw new Error("Community join issuer environment is incomplete.");
    }

    // JSON format: [{"kid":"old","privateKey":"-----BEGIN PRIVATE KEY..."},
    //               {"kid":"new","privateKey":"-----BEGIN PRIVATE KEY..."}]
    // The active ID is separate so operators can publish overlap keys before
    // switching issuance. Legacy single-key variables remain supported.
    const keyDocument = process.env.CSY_JOIN_SIGNING_KEYS;
    if (keyDocument) {
        let entries;
        try {
            entries = JSON.parse(keyDocument);
        } catch {
            throw new Error("CSY_JOIN_SIGNING_KEYS must contain valid JSON.");
        }
        if (!Array.isArray(entries)) {
            throw new Error("CSY_JOIN_SIGNING_KEYS must be a JSON array.");
        }
        const signingKeys = entries.map(entry => {
            if (!entry || typeof entry.kid !== "string" ||
                typeof entry.privateKey !== "string" || !entry.privateKey.trim()) {
                throw new Error("Every configured signing key needs a kid and PEM privateKey.");
            }
            return {
                keyId: entry.kid,
                privateKey: crypto.createPrivateKey(entry.privateKey)
            };
        });
        return createCommunityJoinIssuer({
            signingKeys,
            activeKeyId: process.env.CSY_JOIN_ACTIVE_KEY_ID,
            issuer,
            subjectSecret,
            now
        });
    }

    const pem = process.env.CSY_JOIN_SIGNING_PRIVATE_KEY;
    const keyId = process.env.CSY_JOIN_SIGNING_KEY_ID;
    if (!pem || !keyId) {
        throw new Error("Community join issuer signing-key environment is incomplete.");
    }
    return createCommunityJoinIssuer({
        privateKey: crypto.createPrivateKey(pem),
        keyId,
        issuer,
        subjectSecret,
        now
    });
}

module.exports = { createCommunityJoinIssuer, createCommunityJoinIssuerFromEnvironment };
