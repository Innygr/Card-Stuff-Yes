# Card Stuff Yes 1.0 release checklist

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
- [ ] Confirm admin authorization is enforced server-side and owner-only actions are tested.
- [ ] Review rate limits, input validation, CORS allowlists, and security headers.

## Desktop release

- [ ] Build Windows x64 NSIS installer on the Windows runner.
- [ ] Build Linux x64 AppImage and Debian package on the Linux runner.
- [ ] Confirm desktop URL-policy tests pass on both operating systems.
- [ ] Verify each platform artifact includes `SHA256SUMS.txt` and validate every checksum.
- [ ] Install and launch the Windows build on a clean Windows test machine.
- [ ] Install and launch the Linux AppImage and Debian package on supported distributions.
- [ ] Test login, logout, session persistence, navigation, external links, and window lifecycle.
- [ ] Verify the app cannot navigate away from the configured application origin.
- [ ] Decide whether code signing is required before distribution; unsigned builds must be clearly identified.
- [ ] Define a secure update strategy before enabling automatic updates.

## Release publication

- [ ] Freeze the exact source commit and record its full SHA.
- [ ] Confirm all required CI workflows pass for that exact SHA.
- [ ] Review generated wiki pages and ensure `docs/` remains the canonical source.
- [ ] Prepare release notes, known limitations, supported platforms, and installation instructions.
- [ ] Publish checksums alongside installers and verify downloaded files.
- [ ] Publish only after maintainers explicitly approve the release.
- [ ] Monitor application health, error logs, and support reports after release.

## Current known limitations

- Desktop client is an Electron wrapper around the hosted web app; it is not an offline game client.
- The default production URL is a future target until the website deployment is confirmed.
- Desktop installers are unsigned CI test builds unless a later release explicitly adds signing.
- Automatic updates and a public release-publishing workflow are not implemented.
- Database migrations must be applied separately and are not performed by CI.
