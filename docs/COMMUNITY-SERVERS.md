# Community-hosted and private servers

## Goals and trust boundaries

Card Stuff Yes supports two deliberately separate hosting modes:

1. **Community-hosted game server:** an independently operated host runs match/gameplay services. Player identities and account data remain with the official Account Authority. A community host receives only short-lived, audience-bound identity assertions and the minimum public/gameplay data required for a match. It never receives database credentials, account password hashes, session cookies, admin credentials, or direct database access.
2. **Private standalone server:** an operator runs an independent installation with its own Account Authority, accounts, sessions, database, and game state. It does not silently federate accounts with the official service.

These modes must not be mixed. A community host cannot switch itself into private-account mode or claim to be the official identity provider.

## Components

### Official Account Authority

- Owns official account registration, passwords, recovery, email verification, sessions, player collections, and account database.
- Authenticates users and issues short-lived, signed server-entry tickets.
- Maintains the community-server directory and server status/approval metadata.
- Does not expose database connections or general-purpose account-management credentials to community operators.
- Does not give community servers a reusable bearer token that can call arbitrary account APIs.

### Community game host

- Runs the match engine and stores only its own match state, temporary player mappings, and operational logs.
- Validates signed entry tickets using the official authority's published public keys (or a narrowly scoped verification mechanism).
- Checks ticket issuer, audience/server ID, expiry, not-before time, unique ticket ID, and permitted scopes.
- Cannot look up passwords, email addresses, private collections, or account settings.
- Must not treat a display name or client-supplied account ID as proof of identity.
- Must not expose host environment variables, database files, or operator secrets through game APIs.

### Private standalone host

- Runs its own account and game services and uses its own database/storage.
- Uses a separate issuer identifier and signing keys from the official service.
- Has no automatic access to official accounts, collections, sessions, or server directory.
- Can be backed up, migrated, and administered independently by its operator.

## Community server authentication flow

1. The player signs in with the official Account Authority over HTTPS.
2. The player selects a listed community server. The official authority checks that the server is eligible to receive community traffic.
3. The authority issues a one-time, short-lived signed entry ticket with claims such as `iss`, `aud` (one exact server ID), `sub` (opaque official account ID), `iat`, `nbf`, `exp`, `jti`, and a minimal scope such as `game:join`.
4. The client presents the ticket to the selected community host over HTTPS/WSS.
5. The host validates the signature and all claims against official public signing keys, rejects reused ticket IDs, and creates a host-local player session.
6. The host runs the match locally. It does not receive an official account cookie or any database/API secret.
7. When the session ends, the host expires its local session. Any permitted results are submitted through a separate, narrowly scoped result-ingestion contract; the host cannot write arbitrary account or collection data.

Tickets must be single-use, short-lived, bound to one server, and contain no email, password, password hash, session cookie, or private profile data. Use asymmetric signing so community hosts need only public verification keys. Key rotation and revocation must be supported.

## Server directory and host verification

- Each server has a stable server ID, display name, public endpoint, protocol version, region/latency metadata, and operator contact/reporting path.
- The directory must distinguish official, verified community, unverified community, and private servers.
- Server ownership verification must prove control of the endpoint or a DNS challenge before a server can be marked verified.
- Health checks must not expose internal service details or secrets.
- Hosts must use TLS for public endpoints. Plain HTTP is allowed only for loopback development.
- Rate-limit ticket issuance, join attempts, directory registration, and result submissions.
- Provide a revocation/disable switch for compromised or abusive hosts.

## Data ownership matrix

| Data | Official community mode | Private standalone mode |
| --- | --- | --- |
| Account credentials and recovery | Official authority only | Private operator's own database |
| Account sessions | Official authority; host gets a separate local session | Private server only |
| Player collection/inventory | Official authority only; never copied wholesale to host | Private server's own data |
| Match state | Community host | Private server |
| Server logs | Each operator controls its own logs | Private operator |
| Admin credentials | Never shared with community host | Private operator's own credentials |
| Database access | No access to official database | Own database only |

## Required security controls

- Do not implement community mode by forwarding official cookies to third-party hosts.
- Do not give community hosts an API key that can read arbitrary accounts or call admin endpoints.
- Do not accept unsigned identity headers from reverse proxies or browser clients.
- Do not trust client-provided player IDs, roles, collection contents, or match results.
- Use strict request schemas, payload limits, rate limits, audit events, and per-server scopes.
- Store private-server secrets outside the repository with restrictive filesystem permissions.
- Keep official and private signing keys separate; never ship private keys in client code or public packages.
- Treat community host operators as untrusted with respect to official account data, even when they are listed in the directory.

## Implementation phases

1. **Protocol and threat model:** freeze ticket claims, key rotation, revocation, server identity, and result submission rules.
2. **Official authority:** add server registration/approval and ticket issuance endpoints with tests. Keep them disabled until signing keys and rate limits are configured.
3. **Host verification library:** implement signature, audience, expiry, replay, and scope checks with negative tests.
4. **Host runtime modes:** add explicit `community` and `private` configuration. Fail closed on missing/invalid configuration; never infer mode from whether a database exists.
5. **Server directory and UI:** list verified community hosts and show the account authority clearly before joining.
6. **Private deployment package:** document isolated database setup, owner bootstrap, backups, updates, and recovery.
7. **Security review:** test replay, forged tickets, wrong audience, expired tickets, key rotation, host compromise boundaries, and attempts to access account/admin APIs.

## Current implementation status

This document defines the target architecture; it does not claim federation is implemented. The current multiplayer service creates local guest identities and persists match/player state on the same server process. Do not expose it as a trusted community-hosting service until the ticket authority, host verification, server directory, and isolation tests are implemented.
