# API capability and frontend integration audit

Last checked: 2026-11-19 against the `Server` branch.

## Implemented API surface

The current `server.js` implements:

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

The server's cross-origin CORS policy currently advertises `GET, POST, OPTIONS`
and allows the `Content-Type` request header. It returns credentialed CORS
headers only for exact origins in `CSY_ALLOWED_ORIGINS`.

The Server compose defaults currently list these frontend origins:
apex, www, play, pvp, cards, decks, account, profile, settings, news, help,
and admin. The API host is the request destination, not a frontend origin.

## Not implemented on the current backend

The following page workflows are not implemented by the current Server API:

- Account page: `/api/me`, `/api/account/email`, and
  `/api/auth/change-password` / `logout`.
- Profile page: `/api/me` and account/password workflows.
- Admin page: `/api/admin/me`, player management, news management, and
  admin logout/login routes. The separate server-log implementation must be
  audited as its own protected route before cross-origin use.

The DNS map makes these pages addressable; it does not mean their APIs exist.
Do not wire these pages to the shared API client as if the missing endpoints
were available. Build and test the backend workflows first.

## Shared frontend client constraints

`api.js` deliberately supports only GET and POST because those are the
methods currently advertised by the backend CORS policy. It rejects an
unconfigured API origin rather than silently sending a request to the page's
own origin. Production requires HTTPS; plain HTTP is accepted only for
localhost development.

The client sends cookies with `credentials: include` and disables caching.
It does not implement a CSRF token. Before adding account/admin write
operations, define and test the session and CSRF policy with the backend.

## Required next integration steps

1. Implement and test account/profile API routes and their session lifecycle.
2. Implement and test admin authentication, authorization, and management
   routes. Keep owner/admin authorization enforced server-side.
3. Decide whether additional HTTP methods are required; update server CORS and
   API client together if so.
4. Test preflight, cookies, redirects, logout, and unauthorized responses from
   each final HTTPS subdomain.
5. Only then migrate the relevant page scripts from same-origin fetch calls to
   `CSY_API`.

## Deployment boundary

This audit and the frontend changes do not alter the Server branch, DNS,
Cloudflare Tunnel, Nginx, or the live Ubuntu deployment. Keep the Server-hosted
frontend as the compatibility site until staging validation is complete.
