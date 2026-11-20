# Release channels and product tracks

Card Stuff Yes is released as independently versioned products. A desktop client release does not imply a server release, and future mobile/console clients must remain compatible with the documented client/server protocol.

## Product tracks

| Track | Initial targets | Status | Release rule |
|---|---|---|---|
| **Client — Desktop** | Windows x64, Linux x64 | Active | Ship installers and checksums after platform testing, security review, and explicit release approval. |
| **Server** | Linux x64, Docker/OCI container | Active | Ship the API/game server and deployment documentation independently of the desktop client. |
| **Client — Mobile** | Android first; iOS subject to feasibility and platform requirements | Planned | Do not advertise a release date until touch UX, mobile packaging, authentication, and device testing are complete. |
| **Client — Console** | Platform feasibility assessment only | Exploratory | No release commitment. Requires platform-holder developer access, platform-specific implementation, controller UX, certification, and approval. |

## Versioning

- Keep a separate version for each product track: desktop-vX.Y.Z, server-vX.Y.Z, and later mobile-vX.Y.Z or console-vX.Y.Z.
- Use semantic versioning within each track. A breaking client/server protocol change must be explicitly documented and versioned; desktop and server version numbers do not need to match.
- Record the source commit, build workflow run, supported operating systems/architectures, and SHA-256 checksums in each release.
- Use pre-release labels such as alpha, beta, or rc only when the build is intentionally distributed for testing.
- Never treat a CI artifact as a public release. Public release publication requires a separate, explicit maintainer decision.

## Desktop client release gates

- Windows x64 NSIS installer and Linux x64 AppImage/DEB build successfully.
- Automated URL-policy and packaging tests pass on the release commit.
- Install, launch, login/session, navigation, external-link, and shutdown tests pass on real supported systems.
- Checksums are generated and verified.
- Signing, update strategy, supported OS versions, and known limitations are documented.
- The client is clear that it requires a reachable Card Stuff Yes web/API service; offline play is not implied.

## Server release gates

- The supported Node.js runtime and Linux deployment targets are documented.
- A clean install/start/stop/upgrade path is tested.
- Configuration is validated at startup; secrets are external to the image and repository.
- Health checks, logs, backup/restore, and rollback procedures are documented and tested.
- Authentication, authorization, input validation, rate limits, CORS/CSRF, and transport security are reviewed.
- Database migrations have a backup and rollback plan and are applied only by an explicitly authorized operator.
- Community-hosted mode is not advertised as production-ready until signed entry tickets, public-key verification, server registration/revocation, and isolation tests exist.
- Private standalone mode is not advertised as production-ready until independent account authority, storage, signing keys, bootstrap, backup, and recovery are implemented and tested.

## Future mobile gates

- Responsive/touch-first game experience and accessible controls.
- Secure platform-appropriate sign-in and session handling.
- Android/iOS packaging, permissions, lifecycle, network changes, and device compatibility tests.
- Store policy, privacy disclosures, age-rating, and review requirements assessed before submission.

## Future console feasibility gates

- Confirm eligibility and access to the platform-holder developer program before investing in a port.
- Prototype controller-only navigation and game input without relying on keyboard, mouse, or arbitrary browser behavior.
- Assess platform networking, identity, privacy, accessibility, certification, and store requirements.
- Select a platform only after a technical prototype and approval path are realistic.
- Do not promise console support based solely on a console's built-in web browser.

## Release naming

Use clear GitHub Release titles:

- Card Stuff Yes Desktop vX.Y.Z
- Card Stuff Yes Server vX.Y.Z
- Card Stuff Yes Mobile vX.Y.Z (future)
- Card Stuff Yes Console vX.Y.Z (future)

Keep installers, container references, checksums, release notes, and supported-platform details scoped to the relevant product. Do not bundle server credentials, database files, signing private keys, or production configuration into client artifacts.