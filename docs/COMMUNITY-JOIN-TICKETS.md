# Community join-ticket protocol foundation

The server now contains a standalone Ed25519 join-ticket module in
`community-join-tickets.js`. It is a protocol primitive, **not an enabled
federation feature**. The current multiplayer API still uses its existing
local guest identity flow.

## Ticket properties

- Ed25519 signatures with a fixed `EdDSA` algorithm and a key ID (`kid`).
- Exact issuer and server-audience checks.
- A narrowly scoped `game:join` permission.
- Opaque subject identifiers; do not put email addresses, account IDs, names,
  credentials, or other personal information in the subject.
- Issued-at, not-before, expiry, and unique ticket ID claims.
- Maximum lifetime of 120 seconds (60 seconds by default).
- Verification rejects unknown keys, altered claims, wrong audiences, invalid
  signatures, and tickets outside their validity window.

## Replay protection

Two replay-store implementations are available:

- `JoinTicketReplayGuard` is a bounded in-memory guard for unit tests and
  single-process prototypes. It does not survive restarts or coordinate
  multiple processes.
- `PostgresJoinTicketReplayStore` uses the unique primary key in
  `csy_private.community_join_ticket_uses` to atomically claim a ticket ID across
  processes. It also removes expired rows during redemption. Database errors
  propagate so callers can fail closed.

The PostgreSQL store requires migration
`004_community_join_ticket_uses.sql` to be applied to the community host's
database before use. It accepts a PostgreSQL-compatible pool by dependency
injection and does not create a connection or apply migrations itself. Do not
treat the in-memory guard as a production substitute.

## Key handling and deployment

- The account authority keeps the Ed25519 private key. Never distribute it to
  community hosts or commit it to this repository.
- Community hosts receive only trusted public keys, distributed through an
  authenticated key-rotation mechanism.
- Bind each ticket to one exact server ID; do not accept wildcard audiences.
- Use TLS, strict request schemas, rate limits, and audit events around ticket
  redemption.
- Do not forward official account cookies or general-purpose API credentials.

## Not implemented yet

The ticket verifier and PostgreSQL replay-store primitive are not wired into matchmaking or account authentication. There is
no production issuer endpoint, public-key discovery/rotation endpoint, durable
replay store, ticket redemption route, or end-to-end community-hosting flow.
Those must be implemented and security-tested before community servers are
advertised as supported.
