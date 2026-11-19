# Frontend and backend architecture

## Branch ownership

| Branch | Owns | Must not contain |
| --- | --- | --- |
| `main` (Main) | HTML pages, browser-side JavaScript, CSS, public images/audio/card artwork, frontend documentation | Node server implementation, secrets, databases, runtime state |
| `Server` | Node.js HTTP/API server, authentication and game rules, multiplayer logic, persistence adapters, backend tests, server deployment files | The canonical copy of website pages, browser styles/scripts, public frontend assets |

The repository's existing branch is named `main` in lowercase. “Main” is the project name for its frontend role; do not create a second case-only branch named `Main`.

## Runtime relationship

- Main is a static browser application.
- Server exposes the API consumed by Main.
- Main must use one documented API base URL/configuration rather than assuming API routes share the frontend origin.
- Authenticated cross-origin requests must use credentialed fetches and a narrowly configured server CORS allowlist. Cookie attributes, HTTPS, and CSRF protections must be designed together before production deployment.
- Never put server secrets, private player data, database files, or server-only modules in Main.

## Intended layout

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

Server/
├── .github/workflows/
├── docs/
├── tests/
├── private-data/       # runtime only; never commit
├── server.js
├── package.json
├── Dockerfile
└── compose.yaml
```

This is the target organization, not a command to move every file immediately. Existing frontend paths and route assumptions must be inventoried before files are relocated.

## Safe migration order

1. Keep the current frontend copy on Server operational while Main is prepared.
2. Inventory every page, stylesheet, browser script, image, audio file, font, and linked route.
3. Transfer frontend files to Main without changing their relative paths in the first pass. Preserve binary assets with Git operations that copy their bytes; do not recreate binary files through a text editor.
4. Add a single frontend API configuration and update API calls to use the configured backend origin.
5. Configure and test Server CORS, credentialed requests, cookie settings, HTTPS, and CSRF protections as one change.
6. Run link/path checks and test every page against a local or staging Server instance.
7. Switch the frontend deployment to Main and verify the deployed site.
8. Only then remove the compatibility frontend copy and static-file serving from Server.

## Current migration blockers

- The frontend currently lives at the root of Server.
- Browser scripts call same-origin paths such as `/api/me` and `/api/multiplayer/...`.
- Some pages refer to root-relative paths and image files.
- Binary files must be transferred without changing their contents.
- The backend deployment origin has not yet been selected/configured.

Until these are resolved, Server continues to host the existing pages for compatibility. This is temporary and does not change the intended branch ownership above.

## Branch policy

- Feature work should use short-lived `feature/*`, `fix/*`, or `chore/*` branches and pull requests.
- Keep `main` and `Server` separate; do not merge either long-lived branch wholesale into the other.
- Preserve the source branches `Cards`, `Badges`, and `SFX` until each asset is reviewed and copied to Main.
- Treat `modules` as experimental backend reference code. Integrate reviewed modules individually with tests; never bulk-replace the current Server application.
- Keep credentials, session tokens, databases, and runtime state out of Git.
