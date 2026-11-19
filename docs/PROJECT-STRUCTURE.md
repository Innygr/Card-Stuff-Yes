# Card Stuff Yes repository layout

This document describes the repository as it exists today and the intended
organization of the active Node.js application.

## Branch responsibilities

| Branch | Purpose | Notes |
| --- | --- | --- |
| `main` | Public GitHub Pages / project landing content | Keep separate from the Node.js backend. |
| `Server` | Canonical runnable web and multiplayer server | Application changes and deployment work belong here. |
| `Cards` | Card artwork and card-upload rules | Asset source branch; files have not yet been copied into `Server/assets/`. |
| `Badges` | Badge artwork | Asset source branch; files have not yet been copied into `Server/assets/`. |
| `SFX` | Sound effects and audio rules | Asset source branch; files have not yet been copied into `Server/assets/`. |
| `modules` | Separate backend-module collection | Treat as experimental/reference code until each module is reviewed and integrated. |
| `Assets` | General asset branch | Currently empty. |
| `feature/*`, `fix/*`, `chore/*` | Short-lived work branches | Keep only while work is in progress or under review. |

Branches are versions of the repository, not folders. Do not merge the
asset or experimental-module branches wholesale into `main` or `Server`.
Review and transfer individual files so the running app and its routes remain
stable.

## Server branch layout

The current application is a small Node.js server with static browser pages.
The existing root-level page files are intentionally left in place for now:
many pages and scripts refer to sibling files using relative URLs, and moving
them all at once would require a coordinated path migration.

The intended organization for new files is:

```text
Server/
├── .github/
│   └── workflows/
├── assets/
│   ├── badges/
│   ├── cards/
│   └── audio/
├── docs/
├── tests/
├── private-data/       # runtime data only; never commit
├── server.js
├── multiplayer.js
├── package.json
├── Dockerfile
└── compose.yaml
```

Existing HTML, CSS, and browser JavaScript files remain at the repository
root until a dedicated page-path migration is tested. New static assets should
use the matching `assets/` subfolder and page references should use
`./assets/...`.

## Asset source inventory

The current asset branches contain:

- `Badges`: `IMG_3902.png`
- `Cards`: `s1-01.png`, `S1-02.png`, `S1-03.png`, plus `CardRules.md`
- `SFX`: `voidattack.wav`, plus `SFXRules.md`
- `Server`: `NegInny.png` and `GasterPhone.mp3`

The branch-specific source files are intentionally preserved. Binary asset
transfers should be done with a Git checkout/local copy so bytes are preserved;
the GitHub text-file editor must not be used to recreate binary files.

## Backend modules

The `modules` branch contains a separate, larger backend implementation.
It is not automatically part of the running `Server` application. Before
integrating any module:

1. Identify its dependencies and imports.
2. Compare its data model and routes with the current server.
3. Add or adapt tests.
4. Integrate a small group of related modules at a time.
5. Keep secrets, databases, and runtime state out of Git.

In particular, do not overwrite the current `server.js` with the module
branch's architecture as a bulk merge.

## Runtime data and security

- `private-data/` is runtime storage, not source code.
- Do not commit player credentials, session tokens, databases, or live
  multiplayer state.
- Server-only JavaScript modules must remain blocked by the static-file
  handler.
- Public exposure requires HTTPS through a properly configured reverse proxy.
