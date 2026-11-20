# Frontend migration — phase 2

## What moved

The migration branch now contains the Server branch's existing browser-facing files
and static assets, copied by Git blob identity so text and binary files remain
byte-for-byte identical.

- Homepage and root landing page: `homepage.html`, `homepage.js`, `index.html`
- Loading screen: `loading.html`, `loading.css`, `loading.js`
- Solo battle: `cardgame.html`, `cardgame.css`, `cardgame.js`
- Online play: `multiplayer.html`, `multiplayer.css`, `multiplayer.js`
- Account/profile/settings/admin, deck builder, set manager, news, and help pages
- Shared styles, alerts, mobile helpers, card data, and static media

The three existing placeholder card-game files on Main were replaced with the
current Server versions. Existing Main documentation, workflows, and project
files were preserved. Server was not changed.

## Deliberately not moved

Backend runtime files and deployment-specific content remain on Server:
`server.js`, backend modules, `package.json`, `config.json`, tests,
deployment scripts, and the Server runtime-config copy. The migration branch
keeps its own runtime configuration and shared `api.js` boundary.

## Integration status and known blockers

Copying the frontend is not the same as completing the cross-subdomain
migration. Page-specific API integration is still pending:

- Homepage and multiplayer already load runtime configuration and use the
  configured API origin.
- Account and profile scripts still call same-origin account endpoints.
- Admin and admin-login scripts now use the configured API origin and include
  credentials. Server PR #23 proposes the required CORS and host-only admin
  session integration; keep this path pending until that PR is merged and
  deployed.
- Owner/admin login, session lookup, logout, and bounded server-log reads
  already exist on Server. Player-management and news-management endpoints
  remain unfinished.
- The Server DNS map documents account/profile workflows as unfinished.
- Cookie/CORS/CSRF behavior must be tested from each final HTTPS subdomain
  before any production route is switched.
- Some pages are informational/static and do not need API access.

Do not remove the Server compatibility frontend or switch production routing
until the endpoint audit, browser tests, and staging checks are complete.

## Validation so far

- GitHub Pages/Jekyll build passed on the migration commit.
- The PR validation workflow is running for the latest commit.
- The files were copied using existing Git blob SHAs, preserving binary bytes.
- No DNS, Cloudflare Tunnel, Nginx, Ubuntu host, or live deployment changes
  were made.
