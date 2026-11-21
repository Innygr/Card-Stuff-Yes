"use strict";

const crypto = require("node:crypto");

class PostgresCommunityPlayerIdentityStore {
    constructor(pool) {
        if (!pool || typeof pool.query !== "function") {
            throw new TypeError("A PostgreSQL-compatible query pool is required.");
        }
        this.pool = pool;
    }

    async resolveOrCreate({ issuer, externalSubject }) {
        if (typeof issuer !== "string" || issuer.length < 1 || issuer.length > 256 ||
            typeof externalSubject !== "string" || externalSubject.length < 16 || externalSubject.length > 512) {
            throw new TypeError("A trusted issuer and opaque external subject are required.");
        }

        const localPlayerId = crypto.randomUUID();
        const displayName = "Player-" + localPlayerId.slice(0, 8).toUpperCase();
        const result = await this.pool.query(
            `INSERT INTO csy_private.community_player_identities
                (issuer, external_subject, local_player_id, display_name)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (issuer, external_subject)
             DO UPDATE SET issuer = EXCLUDED.issuer
             RETURNING local_player_id, display_name`,
            [issuer, externalSubject, localPlayerId, displayName]
        );
        if (!Array.isArray(result.rows) || result.rows.length !== 1 ||
            typeof result.rows[0].local_player_id !== "string" ||
            typeof result.rows[0].display_name !== "string") {
            throw new Error("Could not resolve the local community player identity.");
        }
        return Object.freeze({
            id: result.rows[0].local_player_id,
            name: result.rows[0].display_name
        });
    }
}

module.exports = { PostgresCommunityPlayerIdentityStore };
