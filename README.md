# Card Stuff Yes

Card Stuff Yes is a browser-based multiplayer card game.
[![Multiplayer Prototype Checks](https://github.com/Innygr/Card-Stuff-Yes/actions/workflows/multiplayer-check.yml/badge.svg)](https://github.com/Innygr/Card-Stuff-Yes/actions/workflows/multiplayer-check.yml)

## Repository layout

The project is split across two long-lived branches:

- **`main` (Main): frontend** — website pages, browser JavaScript, styles, and public assets.
- **`Server`: backend** — Node.js API, multiplayer/game logic, persistence, tests, and server deployment.

The Git branch is currently named `main` (lowercase). We use “Main” when describing its frontend role.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the branch contract and migration plan.

## Development status

The frontend/backend split is being introduced incrementally. The existing frontend currently lives on `Server`; it must remain there until the frontend has been copied, API requests have been configured for the separate backend origin, and the migrated pages have been tested. Do not delete the compatibility copy early.

## Project

Website: https://cardstuffyes.ca (deployment is not ready yet)

Community: https://discord.gg/3Vt2vEDJt
