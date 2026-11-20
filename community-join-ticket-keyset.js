"use strict";

const crypto = require("node:crypto");

const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

function importCommunityJoinPublicKeys(document) {
    if (!document || typeof document !== "object" || Array.isArray(document) ||
        !Array.isArray(document.keys) || document.keys.length < 1 || document.keys.length > 32) {
        throw new TypeError("A community join public-key set with 1 to 32 keys is required.");
    }

    const keys = Object.create(null);
    for (const jwk of document.keys) {
        if (!jwk || typeof jwk !== "object" || Array.isArray(jwk) ||
            jwk.kty !== "OKP" || jwk.crv !== "Ed25519" ||
            jwk.use !== "sig" || jwk.alg !== "EdDSA" ||
            typeof jwk.kid !== "string" || !KEY_ID_PATTERN.test(jwk.kid) ||
            typeof jwk.x !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(jwk.x) ||
            Object.prototype.hasOwnProperty.call(jwk, "d")) {
            throw new TypeError("The community join key set contains an invalid or private key.");
        }
        if (Object.prototype.hasOwnProperty.call(keys, jwk.kid)) {
            throw new TypeError("The community join key set contains a duplicate key ID.");
        }
        const key = crypto.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: jwk.x }, format: "jwk" });
        if (key.asymmetricKeyType !== "ed25519") {
            throw new TypeError("Community join public keys must use Ed25519.");
        }
        keys[jwk.kid] = key;
    }
    return Object.freeze(keys);
}

module.exports = { importCommunityJoinPublicKeys };
