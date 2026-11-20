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

`JoinTicketReplayGuard` provides a bounded, in-process one-time-use guard for
verified tickets. It is suitable for unit tests and a single-process prototype
only. It is **not** shared across multiple server processes and does not
survive restarts. A production community host must use an atomic shared
single-use store (for example, a database uniqueness constraint or equivalent
transactional primitive) and must fail closed if that store is unavailable.

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

The module is not wired into matchmaking or account authentication. There is
no production issuer endpoint, public-key discovery/rotation endpoint, durable
replay store, ticket redemption route, or end-to-end community-hosting flow.
Those must be implemented and security-tested before community servers are
advertised as supported.
