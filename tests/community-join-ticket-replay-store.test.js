"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { PostgresJoinTicketReplayStore } = require("../community-join-ticket-replay-store");

test("PostgreSQL replay store atomically claims a valid ticket ID", async () => {
    const calls = [];
    const pool = {
        async query(sql, values) {
            calls.push({ sql, values });
            return { rows: [{ ticket_id: values[0] }] };
        }
    };
    const store = new PostgresJoinTicketReplayStore(pool);
    const ticket = { ticketId: "unique_ticket_identifier_123", expiresAt: 1800000060 };
    assert.equal(await store.consume(ticket, 1800000000), true);
    assert.match(calls[0].sql, /ON CONFLICT \(ticket_id\) DO NOTHING/);
    assert.match(calls[0].sql, /DELETE FROM community_join_ticket_uses/);
    assert.deepEqual(calls[0].values, [ticket.ticketId, 1800000000, ticket.expiresAt]);
});

test("PostgreSQL replay store reports a duplicate claim as already consumed", async () => {
    const store = new PostgresJoinTicketReplayStore({
        async query() { return { rows: [] }; }
    });
    assert.equal(await store.consume({
        ticketId: "duplicate_ticket_identifier_123",
        expiresAt: 1800000060
    }, 1800000000), false);
});

test("PostgreSQL replay store does not write already expired tickets", async () => {
    let queried = false;
    const store = new PostgresJoinTicketReplayStore({
        async query() { queried = true; return { rows: [] }; }
    });
    assert.equal(await store.consume({
        ticketId: "expired_ticket_identifier_123",
        expiresAt: 1800000000
    }, 1800000000), false);
    assert.equal(queried, false);
});

test("PostgreSQL replay store fails closed when the database is unavailable", async () => {
    const store = new PostgresJoinTicketReplayStore({
        async query() { throw new Error("database unavailable"); }
    });
    await assert.rejects(store.consume({
        ticketId: "database_failure_ticket_123",
        expiresAt: 1800000060
    }, 1800000000), /database unavailable/);
});

test("PostgreSQL replay store validates inputs and its pool", async () => {
    assert.throws(() => new PostgresJoinTicketReplayStore(null));
    const store = new PostgresJoinTicketReplayStore({ async query() { return { rows: [] }; } });
    await assert.rejects(store.consume({ ticketId: "bad", expiresAt: 1800000060 }, 1800000000), TypeError);
});
