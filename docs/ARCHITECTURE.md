# Frontend and backend architecture

## Branch ownership
| Branch | Owns | Must not contain |
| --- | --- | --- |
| `main` | Browser frontend, desktop client source, public assets, frontend documentation | Server implementation, credentials, private player data, database/runtime state |
| `Server` | Node.js API, authentication/game rules, multiplayer, persistence, backend tests, server deployment files | Canonical browser frontend and desktop client source |

Keep the two long-lived branches separate; do not merge either wholesale into the other.

## Runtime relationship
- Browser and desktop clients use the same hosted frontend/API behavior.
- The desktop app is an Electron shell and does not contain backend secrets.
- The Server branch exposes the API consumed by the clients.
- Browser and desktop clients must never receive database URLs, provider API keys, admin credentials, or private signing keys.
- Runtime secrets are injected into the server process from a protected environment file outside the repository.
- CI-only secrets belong in GitHub Actions Secrets or protected Environments.

## Desktop client
The Windows and Linux desktop client is maintained under `desktop/` on `main`. See [DESKTOP-CLIENT.md](DESKTOP-CLIENT.md) for build and release details.

## Documentation
Markdown in `docs/` is canonical. The Wiki workflow mirrors those files into GitHub Wiki pages. Edit the source document under `docs/`; do not edit generated Wiki pages directly.

## Secret handling
Keep `.env`, local config, credentials, session tokens, databases, and runtime state out of Git. A secret scanner checks tracked repository history on pushes and pull requests. If a secret is exposed, rotate it first; deleting the latest file does not remove it from Git history.
