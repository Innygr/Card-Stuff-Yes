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

The issuer supports overlapping signing keys for planned rotation. Configure
`CSY_JOIN_SIGNING_KEYS` as a JSON array of objects with `kid` and PEM
`privateKey` fields, and set `CSY_JOIN_ACTIVE_KEY_ID` to the key that should
sign newly issued tickets. The public JWK set contains every configured
verification key, while newly issued tickets use only the selected active key.
This allows operators to distribute a replacement public key before switching
issuance, then retain the previous public key during the short ticket overlap.
A safe planned sequence is: publish both public keys; update and verify every
community host's pinned key set; switch the authority's active key; retain the
old public key for at least the maximum ticket lifetime plus clock-skew
allowance and any deployment/cache propagation window; then remove the retired
key. Do not remove a key while a valid ticket signed by it may still exist.
Emergency compromise requires a separate immediate revocation decision and
may invalidate outstanding tickets.

The legacy single-key variables
`CSY_JOIN_SIGNING_PRIVATE_KEY` and `CSY_JOIN_SIGNING_KEY_ID` remain
supported when `CSY_JOIN_SIGNING_KEYS` is unset. Do not configure both modes.
The multi-key JSON value contains private PEM material: store it only in the
official authority's secret manager, never in source control or community-host
configuration. Keep the subject HMAC secret independent of signing keys.

The authenticated HTTP issuance route and public-key discovery endpoint are
implemented in PostgreSQL account-storage mode; automated key rotation policy
is not implemented. Keep the private signing key and HMAC secret only in the
official account authority's secret store. Never copy them to community hosts
or commit them.


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

This primitive is integrated into an opt-in HTTP route and local session
flow, but it is not a complete game login or production federation service.
The host creates its local player only after successful redemption, enforces
its own authorization, and never treats the opaque subject as an official
account credential. The authority's issuer endpoint derives the account
reference from the verified session—not from a client-supplied account ID.

## Current integration status and remaining work

The ticket verifier, PostgreSQL replay store, local identity mapping, and HTTP
redemption handler are implemented. The official account-authority issuance
route and public-key endpoint are available in PostgreSQL account-storage mode.
When `CSY_COMMUNITY_JOIN_ENABLED=true` is configured on a community host, the
server mounts `POST /api/community/join`, consumes a ticket, resolves an
issuer-scoped opaque subject to a host-local player identity, persists that
identity, and establishes a host-local session.

This is an opt-in integration foundation, **not a supported public federation
service yet**. In particular:

- The join flow is not yet integrated into matchmaking or a complete client
  sign-in experience.
- Public-key trust distribution, freshness, automated rotation, and emergency
  revocation policy are not complete. Hosts currently configure a pinned
  public JWK set.
- The persistent directory schema, public paginated directory endpoint,
authenticated owner registration and DNS verification APIs, and operator
approval/revocation APIs now exist. The operator UI is still incomplete.
- Multiplayer match state remains single-process and is not coordinated across
  multiple host replicas.
- Migrations `004_community_join_ticket_uses.sql` and
  `005_community_player_identities.sql` must be applied by the community
  operator before enabling the PostgreSQL-backed join integration.

Do not advertise community federation as production-ready until these gaps
have been implemented, independently reviewed, and tested end to end.


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

By default, configure `CSY_COMMUNITY_SERVER_IDS` as a comma-separated
allowlist of approved server IDs. An absent or malformed allowlist fails
closed with a service-unavailable response; a server ID not on the list
receives a forbidden response.

After migration 006 has been reviewed and applied, operators can explicitly
switch join-ticket eligibility to the live registry by setting
`CSY_COMMUNITY_REGISTRY_ENFORCE=true`. In this mode, each ticket request
queries `community_servers` and requires the server to be approved, verified,
and not revoked. Database lookup errors fail closed with 503; unapproved or
revoked servers receive 403. The static allowlist is ignored in this mode.
Leave the flag unset until migration 006 is applied and the registry/admin
workflow has been tested against the intended database.

Required issuer environment variables are
`CSY_JOIN_SIGNING_PRIVATE_KEY`, `CSY_JOIN_SIGNING_KEY_ID`,
`CSY_JOIN_ISSUER`, and `CSY_JOIN_SUBJECT_SECRET`. They are loaded lazily
when the first authenticated request arrives. Missing or invalid configuration
returns a generic service-unavailable response; internal configuration details
are logged server-side only. Keep the private signing key and HMAC secret on
the official account authority.

By default this endpoint checks the configured server-ID allowlist.
When `CSY_COMMUNITY_REGISTRY_ENFORCE=true`, it instead checks the live
persistent registry's verified, approved, and non-revoked state. The route is
available only in PostgreSQL account-storage mode. It does not expose the
account database or session cookie to the community host.


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

`community-join-http.js` provides the framework-neutral handler mounted by
`server.js` at `POST /api/community/join` when
`CSY_COMMUNITY_JOIN_ENABLED=true`. The server injects the configured ticket
redeemer, a bounded rate limiter, local player provisioning, and local session
establishment.

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

The route is mounted by `server.js` at `POST /api/community/join` when
`CSY_COMMUNITY_JOIN_ENABLED=true`. The server injects host-local PostgreSQL
identity and replay stores, provisions the local player in existing
multiplayer state, and establishes the normal HttpOnly player cookie. The
integration remains opt-in and requires the host's own database migrations.
It is not a complete multi-process multiplayer deployment.


## Durable community player identity mapping

`community-player-identity-store.js` adds a PostgreSQL-backed mapping from
the trusted pair (issuer, opaque external subject) to a locally generated
player UUID and display name. Repeated sign-ins from the same issuer resolve
to the same local identity; different issuers remain separate namespaces.
The SQL uses a unique key and `ON CONFLICT` so concurrent first sign-ins
converge on one local player identity.

Migration `005_community_player_identities.sql` creates the mapping table
inside the private `csy_private` schema and revokes PUBLIC table privileges.
It has not been applied to any database. The store is an integration
primitive: the HTTP handler's injected provisioning function can delegate to
it, then ensure the resulting local player is loaded into the host's own
multiplayer state. `server.js` now resolves this mapping during the opt-in join flow and loads
the resulting player into the local multiplayer state. The local state
snapshot persists player records across a single host process restart, but
does not provide shared transactional state across multiple server processes.


## Opt-in community-host HTTP integration

The game server now mounts `POST /api/community/join` only when
`CSY_COMMUNITY_JOIN_ENABLED=true`. The host must configure:

- `CSY_COMMUNITY_JOIN_ISSUER`: the exact trusted account-authority issuer.
- `CSY_COMMUNITY_SERVER_ID`: the exact audience/server ID assigned by that authority.
- `CSY_COMMUNITY_JOIN_PUBLIC_JWKS`: a pinned JSON JWK set containing public
  Ed25519 signing keys for that issuer.

The host also needs its own PostgreSQL database configured through the normal
server database configuration. The route uses that host-local database for
one-time ticket replay protection and issuer-scoped local player identities.
It does not connect to the official account database. Operators must apply
migrations 004 and 005 to the community host's own database before enabling
the feature. No migration is automatically run by server startup.

On successful redemption, the server creates or resolves the local player,
loads that player into its multiplayer state, and sets the normal HttpOnly
player cookie. The player ID is a host-local UUID. Existing guest play remains
available when federation is disabled. The endpoint is disabled by default;
if explicitly enabled with invalid configuration, startup fails closed.

The community-join limiter is process-local and keyed by the direct TCP peer
address. The shared account-auth limiter also uses the direct peer address by
default; it honors Cloudflare/X-Forwarded-For client-address headers only when
the operator explicitly sets `CSY_TRUST_PROXY=true`. Set that flag only when
the application is reachable exclusively through a trusted ingress that
removes client-supplied forwarding headers and writes its own. Multi-process
deployments need a shared distributed rate limiter and shared durable
multiplayer state.
The public JWK set is pinned through operator configuration; key rotation
requires an operator-managed update/restart and is not automated.

This enables account-authority sign-in to establish a local host identity.
The project now has persistent server registration and DNS ownership proof,
plus overlapping signing-key support. It still lacks a public directory,
operator moderation API/UI, health checks, and automatic key discovery and
rotation for community hosts.


## Reverse-proxy HTTPS trust

The server treats a request as HTTPS when its socket is encrypted. It honors
`X-Forwarded-Proto: https` only when the operator explicitly sets
`CSY_TRUST_PROXY=true`. Set this only when the application is reachable
exclusively through a trusted ingress/reverse proxy that removes any
client-supplied `X-Forwarded-Proto` header and writes its own value. Do not
enable it when clients can reach the Node process directly. This setting
affects same-origin protocol detection and the `Secure` attribute on player
cookies. When in doubt, leave it disabled and terminate TLS directly at the
application.


## Persistent community-server directory foundation

Migration `006_community_server_registry.sql` and
`community-server-registry.js` add the first persistent directory layer.
The migration has **not** been applied to any database. It stores a server ID,
owner account, HTTPS endpoint, display name, verification state, approval
state, and revocation audit fields in the private schema.

The registry deliberately separates four lifecycle states:

1. **Pending registration** — an authenticated owner registers a unique server
   ID and endpoint. Registration does not grant directory visibility or join
   ticket eligibility.
2. **Ownership verified** — the owner proves control of the endpoint hostname
   by publishing a one-time DNS TXT record at
   `_csy-verify.<hostname>`. The registry stores only a SHA-256 hash of the
   random 256-bit token and an expiry time. The challenge generator returns
   the token once; do not log it or persist it in plaintext.
3. **Approved** — an authorized operator explicitly approves a verified
   pending record. This is a separate moderation action; DNS proof alone does
   not establish that a server is safe or eligible.
4. **Revoked** — an operator can revoke a registration with an audit actor,
   timestamp, and bounded reason. Revoked servers are excluded from public
   directory results.

The store exposes registration, owner-bound challenge completion, approval,
revocation, owner-scoped lookup, an `isApproved(serverId)` eligibility check,
and a public listing that returns only approved and verified servers. Public
results omit owner IDs and moderation metadata. Database errors propagate;
the module does not create a pool or apply migrations itself.

**Current HTTP integration:** when PostgreSQL account storage is enabled,
the account API provides:

- `GET /api/community/servers` — public, paginated directory of approved
  servers. Supports `limit` (1–100, default 50) and an opaque
  `after` server-ID cursor. Returns only server ID, HTTPS endpoint, display
  name, and verification timestamp. Responses are briefly cacheable.
- `POST /api/community/servers` — authenticated registration. The response
  contains a one-time DNS TXT challenge. Store it securely until the owner
  publishes it; it is not written to application logs.
- `GET /api/community/servers/:serverId` — retrieve only the signed-in
  account's own registration.
- `POST /api/community/servers/:serverId/challenge` — renew an expired or
  lost challenge for an unverified pending registration. The previous token
  is invalidated.
- `POST /api/community/servers/:serverId/verify` — authenticated DNS TXT
  verification. The server resolves the record itself, compares the complete
  TXT value against the stored hash using a constant-time comparison, applies
  a five-second resolver timeout, rechecks challenge expiry after resolution,
  and consumes the challenge on success. Missing, mismatched, timed-out, and
  expired proofs fail closed.

Directory reads are public and rate-limited. Registration and verification
use the existing account session, same-origin protections, and request rate
limiter. A server cannot approve itself.

**Remaining integration boundary:** there is no operator UI, automated health
checks, or DNS propagation diagnostics. The account-authority join-ticket
endpoint still defaults to its configuration allowlist. Registry enforcement
is an explicit opt-in after migration 006. Migration 006 is not applied.
Dedicated immutable moderation-event history is also outstanding. Do not
enable registry enforcement until the migration and operator workflow have
been reviewed and tested.


## Community server operator moderation API

The admin-management API exposes these owner/admin-only routes:

- `GET /api/admin/community-servers` — list registrations and moderation
  state for review. Verification token hashes are never returned.
- `PATCH /api/admin/community-servers/{serverId}/approve` — approve only a
  pending registration with a completed DNS ownership proof.
- `PATCH /api/admin/community-servers/{serverId}/revoke` — revoke an existing
  registration and record the operator and optional reason.

These routes use the existing admin session, same-origin mutation protection,
and JSON validation. Approval/revocation state is written to the registry
record. Admin UI and dedicated immutable moderation-event history are not
implemented yet; the current record retains the latest approval/revocation
metadata. Apply migration 006 before using these routes.
