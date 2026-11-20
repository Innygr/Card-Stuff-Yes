# Card Stuff Yes — Server

This branch owns the Card Stuff Yes backend: the Node.js API, authentication and game logic, multiplayer state, persistence, tests, and server deployment.

The canonical browser frontend belongs on the `main` branch. The frontend currently remains in this branch as a temporary compatibility copy while the split is prepared. Do not remove those pages or static-file handling until the frontend has been copied to `main`, API requests have been switched to a configured backend origin, and the migrated site has passed testing.

## Running the current prototype locally

The server is a Node.js application. It includes the turn-based PvP prototype, account/authentication routes, account settings and deck APIs, administrative management routes, public news and collection APIs, and optional PostgreSQL-backed account storage. PostgreSQL support uses the `pg` dependency; the default local account store and multiplayer state are JSON files.

1. Install Node.js 22 LTS (the supported runtime for this server release track).
2. Clone the repository and switch to the `Server` branch.
3. From the repository folder, run `npm start`.
4. During this migration phase, open `http://127.0.0.1:6565/multiplayer.html`.
5. Open that address in two separate browser sessions on the same computer, create a match in one, and join it from the other. For another device on your local network, start the server with `HOST=0.0.0.0` and use the host computer's LAN address. Do not expose the prototype directly to the public internet; use HTTPS behind a properly configured reverse proxy first.

Run `npm test` to run the automated tests, including HTTP-level checks that both JSON and PostgreSQL account registration/login paths enforce the 10-attempt rate limit. Run `npm run check` for the configured syntax checks.

## API runtime configuration

- `HOST` and `PORT` control the listen address and port. Containers should bind to `0.0.0.0`.
- `CSY_STATE_FILE` selects the private multiplayer-state snapshot path.
- `CSY_ACCOUNT_FILE` selects the private JSON account-store path when PostgreSQL mode is disabled.
- `CSY_ACCOUNT_STORAGE=postgres` enables PostgreSQL account storage; configure `DATABASE_URL` as a protected runtime secret.
- `RESEND_API_KEY` and `CSY_EMAIL_FROM` enable verification and password-reset email delivery; keep both outside source control.
- `CSY_ALLOWED_ORIGINS` is a comma-separated exact-origin allowlist for a frontend hosted on a different origin. Leave it empty when the API is same-origin only.
- `CSY_COOKIE_SAMESITE` accepts `Strict`, `Lax`, or `None`. Use `None` only with HTTPS and a trusted frontend origin; the server automatically adds `Secure` for this setting.
- `GET /api/health` and `GET /api/status` return API liveness information.

### Implemented API areas

- Health/status: `GET /api/health`, `GET /api/status`.
- Authentication: registration, login, current session, logout, and password change.
- Account: profile, settings, deck management, and collection reads.
- Email: verification and password-reset routes when Resend is configured; email delivery remains disabled until valid runtime credentials and a sender address are supplied.
- Administration: player listing, owner-controlled rank changes, news management, and player collection updates.
- Multiplayer: guest identity, match creation/joining, and turn-based match actions.

Account persistence defaults to the local JSON account file. Set `CSY_ACCOUNT_STORAGE=postgres` and provide `DATABASE_URL` to use PostgreSQL-backed account storage. The PostgreSQL schema is managed separately through the migration scripts; do not run migrations against production without a reviewed backup and rollback plan. The multiplayer prototype still uses its separate JSON snapshot and is not a multi-process/high-availability store.

These routes are implemented in the current codebase, but that does not mean the service is production-ready: real deployment still requires staging tests, secure runtime secrets, HTTPS, exact CORS/cookie configuration, backups, migration review, and security testing.

## Authentication abuse controls

Account registration and login share a per-process in-memory rate limiter in both JSON and PostgreSQL storage modes. It permits up to 10 attempts per client address in a 15-minute window, then returns HTTP 429 until the window expires. Expired entries are cleaned up, and the tracker is capped at 10,000 addresses to prevent unbounded memory growth.

Client address selection prefers `CF-Connecting-IP`, then the first address in `X-Forwarded-For`, then the socket peer address. These headers are trustworthy only when the application is reachable exclusively through a correctly configured reverse proxy that overwrites client-supplied forwarding headers. Do not expose a proxy-bypassing origin that allows clients to forge these headers.

This limiter is process-local, not a distributed abuse-control system. Multi-instance deployments need a shared rate-limit store or an upstream gateway limit before being treated as production-ready. Restarting the process resets its counters.

Email verification requests, verification-token attempts, password-reset requests, and password-reset completion use separate per-IP scopes with a limit of five attempts per 15-minute window. Their tracker is also capped at 10,000 source/scope entries, with expired entries cleaned up and oldest entries evicted when full. Password-reset requests continue to return the same generic response for known and unknown email addresses. These controls are also process-local and require shared/upstream controls for multi-instance deployments.

## Multiplayer prototype scope

- Two-player, turn-based matches with create/join codes.
- Server-authoritative turns, card costs, card effects, health, shields, and win/loss state.
- Guest names and match state are saved to `private-data/multiplayer-state.json` and restored when the server restarts. The snapshot is written atomically and is blocked from static-file access. Set `CSY_STATE_FILE` to choose a different private location.
- Refreshing the multiplayer page restores the guest's unfinished waiting or active match using the existing HttpOnly guest cookie.
- This lightweight JSON snapshot is for the prototype, not a substitute for a transactional database or multi-process locking. Player accounts, database-backed storage, online matchmaking beyond the open lobby, and production deployment/security hardening remain future work.

## Server container release

See [docs/SERVER-CONTAINER-RELEASE.md](docs/SERVER-CONTAINER-RELEASE.md) for local container testing, runtime safety, and the version-tagged GHCR publication process.

## Domain routing

The server maps the apex domain and approved subdomains to their app pages using the HTTP Host header. See [docs/DNS-MAP.md](docs/DNS-MAP.md) for the hostname map, DNS records, TLS requirements, and deployment limitations. DNS and hosting settings still need to be configured at the provider.

## Frontend integration contract

The target architecture is:

- Main serves the browser application.
- Server exposes the API.
- Frontend code uses a configurable API base URL; it must not assume API paths share the frontend origin.
- Cross-origin authentication requires a narrowly configured CORS allowlist, credentialed requests, secure cookie settings, HTTPS, and CSRF protections. These must be tested together before production.

See the frontend/backend architecture guide on the `main` branch and `docs/PROJECT-STRUCTURE.md` in this branch.

## Project contributors

Made by Innygr (@innygr) and Mythic (@tylerspy2011-stack).
