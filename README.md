# Card Stuff Yes

Card Stuff Yes is a browser-based card game project.

## Running the multiplayer prototype locally

The turn-based PvP prototype uses Node.js built-in modules only.

1. Install a current Node.js LTS release.
2. Clone the repository and switch to the `Server` branch after this feature is merged.
3. From the repository folder, run `npm start`.
4. Open `http://127.0.0.1:6565/multiplayer.html`.
5. Open that same address in a second browser/device that can reach the server, create a match in one session, and join it from the other.

Run `npm run check` to check the syntax of the multiplayer server and browser client.

## Multiplayer prototype scope

- Two-player, turn-based matches with create/join codes.
- Server-authoritative turns, card costs, card effects, health, shields, and win/loss state.
- Guest names and match state are in memory only; restarting the server clears matches.
- Player accounts, database persistence, online matchmaking beyond the open lobby, reconnect recovery, and production deployment/security hardening are not implemented yet.
- The multiplayer API must be served from the same Node server as the page. GitHub Pages alone cannot run this backend.

## Project contributors

Made by Innygr (@innygr) and Mythic (@tylerspy2011-stack).
