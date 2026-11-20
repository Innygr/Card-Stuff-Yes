# Card Stuff Yes 1.0 Release Readiness

This document defines the release gates for Card Stuff Yes 1.0. It is a planning and verification checklist, not a claim that the release is currently ready.

## Release principles

- Do not merge or deploy a release candidate until its required checks pass.
- Do not make the public domain, Resend, or custom-domain email a prerequisite for 1.0.
- Keep the Node server authoritative for authentication, permissions, game rules, and persistence.
- Never expose database credentials, Resend keys, session tokens, or private account data to browser code.
- Preserve the existing production data and the root-owned pre-PostgreSQL JSON backup until migration validation and a separate backup-retention decision are complete.
- Do not remove the Server branch's compatibility frontend until the Main frontend migration is complete and verified.

## Gate 0 — Release scope

- [ ] Agree on the exact 1.0 feature list.
- [ ] Identify explicitly deferred features and label them as such in the UI/docs.
- [ ] Confirm supported browsers, screen sizes, and minimum Node.js runtime.
- [ ] Confirm the release version and release-note owner.
- [ ] Confirm the production domain and public launch date separately from software readiness.

## Gate 1 — Frontend and navigation

- [ ] Complete the Main/Server frontend split without deleting the Server compatibility copy prematurely.
- [ ] Verify every public page and every account-only page loads its CSS, JavaScript, images, fonts, and audio.
- [ ] Verify all internal links, redirects, route mappings, and refresh/deep-link behavior.
- [ ] Verify API base URL behavior on localhost, temporary test hosts, and production hostnames.
- [ ] Verify responsive layouts and keyboard accessibility on desktop and mobile.
- [ ] Verify dark theme and that no page unintentionally falls back to unstyled/light-mode content.
- [ ] Confirm no browser bundle contains server-only modules or secrets.

## Gate 2 — Accounts and security

- [ ] Verify registration, login, logout, and session restoration against PostgreSQL.
- [ ] Verify password change and session revocation behavior.
- [ ] Verify profile and settings reads/writes are scoped to the authenticated account.
- [ ] Verify saved-deck create/read/update/delete, ownership checks, card-ID validation, and configured limits.
- [ ] Verify admin routes enforce server-side authorization; hidden UI alone is not authorization.
- [ ] Verify exact-origin checks, CORS, cookie flags, HTTPS, and CSRF protections as one integrated deployment configuration.
- [ ] Verify rate limits and safe error responses for authentication and account endpoints.
- [ ] Verify private data files, environment files, backups, and database credentials cannot be served as static assets.
- [ ] Document account recovery limitations if email delivery is not configured.

## Gate 3 — Persistence and operations

- [ ] Run database migrations from a clean test database and from the current schema.
- [ ] Verify the JSON-to-PostgreSQL import is idempotent and preserves account IDs, player IDs, password hashes, profiles, settings, decks, and valid sessions.
- [ ] Verify account, profile, settings, and deck data survives container recreation and host reboot.
- [ ] Verify multiplayer state persistence and document its limitations.
- [ ] Take and verify a restorable database backup before production schema changes.
- [ ] Document rollback steps for the application image and database migration.
- [ ] Verify container health checks, restart behavior, logs, resource limits, and update service behavior.
- [ ] Confirm secrets are stored only in protected host-side configuration and are not committed to Git.

## Gate 4 — Gameplay and regression testing

- [ ] Test creating, joining, refreshing, leaving, and completing multiplayer matches with two independent browser sessions.
- [ ] Test server-authoritative turn order, action validation, card costs/effects, health, shields, and win/loss outcomes.
- [ ] Test invalid, stale, duplicate, and out-of-turn actions.
- [ ] Test reconnects and server restarts during waiting and active matches.
- [ ] Run the full automated test suite and syntax/integrity checks.
- [ ] Perform manual browser smoke tests on supported desktop and mobile browsers.
- [ ] Check browser console, server logs, and network requests for unexpected errors.

## Gate 5 — Release candidate

- [ ] Freeze the 1.0 scope and create a release-candidate branch/tag strategy.
- [ ] Ensure all required PRs are merged into their intended long-lived branch; do not merge the long-lived Main and Server branches wholesale.
- [ ] Build the exact container image intended for release and record its immutable digest.
- [ ] Deploy the candidate to a test environment using production-like configuration.
- [ ] Complete the release smoke-test checklist.
- [ ] Verify backup restoration and rollback procedure.
- [ ] Prepare release notes, known limitations, and user-facing support/contact information.
- [ ] Obtain explicit approval before production deployment.

## Optional integrations — not 1.0 blockers

- Custom domain registration and Cloudflare DNS.
- Resend transactional email, email verification, and password recovery delivery.
- Hosted mailbox service or self-hosted Team Blacklight mail project.
- Avatar/object storage, realtime presence, and other nonessential integrations.

## Release-day checklist

- [ ] Confirm the production backup completed and is restorable.
- [ ] Confirm the exact image digest and configuration.
- [ ] Apply only reviewed, tested database migrations.
- [ ] Deploy with an explicit operator approval.
- [ ] Verify health endpoint, login, account data, decks, and a two-player match.
- [ ] Monitor application/database logs and error rates.
- [ ] Keep rollback image and recovery instructions available.

## Known planning cautions

- A successful CI run does not replace end-to-end browser testing.
- A successful database connection does not prove backup restoration or migration rollback.
- Temporary Cloudflare Quick Tunnels are public test endpoints, not production hosting.
- Email features must remain disabled until a verified sending domain, valid sender, canonical HTTPS URL, and secret API key are configured.
- Do not describe the product as release-ready until every required gate above has evidence recorded.
