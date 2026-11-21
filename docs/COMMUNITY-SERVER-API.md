# Community server registry API

This document describes the current HTTP surface for the community-server
registry. It is a reference for implementation and testing, not a production
readiness declaration.

## Availability and prerequisites

- Registry account routes require `CSY_ACCOUNT_STORAGE=postgres`.
- The official account authority must have migrations
  `006_community_server_registry.sql` and
  `007_community_server_moderation_events.sql` applied before using the
  complete registry and moderation surface.
- No migration is applied automatically at startup.
- The public directory is readable without an account session, but it is
  rate-limited.
- Owner routes require a valid official account session.
- Operator routes require an admin or owner session and the existing
  same-origin protection for mutations.
- Join-ticket issuance continues to use `CSY_COMMUNITY_SERVER_IDS` unless
  `CSY_COMMUNITY_REGISTRY_ENFORCE=true` is explicitly enabled.

## Public directory

### `GET /api/community/servers`

Query parameters:

- `limit`: optional integer from 1 to 100; defaults to 50.
- `after`: optional server ID cursor returned as `nextCursor`.

Success response:

```json
{
  "servers": [
    {
      "serverId": "community:example",
      "endpoint": "https://play.example.net",
      "displayName": "Example Community",
      "verifiedAt": "2026-11-20T12:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

The cursor is the final server ID in the returned page when another page
exists. Ordering is ascending by server ID. The directory excludes pending,
unverified, and revoked registrations. It does not disclose owner account IDs,
moderator identities, or revocation reasons. Responses are cacheable for
60 seconds with a 30-second stale-while-revalidate window.

Responses: `200` success, `400` invalid pagination parameters,
`405` unsupported method, `429` rate limited, `503` registry unavailable.

## Owner registration and verification

All routes in this section require an authenticated official account.

### `POST /api/community/servers`

JSON body (no extra properties accepted):

```json
{
  "serverId": "community:example",
  "endpoint": "https://play.example.net",
  "displayName": "Example Community"
}
```

The endpoint must be HTTPS on a public DNS hostname, without URL credentials,
query, or fragment. A successful `201` response returns the pending
registration and a one-time DNS TXT challenge:

```json
{
  "server": {
    "serverId": "community:example",
    "status": "pending",
    "endpoint": "https://play.example.net",
    "displayName": "Example Community",
    "createdAt": "2026-11-20T12:00:00.000Z"
  },
  "ownership": {
    "recordName": "_csy-verify.play.example.net",
    "recordType": "TXT",
    "recordValue": "<one-time-random-token>",
    "expiresAt": "2026-11-21T12:00:00.000Z"
  }
}
```

The token is returned once, is stored only as a SHA-256 hash, and must not be
written to logs. Publish the exact TXT value before requesting verification.
A duplicate server ID returns `409`.

### `GET /api/community/servers/{serverId}`

Returns only the authenticated owner's registration. Another owner's
registration is not disclosed; a missing or non-owned record returns `404`.

### `POST /api/community/servers/{serverId}/challenge`

Issues a replacement TXT challenge only for an unverified pending registration
owned by the current account. The previous challenge is invalidated. The new
token is returned once with `Cache-Control: no-store`. A non-pending,
verified, or changed registration returns `409`.

### `POST /api/community/servers/{serverId}/verify`

The authority performs the DNS TXT lookup itself at the exact challenge record.
It compares the complete token, applies a five-second resolver timeout,
rechecks challenge expiry after DNS resolution, and atomically consumes the
proof. A mismatch, missing record, timeout, or expired challenge returns
`409`; success returns `200` with status `verified`. DNS verification
does not approve a server.

Owner route responses also include `401` for no valid account session,
`405` for unsupported methods, and `429` for rate limiting.

## Operator moderation

All routes require an official admin or owner session.

- `GET /api/admin/community-servers`: list up to 500 registrations with
  ownership and moderation metadata for operator review. Challenge tokens
  and hashes are never returned.
- `PATCH /api/admin/community-servers/{serverId}/approve`: approve only a
  pending registration that has completed DNS ownership verification. The
  request body must be empty.
- `PATCH /api/admin/community-servers/{serverId}/revoke`: revoke an existing
  registration. Optional JSON body: `{"reason":"short explanation"}`;
  the reason is limited to 240 characters.
- `GET /api/admin/community-servers/{serverId}/events`: return the latest
  100 moderation events for the server, newest first.

Approval and revocation update the current registry state and insert the
corresponding moderation event in one SQL statement. Migration 007 adds a
database trigger that rejects updates and deletes to the event table. This is
append-only at the SQL trigger layer; it is not a tamper-proof external audit
service. Operator UI and event pagination are not yet implemented.

## Join-ticket eligibility

`POST /api/community/servers/{serverId}/join-ticket` remains authenticated.
By default it checks the configured static allowlist. With
`CSY_COMMUNITY_REGISTRY_ENFORCE=true`, it instead checks the live registry
for approved, verified, non-revoked status on every request. Registry lookup
errors fail closed. Do not enable this switch before migrations and the
operator workflow have been validated against the intended database.

## Operational limitations

The registry does not yet provide endpoint health checks, server-side
moderation UI, event pagination, abuse analytics, or automated public-key
discovery and rotation. Directory listing confirms approval and ownership
proof, not current server uptime or gameplay compatibility. Community hosts
remain responsible for their own game-state persistence and operations.
