# API capability and frontend integration audit

Last checked: 2026-11-20 against the current `Server` branch.

This is a source-code capability inventory, not a claim that the production
server has been deployed or that every browser workflow has passed staging
validation. The new 1.0 schema migration must be applied before the new
collection, role, and news endpoints can run.

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

### Accounts, profiles, settings, decks, and collections

PostgreSQL-backed account storage is selected when configured; the legacy
JSON handler remains in the codebase as a fallback.

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
| GET | `/api/account/collection` | Read the signed-in account's card quantities |

Collection quantities are private to the account. Admins can set a quantity
for a specific catalog card through the player collection endpoint below.
The current model tracks quantities; it does not yet implement card unlock
rules, trading, crafting, or a public marketplace.

### Email and password recovery

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/account/email/status` | Read email verification status |
| POST | `/api/account/email/request-verification` | Request a verification message |
| POST | `/api/account/email/verify` | Verify an email address |
| POST | `/api/auth/password-reset/request` | Request password recovery |
| POST | `/api/auth/password-reset/complete` | Complete password recovery |

The Server branch also contains a private durable transactional email outbox.
Source-level implementation does not prove that a mail provider, sender
domain, DNS, or production delivery is configured.

### Admin and managed news

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/admin/login` | Owner/admin sign-in |
| GET | `/api/admin/me` | Read current admin session |
| POST | `/api/admin/logout` | End admin session |
| GET | `/api/admin/server-logs` | Read a bounded owner/admin-only log snapshot |
| GET | `/api/admin/players` | List account-backed players |
| PATCH | `/api/admin/players/:id/rank` | Change player/mod/admin role (owner only) |
| PUT | `/api/admin/players/:id/collection/:cardId` | Set a player's card quantity |
| GET | `/api/admin/news` | List all news posts, including drafts |
| POST | `/api/admin/news` | Create a news post |
| PATCH | `/api/admin/news/:id` | Edit or publish/unpublish a news post |
| DELETE | `/api/admin/news/:id` | Delete a news post |
| GET | `/api/news` | List published news for the public News page |

Owner status cannot be granted through the player-role endpoint. News and
player management require an authenticated owner/admin session. Player
management currently lists registered accounts, not anonymous guest IDs.

## Cross-origin and browser-client behavior

The Server handler advertises
`GET, POST, PUT, PATCH, DELETE, OPTIONS` and permits the `Content-Type`
request header. Credentialed CORS responses are restricted to exact origins
in `CSY_ALLOWED_ORIGINS`. State-changing account/admin handlers perform
trusted-origin checks; CORS is not authorization.

The shared `api.js` client supports `GET`, `POST`, `PUT`, and `DELETE`.
The admin page uses its own credentialed fetch helper for `PATCH` requests.
The client rejects an unconfigured API origin, requires HTTPS in production
(HTTP only for localhost), includes cookies, and disables caching.

The client does not add a CSRF token. Keep the server's trusted-origin checks,
cookie policy, HTTPS, and CORS allowlist aligned. Verify cookie behavior from
each intended frontend origin before enabling production routing.

## Release and deployment checks still required

1. Apply and verify the new 1.0 PostgreSQL migration in a non-production
   environment before enabling the new endpoints.
2. Run the Server branch's complete automated test suite and database checks.
3. Test account collection privacy, admin quantity changes, role restrictions,
   news draft visibility, publishing, editing, and deletion end to end.
4. Configure and test transactional email delivery without exposing provider
   credentials to the browser or repository.
5. Test registration, login, session expiry, logout, profile/settings updates,
   saved-deck CRUD, email verification, and password recovery.
6. Test CORS preflight, cookies, trusted-origin rejection, and unauthorized
   responses from every intended HTTPS frontend origin.
7. Complete staging and backup/rollback checks before changing production
   routing. Do not switch live routing as part of this code change.

## Deployment boundary

These source changes do not alter DNS, Cloudflare Tunnel, Nginx, the Ubuntu
host, or any live deployment. The Server-hosted frontend remains the
compatibility site until staging validation is complete.
