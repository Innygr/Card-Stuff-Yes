# Card Stuff Yes — Server

This branch owns the Card Stuff Yes backend: the Node.js API, authentication and game logic, multiplayer state, persistence, tests, and server deployment.

The canonical browser frontend belongs on the `main` branch. The frontend currently remains in this branch as a temporary compatibility copy while the split is prepared. Do not remove those pages or static-file handling until the frontend has been copied to `main`, API requests have been switched to a configured backend origin, and the migrated site has passed testing.

## Running the current prototype locally

The current turn-based PvP prototype uses Node.js built-in modules only.

1. Install a current Node.js LTS release.
2. Clone the repository and switch to the `Server` branch.
3. From the repository folder, run `npm start`.
4. During this migration phase, open `http://127.0.0.1:6565/multiplayer.html`.
5. Open that address in two separate browser sessions on the same computer, create a match in one, and join it from the other. For another device on your local network, start the server with `HOST=0.0.0.0` and use the host computer's LAN address. Do not expose the prototype directly to the public internet; use HTTPS behind a properly configured reverse proxy first.

Run `npm test` to run the automated tests. Run `npm run check` for the configured syntax checks.

## API runtime configuration

- `HOST` and `PORT` control the listen address and port. Containers should bind to `0.0.0.0`.
- `CSY_STATE_FILE` selects the private multiplayer-state snapshot path.
- `CSY_ALLOWED_ORIGINS` is a comma-separated exact-origin allowlist for a frontend hosted on a different origin. Leave it empty when the API is same-origin only.
- `CSY_COOKIE_SAMESITE` accepts `Strict`, `Lax`, or `None`. Use `None` only with HTTPS and a trusted frontend origin; the server automatically adds `Secure` for this setting.
- `GET /api/health` and `GET /api/status` return API liveness information.

The current API implements the multiplayer prototype routes and health/status routes. Account login, profile, deck, and admin APIs are not implemented yet; the existing browser pages must not be treated as proof those services exist.

## Multiplayer prototype scope

- Two-player, turn-based matches with create/join codes.
- Server-authoritative turns, card costs, card effects, health, shields, and win/loss state.
- Guest names and match state are saved to `private-data/multiplayer-state.json` and restored when the server restarts. The snapshot is written atomically and is blocked from static-file access. Set `CSY_STATE_FILE` to choose a different private location.
- Refreshing the multiplayer page restores the guest's unfinished waiting or active match using the existing HttpOnly guest cookie.
- This lightweight JSON snapshot is for the prototype, not a substitute for a transactional database or multi-process locking. Player accounts, database-backed storage, online matchmaking beyond the open lobby, and production deployment/security hardening remain future work.

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
