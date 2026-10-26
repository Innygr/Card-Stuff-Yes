# Card Stuff Yes

Card Stuff Yes is a browser-based card game project.

## Running the multiplayer prototype locally

The turn-based PvP prototype uses Node.js built-in modules only.

1. Install a current Node.js LTS release.
2. Clone the repository and switch to the `Server` branch after this feature is merged.
3. From the repository folder, run `npm start`.
4. Open `http://127.0.0.1:6565/multiplayer.html`.
5. Open that address in two separate browser sessions on the same computer, create a match in one, and join it from the other. For another device on your local network, start the server with `HOST=0.0.0.0` and use the host computer's LAN address. Do not expose the prototype directly to the public internet; use HTTPS behind a properly configured reverse proxy first.

Run `npm run check` to check the syntax of the multiplayer server and browser client.

## Multiplayer prototype scope

- Two-player, turn-based matches with create/join codes.
- Server-authoritative turns, card costs, card effects, health, shields, and win/loss state.
- Guest names and match state are saved to `private-data/multiplayer-state.json` and restored when the server restarts. The snapshot is written atomically and is blocked from static-file access. Set `CSY_STATE_FILE` to choose a different private location.
- Refreshing the multiplayer page restores the guest's unfinished waiting or active match using the existing HttpOnly guest cookie.
- This lightweight JSON snapshot is for the prototype, not a substitute for a transactional database or multi-process locking. Player accounts, database-backed storage, online matchmaking beyond the open lobby, and production deployment/security hardening remain future work.
- The multiplayer API must be served from the same Node server as the page. GitHub Pages alone cannot run this backend.

## Project contributors

Made by Innygr (@innygr) and Mythic (@tylerspy2011-stack).
