"use strict";

const crypto = require("node:crypto");
const { issueJoinTicket } = require("./community-join-tickets");

function requireSecret(value, label) {
    if (typeof value !== "string" || value.length < 32) {
        throw new Error(label + " must be configured with at least 32 characters.");
    }
    return value;
}

function createCommunityJoinIssuer({
    privateKey,
    keyId,
    issuer,
    subjectSecret,
    now = () => Math.floor(Date.now() / 1000)
}) {
    if (!privateKey || typeof privateKey !== "object") {
        throw new TypeError("An Ed25519 private key is required.");
    }
    if (privateKey.asymmetricKeyType !== "ed25519") {
        throw new TypeError("The join-ticket signing key must be Ed25519.");
    }
    if (typeof keyId !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(keyId)) {
        throw new TypeError("A valid signing key ID is required.");
    }
    if (typeof issuer !== "string" || issuer.length < 1 || issuer.length > 256) {
        throw new TypeError("A valid issuer identifier is required.");
    }
    requireSecret(subjectSecret, "The account-subject HMAC secret");
    if (typeof now !== "function") throw new TypeError("A clock function is required.");

    const publicKey = crypto.createPublicKey(privateKey);
    const publicJwk = publicKey.export({ format: "jwk" });
    const publicKeySet = Object.freeze({
        keys: Object.freeze([Object.freeze({
            kty: publicJwk.kty,
            crv: publicJwk.crv,
            x: publicJwk.x,
            use: "sig",
            alg: "EdDSA",
            kid: keyId
        })])
    });

    function opaqueSubject(accountId, serverId) {
        if (typeof accountId !== "string" || accountId.length < 1 || accountId.length > 256 ||
            typeof serverId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(serverId)) {
            throw new TypeError("A valid account reference and exact server ID are required.");
        }
        return crypto.createHmac("sha256", subjectSecret)
            .update(serverId, "utf8")
            .update("\0")
            .update(accountId, "utf8")
            .digest("base64url");
    }

    return Object.freeze({
        publicKeySet,
        issueForAccount({ accountId, serverId }) {
            const subject = opaqueSubject(accountId, serverId);
            return issueJoinTicket({
                privateKey,
                keyId,
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
    const pem = process.env.CSY_JOIN_SIGNING_PRIVATE_KEY;
    const keyId = process.env.CSY_JOIN_SIGNING_KEY_ID;
    const issuer = process.env.CSY_JOIN_ISSUER;
    const subjectSecret = process.env.CSY_JOIN_SUBJECT_SECRET;
    if (!pem || !keyId || !issuer || !subjectSecret) {
        throw new Error("Community join issuer environment is incomplete.");
    }
    const privateKey = crypto.createPrivateKey(pem);
    return createCommunityJoinIssuer({ privateKey, keyId, issuer, subjectSecret, now });
}

module.exports = { createCommunityJoinIssuer, createCommunityJoinIssuerFromEnvironment };
