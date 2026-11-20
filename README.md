# Card Stuff Yes

Card Stuff Yes is a browser-based multiplayer card game.

## Workflow status

Live status for every GitHub Actions workflow used by this repository (including workflows maintained on the `Server` branch):

[![Deploy](https://github.com/Innygr/Card-Stuff-Yes/actions/workflows/deploy.yml/badge.svg)](https://github.com/Innygr/Card-Stuff-Yes/actions/workflows/deploy.yml)
[![Desktop Client](https://github.com/Innygr/Card-Stuff-Yes/actions/workflows/desktop-client.yml/badge.svg)](https://github.com/Innygr/Card-Stuff-Yes/actions/workflows/desktop-client.yml)
[![Frontend integrity](https://github.com/Innygr/Card-Stuff-Yes/actions/workflows/frontend-integrity.yml/badge.svg)](https://github.com/Innygr/Card-Stuff-Yes/actions/workflows/frontend-integrity.yml)
[![Jekyll site CI](https://github.com/Innygr/Card-Stuff-Yes/actions/workflows/jekyll-docker.yml/badge.svg)](https://github.com/Innygr/Card-Stuff-Yes/actions/workflows/jekyll-docker.yml)
[![GitHub Pages](https://github.com/Innygr/Card-Stuff-Yes/actions/workflows/pages.yml/badge.svg)](https://github.com/Innygr/Card-Stuff-Yes/actions/workflows/pages.yml)
[![Secret Hygiene](https://github.com/Innygr/Card-Stuff-Yes/actions/workflows/secret-hygiene.yml/badge.svg)](https://github.com/Innygr/Card-Stuff-Yes/actions/workflows/secret-hygiene.yml)
[![Welcome](https://github.com/Innygr/Card-Stuff-Yes/actions/workflows/welcome.yml/badge.svg)](https://github.com/Innygr/Card-Stuff-Yes/actions/workflows/welcome.yml)
[![Wiki Sync](https://github.com/Innygr/Card-Stuff-Yes/actions/workflows/wiki-sync.yml/badge.svg)](https://github.com/Innygr/Card-Stuff-Yes/actions/workflows/wiki-sync.yml)
[![Container Image](https://github.com/Innygr/Card-Stuff-Yes/actions/workflows/container-image.yml/badge.svg)](https://github.com/Innygr/Card-Stuff-Yes/actions/workflows/container-image.yml)
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


## Desktop client and release preparation

Windows x64 and Linux x64 desktop builds are produced as GitHub Actions test artifacts. They are not public releases and are not automatically published. See:

- [Desktop client build and verification](docs/DESKTOP-CLIENT.md)
- [Repository workflows and wiki synchronization](docs/WORKFLOWS.md)
- [Card Stuff Yes 1.0 release checklist](docs/RELEASE-CHECKLIST.md)
