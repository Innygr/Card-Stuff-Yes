# Card Stuff Yes 1.0 release readiness checklist

This checklist covers the initial desktop and server product releases. They are independently versioned and may ship at different times. See [RELEASE-CHANNELS.md](RELEASE-CHANNELS.md) for product tracks, versioning, and future mobile/console gates.

This checklist is the release gate for the first public 1.0 release. A checked CI workflow is not, by itself, approval to deploy or publish.

## Product and deployment readiness

- [ ] Confirm the production domain and DNS are owned and controlled by the project maintainers; follow [DOMAIN-SETUP.md](DOMAIN-SETUP.md).
- [ ] Deploy the web frontend and API to a staging environment first.
- [ ] Verify HTTPS, CORS, session cookies, API routing, and health checks.
- [ ] Apply database migrations only after a reviewed backup and a documented rollback plan.
- [ ] Test account creation, sign-in/out, session expiry, password reset, and account recovery.
- [ ] Test guest and registered-player flows separately.
- [ ] Test deck creation, editing, import/export, collection, and public news.
- [ ] Verify role checks on every administrative endpoint; never trust client-side role flags.
- [ ] Confirm production data is backed up and restore procedures have been tested.
- [ ] Review privacy disclosures, terms, data retention, and account deletion behavior.

## Security and secrets

- [ ] Run Secret Hygiene on the exact release commit and confirm it passes.
- [ ] Confirm all credentials are stored in protected runtime configuration or GitHub Actions secrets.
- [ ] Rotate any credential that has ever been committed to a repository, even if the file was later removed.
- [ ] Verify public documentation, build logs, artifacts, and source maps contain no secrets.
- [ ] Review dependency updates and known vulnerability reports.
- [ ] Complete the [dependency reproducibility requirements](DEPENDENCY-REPRODUCIBILITY.md): commit reviewed lockfiles and use `npm ci` in CI/container builds.
- [ ] Confirm admin authorization is enforced server-side and owner-only actions are tested.
- [ ] Review rate limits, input validation, CORS allowlists, and security headers.

## Desktop client release

- [ ] Build Windows x64 NSIS installer on the Windows runner.
- [ ] Build Linux x64 AppImage and Debian package on the Linux runner.
- [ ] Confirm desktop URL-policy tests pass on both operating systems.
- [ ] Verify each platform artifact includes `SHA256SUMS.txt` and validate every checksum.
- [ ] Install and launch the Windows build on a clean Windows test machine.
- [ ] Install and launch the Linux AppImage and Debian package on supported distributions.
- [ ] Complete and retain the platform test record in [DESKTOP-SMOKE-TEST.md](DESKTOP-SMOKE-TEST.md) for both Windows and Linux.
- [ ] Test login, logout, session persistence, navigation, external links, and window lifecycle.
- [ ] Verify the app cannot navigate away from the configured application origin.
- [ ] Decide whether code signing is required before distribution; unsigned builds must be clearly identified.
- [ ] Define a secure update strategy before enabling automatic updates.

## Server release

- [ ] Confirm supported Node.js version, Linux targets, and container runtime.
- [ ] Test clean installation, startup, shutdown, upgrade, and rollback.
- [ ] Verify runtime configuration validation and that secrets are external to the image/repository.
- [ ] Test health checks, logs, backup/restore, and recovery procedures.
- [ ] Review authentication, authorization, input validation, rate limits, CORS/CSRF, and TLS deployment.
- [ ] Review and document every database migration, including backup and rollback; do not apply migrations automatically during release.
- [ ] Clearly document which APIs and game features are implemented versus planned.
- [ ] Do not claim community-hosted account federation or private standalone account isolation is ready until the requirements in [COMMUNITY-SERVERS.md](COMMUNITY-SERVERS.md) are implemented and tested.

## Release publication

- [ ] Select the product track (Desktop or Server); do not imply that releasing one also releases the other.
- [ ] Freeze the exact source commit and record its full SHA.
- [ ] Confirm all required CI workflows pass for that exact SHA.
- [ ] Review generated wiki pages and ensure `docs/` remains the canonical source.
- [ ] Prepare release notes, known limitations, supported platforms, and installation instructions.
- [ ] Publish checksums alongside installers and verify downloaded files.
- [ ] Publish only after maintainers explicitly approve the release.
- [ ] Monitor application health, error logs, and support reports after release.

## Current known limitations

- Desktop client is an Electron wrapper around the hosted web app; it is not an offline game client.
- Desktop and server builds are separate product releases with separate version numbers.
- Mobile is planned, not currently supported as a released application.
- Console support is exploratory and has no committed platform or release date.
- Community-hosted federation and private standalone account isolation are not implemented.
- The default production URL is a future target until the website deployment is confirmed.
- Desktop installers are unsigned CI test builds unless a later release explicitly adds signing.
- Automatic updates and a public release-publishing workflow are not implemented.
- Database migrations must be applied separately and are not performed by CI.
