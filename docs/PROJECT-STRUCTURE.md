# Card Stuff Yes repository layout

The project has two long-lived application branches with separate responsibilities:

- `main` (Main) is the frontend: browser pages, CSS, browser JavaScript, and public assets.
- `Server` is the backend: Node.js API, game and multiplayer logic, persistence, tests, and server deployment.

The existing Git branch is named `main` in lowercase. “Main” describes its frontend role; do not create a duplicate case-only branch.

## Branch responsibilities

| Branch | Purpose | Notes |
| --- | --- | --- |
| `main` | Canonical frontend | HTML, CSS, browser JavaScript, public assets, frontend docs. |
| `Server` | Canonical backend | Node.js API, authentication/game logic, multiplayer, persistence, tests, deployment. |
| `Cards` | Card artwork and card-upload rules | Preserve as source until binary files are transferred to `main/assets/cards/`. |
| `Badges` | Badge artwork | Preserve as source until binary files are transferred to `main/assets/badges/`. |
| `SFX` | Sound effects and audio rules | Preserve as source until binary files are transferred to `main/assets/audio/`. |
| `modules` | Separate backend-module collection | Experimental/reference code; review and integrate individual modules only. |
| `Assets` | General asset branch | Currently empty. |
| `feature/*`, `fix/*`, `chore/*` | Short-lived work branches | Keep only while work is in progress or under review. |

Branches are versions of the repository, not folders. Do not merge the asset or experimental-module branches wholesale into either application branch.

## Target layouts

Frontend (`main`):

```text
main/
├── assets/
│   ├── badges/
│   ├── cards/
│   ├── audio/
│   └── images/
├── css/
├── js/
├── pages/
├── docs/
└── index.html
```

Backend (`Server`):

```text
Server/
├── .github/workflows/
├── docs/
├── tests/
├── private-data/       # runtime data only; never commit
├── server.js
├── package.json
├── Dockerfile
└── compose.yaml
```

## Migration status and compatibility

The frontend currently still lives at the root of `Server`. This is a temporary compatibility arrangement, not the intended ownership model. Browser scripts currently use same-origin API paths such as `/api/me` and `/api/multiplayer/...`, and pages refer to root-relative files. Moving the frontend before introducing a configurable API origin and testing cross-origin authentication would break the site.

Migrate in this order:

1. Inventory all frontend pages, scripts, styles, routes, and public assets.
2. Copy frontend files into `main`, preserving their relative paths initially.
3. Transfer binary assets with Git operations that preserve bytes; never recreate binaries in a text editor.
4. Add a single frontend API-base configuration and update API calls to use it.
5. Configure Server CORS, credentialed requests, cookie attributes, HTTPS, and CSRF protections together.
6. Test every frontend page against a local or staging backend.
7. Switch frontend deployment to `main`.
8. Only after verification, remove the compatibility frontend and static-file hosting from `Server`.

Until the migration is complete, keep the existing Server-hosted frontend operational.

## Asset source inventory

The source branches currently contain:

- `Badges`: `IMG_3902.png`
- `Cards`: `s1-01.png`, `S1-02.png`, `S1-03.png`, plus `CardRules.md`
- `SFX`: `voidattack.wav`, plus `SFXRules.md`
- `Server`: `NegInny.png` and `GasterPhone.mp3`

The source branches remain authoritative until reviewed assets are copied into Main. Binary transfers must preserve file bytes and should be performed with Git checkout/local copy operations.

## Backend modules

The `modules` branch contains a separate, larger backend implementation. It is not automatically part of the running `Server` application. Before integrating any module:

1. Identify dependencies and imports.
2. Compare its data model and routes with the current server.
3. Add or adapt tests.
4. Integrate a small group of related modules at a time.
5. Keep secrets, databases, and runtime state out of Git.

Do not overwrite the current `server.js` with the modules branch architecture as a bulk merge.

## Runtime data and security

- `private-data/` is runtime storage, not source code.
- Do not commit player credentials, session tokens, databases, or live multiplayer state.
- Server-only JavaScript modules must remain blocked by any temporary static-file handler.
- Public exposure requires HTTPS and properly configured cross-origin protections.
