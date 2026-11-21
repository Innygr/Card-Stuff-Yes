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


## Official issuer primitive

`community-join-ticket-issuer.js` adds an isolated issuer factory. It accepts
an Ed25519 private key, a key ID, an issuer identifier, and a separate
high-entropy HMAC secret. The environment factory reads:

- `CSY_JOIN_SIGNING_PRIVATE_KEY`: PEM-encoded Ed25519 private key.
- `CSY_JOIN_SIGNING_KEY_ID`: active key identifier.
- `CSY_JOIN_ISSUER`: stable issuer identifier.
- `CSY_JOIN_SUBJECT_SECRET`: independent secret of at least 32 characters.

The issuer derives a server-specific opaque subject using HMAC-SHA-256, so the
account's internal database identifier is not placed in the ticket and the
same account receives unrelated subjects at different community servers. It
issues 60-second tickets and exposes a public-only Ed25519 JWK set containing
no private key material.

An authenticated HTTP issuance route is documented below, but public-key
discovery and automated key rotation policy are not implemented. Keep the private signing key and HMAC
secret only in the official account authority's secret store. Never copy them
to community hosts or commit them.


## Community-host public-key import and rotation

`community-join-ticket-keyset.js` validates a downloaded key-set document and
imports its public Ed25519 JWKs into a verifier map. It rejects private key
material, unsupported algorithms/curves, malformed identifiers, duplicate
key IDs, and sets larger than 32 keys. During a planned rotation, the authority
can publish both the retiring and replacement public keys so hosts can verify
tickets signed by either key during the overlap period.

This importer does not fetch a URL, establish trust in an issuer, or decide
when a key should be trusted or removed. A future discovery client must pin or
otherwise authenticate the expected issuer, use HTTPS, enforce cache and
freshness policy, and handle revocation/rotation explicitly. Do not trust an
arbitrary key-set URL supplied by a joining player.


## Community-host redemption primitive

`community-join-ticket-redeemer.js` combines strict public-key import, ticket
verification, exact issuer/audience checks, and replay-store consumption. The
host receives only an opaque external subject and the trusted issuer/server
identifiers; it does not receive an official account ID, cookie, credential,
or database connection.

The replay store is injected and must implement an atomic `consume({ ticketId,
expiresAt }, now)` operation. The included PostgreSQL store is suitable for
shared durable replay protection when configured with a correctly provisioned
database role and the private-schema migration. A process-local guard is not
sufficient for multiple host processes or replicas. Storage failures propagate
and must be treated as redemption failures.

This is still an integration primitive, not an HTTP route or complete game
login. A production host must create its local guest/player record only after
successful redemption, enforce its own authorization, and never treat the
opaque subject as an official account credential. The official account
authority still needs an authenticated, rate-limited issuer endpoint that
derives the account reference from the verified session—not from a client
supplied account ID.

## Not implemented yet

The ticket verifier and PostgreSQL replay-store primitive are not wired into matchmaking. The authenticated issuer endpoint is available only in PostgreSQL account-storage mode. A basic public-key discovery endpoint and reusable HTTP redemption handler now exist, but the handler is not yet mounted in the game server. Automated key rotation/revocation, a persistent server directory/approval workflow, persistent local identity mapping, and an end-to-end community-hosting flow are still missing. These must be implemented and security-tested before community servers are advertised as supported.


## Official account-authority issuance route

When PostgreSQL account storage is enabled and the official issuer environment
is configured, the account authority exposes:

`POST /api/community/servers/{serverId}/join-ticket`

The route requires the existing authenticated account session cookie, an
allowed website Origin, JSON content type, the shared login rate limit, and an
explicit server-ID allowlist.
The account ID is read only from the server-verified session; request bodies
cannot select or override it. The path server ID is strictly validated and
becomes the ticket's exact audience. Successful responses contain a
60-second ticket, its expiry duration, and the server ID. The response is
`no-store`.

Configure `CSY_COMMUNITY_SERVER_IDS` as a comma-separated allowlist of
approved server IDs. An absent or malformed allowlist fails closed with a
service-unavailable response; a server ID not on the list receives a forbidden
response. This is an interim deployment gate, not a substitute for the planned
persistent server directory, ownership verification, health checks, or
revocation controls.

Required issuer environment variables are
`CSY_JOIN_SIGNING_PRIVATE_KEY`, `CSY_JOIN_SIGNING_KEY_ID`,
`CSY_JOIN_ISSUER`, and `CSY_JOIN_SUBJECT_SECRET`. They are loaded lazily
when the first authenticated request arrives. Missing or invalid configuration
returns a generic service-unavailable response; internal configuration details
are logged server-side only. Keep the private signing key and HMAC secret on
the official account authority.

This endpoint checks the configured server-ID allowlist, but does not yet
check persistent ownership/approval records, account eligibility policy, or
server suspension/revocation. It is available only in
PostgreSQL account-storage mode. It does not expose the account database or
session cookie to the community host.


## Public signing-key discovery route

The official PostgreSQL account authority also exposes the active issuer's
public-only JWK set at:

`GET /api/community/join-keys`

The response contains the issuer's Ed25519 public key material and key ID;
it never includes the private signing key or HMAC subject secret. Successful
responses use `Cache-Control: public, max-age=300, must-revalidate`. Hosts
must still authenticate the expected issuer independently (for example,
through a preconfigured HTTPS origin and pinned issuer identifier), validate
the JWK schema with `community-join-ticket-keyset.js`, and implement explicit
rotation/revocation policy. Do not accept a discovery URL supplied by a player.
The route is available only when PostgreSQL account storage is enabled and
the issuer environment is correctly configured. It is not a complete trust
bootstrap or automated key-rotation service.


## Community-host HTTP redemption handler

`community-join-http.js` provides a framework-neutral HTTP handler for a
community host's `POST /api/community/join` route. The host application must
mount it explicitly and inject three dependencies: the configured ticket
redeemer, a rate limiter, and a local player-provisioning function.

The handler accepts only a JSON object containing a single `ticket` field,
limits the request body to 8 KiB, rate-limits before ticket verification,
returns non-cacheable responses, and never returns the opaque external subject
to the browser. It maps verification/replay rejection to 401, rate limiting to
429, malformed requests to 400/413/415, and replay-store or provisioning
failures to generic 503 responses. Internal ticket/database errors are not
returned to clients.

The injected provisioning function receives only the opaque subject, trusted
issuer, and server ID. It must persist a unique local mapping for
(issuer, external subject) and return a local player ID/name. It must not
create or infer an official account ID. Provisioning occurs after the atomic
replay claim; if local persistence fails, the ticket remains consumed and the
client must obtain a fresh ticket. This avoids unsafe replay but means hosts
should make provisioning reliable and idempotent.

This is a reusable handler primitive, not yet mounted in `server.js` or
connected to the current in-memory multiplayer player store. No community
server should advertise official-account sign-in until that integration,
persistent identity mapping, and end-to-end tests are complete.
