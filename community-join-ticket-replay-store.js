"use strict";

class PostgresJoinTicketReplayStore {
    constructor(pool) {
        if (!pool || typeof pool.query !== "function") {
            throw new TypeError("A PostgreSQL-compatible query pool is required.");
        }
        this.pool = pool;
    }

    async consume(ticket, now = Math.floor(Date.now() / 1000)) {
        if (!ticket || typeof ticket.ticketId !== "string" ||
            !/^[A-Za-z0-9_-]{16,128}$/.test(ticket.ticketId) ||
            !Number.isSafeInteger(ticket.expiresAt) ||
            !Number.isSafeInteger(now)) {
            throw new TypeError("A verified join ticket and valid time are required.");
        }
        if (ticket.expiresAt <= now) return false;

        // A single statement both reclaims expired IDs and atomically claims
        // this ticket ID. The primary key arbitrates concurrent redemptions.
        // Database errors deliberately propagate: callers must fail closed.
        const result = await this.pool.query(
            `WITH expired AS (
                DELETE FROM csy_private.community_join_ticket_uses
                WHERE expires_at <= to_timestamp($2)
            )
            INSERT INTO csy_private.community_join_ticket_uses (ticket_id, expires_at)
            VALUES ($1, to_timestamp($3))
            ON CONFLICT (ticket_id) DO NOTHING
            RETURNING ticket_id`,
            [ticket.ticketId, now, ticket.expiresAt]
        );
        return Array.isArray(result.rows) && result.rows.length === 1;
    }
}

module.exports = { PostgresJoinTicketReplayStore };
