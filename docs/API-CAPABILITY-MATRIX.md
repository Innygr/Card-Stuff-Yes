# API capability and frontend integration audit

Last checked: 2026-11-20 against the current `Server` branch.

This is a source-code capability inventory, not a claim that the production
server has been deployed or that every browser workflow has passed staging
validation.

## Implemented API surface

### Health, catalogue, and multiplayer

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health response |
| GET | `/api/status` | Status response |
| GET | `/api/cards` | Shared card catalogue |
| GET | `/api/multiplayer/me` | Current guest identity |
| GET | `/api/multiplayer/current` | Current unfinished match |
| POST | `/api/multiplayer/name` | Set guest display name |
| GET | `/api/multiplayer/matches` | List waiting matches |
| POST | `/api/multiplayer/matches` | Create a match |
| GET | `/api/multiplayer/matches/:id` | Read a match for a participant |
| POST | `/api/multiplayer/matches/:id/join` | Join a waiting match |
| POST | `/api/multiplayer/matches/:id/leave` | Leave/cancel a match |
| POST | `/api/multiplayer/matches/:id/action` | Play a turn action |

### Accounts, profiles, settings, and decks

The account handler supports registration, sign-in, session lookup, sign-out,
and password changes. PostgreSQL-backed account storage is selected when
configured; the legacy JSON handler remains in the codebase as a fallback.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Register an account |
| POST | `/api/auth/login` | Sign in |
| GET | `/api/auth/me` or `/api/me` | Read the authenticated account |
| POST | `/api/auth/logout` | End the account session |
| POST | `/api/auth/change-password` | Change the account password |
| GET, PUT | `/api/account/profile` | Read or update profile data |
| GET, PUT | `/api/account/settings` | Read or update account settings |
| GET, POST | `/api/account/decks` | List or create saved decks |
| GET, PUT, DELETE | `/api/account/decks/:id` | Read, update, or delete a saved deck |

Saved-deck support is not the same as a card collection or inventory system.
Card ownership, unlocks, and inventory endpoints are not implemented.

### Email and password recovery

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/account/email/status` | Read email verification status |
| POST | `/api/account/email/request-verification` | Request a verification message |
| POST | `/api/account/email/verify` | Verify an email address |
| POST | `/api/auth/password-reset/request` | Request password recovery |
| POST | `/api/auth/password-reset/complete` | Complete password recovery |

The Server branch also contains a private durable transactional email outbox.
That is backend infrastructure; successful source-level implementation does
not by itself prove that a mail provider, sender domain, DNS, or production
delivery is configured.

### Admin

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/admin/login` | Owner/admin sign-in |
| GET | `/api/admin/me` | Read current admin session |
| POST | `/api/admin/logout` | End admin session |
| GET | `/api/admin/server-logs` | Read a bounded owner/admin-only log snapshot |

Player management and news management endpoints are not implemented.

## Cross-origin and browser-client behavior

The Server handler advertises `GET, POST, PUT, DELETE, OPTIONS` and permits
the `Content-Type` request header. Credentialed CORS responses are restricted
to exact origins in `CSY_ALLOWED_ORIGINS`. State-changing account/admin
handlers perform trusted-origin checks; do not treat CORS as authorization.

The shared `api.js` client supports `GET`, `POST`, `PUT`, and `DELETE`.
It rejects an unconfigured API origin rather than silently sending requests
to the page's own origin, requires HTTPS in production (HTTP only for
localhost), includes cookies, and disables caching.

The client does not add a CSRF token. Keep the server's trusted-origin checks,
cookie policy, HTTPS, and CORS allowlist aligned. Verify cookie behavior from
each intended frontend origin before enabling production routing.

## Remaining backend gaps

- Card collection, ownership, unlocks, and inventory APIs.
- Admin player-management APIs.
- Admin news-management APIs.

A page being present in the frontend or a hostname being present in DNS does
not mean its backend workflow is implemented.

## Release and deployment checks still required

1. Run the Server branch's complete automated test suite and database checks.
2. Verify PostgreSQL-backed account mode and migration state in a non-production
   environment.
3. Configure and test transactional email delivery without exposing provider
   credentials to the browser or repository.
4. Test registration, login, session expiry, logout, profile/settings updates,
   saved-deck CRUD, email verification, and password recovery end to end.
5. Test CORS preflight, cookies, trusted-origin rejection, and unauthorized
   responses from every intended HTTPS frontend origin.
6. Keep missing inventory and admin-management workflows visibly unavailable;
   do not present placeholder UI as working functionality.
7. Complete staging and backup/rollback checks before changing production
   routing.

## Deployment boundary

This document update does not alter the `Server` branch, DNS, Cloudflare
Tunnel, Nginx, the Ubuntu host, or any live deployment. The Server-hosted
frontend remains the compatibility site until staging validation is complete.
