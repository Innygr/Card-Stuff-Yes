# Release channels and product tracks

Card Stuff Yes is released as independently versioned products. A client release does not imply a server release, and every client must remain compatible with the documented client/server protocol.

## Product tracks

| Track | Initial targets | Status | Release rule |
|---|---|---|---|
| **Client — Web** | Modern desktop and mobile browsers | Active | Responsive web client; publish only after browser and accessibility testing. |
| **Client — Desktop** | Windows x64, Linux x64 | Active | Ship installers and checksums after platform testing, security review, and explicit release approval. |
| **Server** | Linux x64, Docker/OCI container | Active | Ship the API/game server and deployment documentation independently of clients. |
| **Client — Android** | Android phones and tablets | Planned | Native/package work follows touch UX, authentication, lifecycle, compatibility, privacy, and store review gates. |
| **Client — iOS/iPadOS** | iPhone and iPad | Planned | Subject to platform feasibility, touch UX, authentication, lifecycle, compatibility, privacy, and App Store review. |
| **Client — TV / living-room** | Smart TVs and streaming devices | Exploratory | Evaluate supported TV platforms and remote-control navigation; do not assume all TV browsers behave alike. |
| **Client — Console** | Major console families | Exploratory | Requires platform-holder developer access, platform-specific implementation, controller UX, certification, and approval. |
| **Client — Smart appliances / embedded** | Smart displays, refrigerators, and other capable embedded browsers | Exploratory | Prefer a lightweight responsive/PWA experience where supported; test browser capabilities, input, memory, connectivity, and screen sizes per device. No universal compatibility promise. |

“All platforms” is a long-term compatibility goal, not a claim that every device can run the current desktop package. Each platform must have a viable supported runtime, input model, secure authentication path, update mechanism, and test target before it is called supported.

## Versioning

- Keep a separate semantic version for each product track, such as desktop-vX.Y.Z, web-vX.Y.Z, server-vX.Y.Z, android-vX.Y.Z, and ios-vX.Y.Z.
- A breaking client/server protocol change must be explicitly documented and versioned; client and server version numbers do not need to match.
- Record source commit, build workflow run, supported operating systems/architectures/devices, and SHA-256 checksums where applicable.
- Use pre-release labels such as alpha, beta, or rc only when the build is intentionally distributed for testing.
- Never treat a CI artifact as a public release. Public release publication requires a separate, explicit maintainer decision.

## Mandatory update policy

- Every released client must identify its product track, platform, and installed version when checking the release policy service.
- The service response must distinguish an optional update from a **minimum-required version**. Only a minimum-required version blocks continued use.
- When the installed version is below the minimum-required version, the client must show a blocking update screen with the approved release notes and a verified update destination.
- The user may install/update or exit. Closing or declining the update must close the client; it must not return to the old application.
- Clients must fail closed when they cannot verify a required-update policy, rather than silently treating an unknown policy as permission to run. Provide a clear retry/exit path for temporary network failures.
- Do not download or execute arbitrary update binaries. Use platform-trusted distribution channels (signed desktop installers/packages, official mobile stores, managed console/TV stores, or the signed web deployment). Verify signatures/checksums where the platform supports them.
- Web clients cannot close a browser tab reliably. They must block application interaction with a full-page update-required screen and offer reload/open-release actions.
- The server must enforce protocol/API compatibility independently; client-side blocking is not an authorization or security boundary.
- Emergency minimum-version changes require an authorized release operator and an auditable change record.

## Desktop client release gates

- Windows x64 NSIS installer and Linux x64 AppImage/DEB build successfully.
- Automated URL-policy, update-policy, and packaging tests pass on the release commit.
- Install, launch, login/session, navigation, external-link, update-required, and shutdown tests pass on real supported systems.
- Checksums are generated and verified; signing is documented and enabled before broad public distribution where appropriate.
- The client clearly states that it requires a reachable Card Stuff Yes web/API service; offline play is not implied.

## Server release gates

- The supported Node.js runtime and Linux deployment targets are documented.
- A clean install/start/stop/upgrade path is tested.
- Configuration is validated at startup; secrets are external to the image and repository.
- Health checks, logs, backup/restore, and rollback procedures are documented and tested.
- Authentication, authorization, input validation, rate limits, CORS/CSRF, and transport security are reviewed.
- Database migrations have a backup and rollback plan and are applied only by an explicitly authorized operator.
- Community-hosted mode is not advertised as production-ready until signed entry tickets, public-key verification, server registration/revocation, and isolation tests exist.
- Private standalone mode is not advertised as production-ready until independent account authority, storage, signing keys, bootstrap, backup, and recovery are implemented and tested.
- Release policy changes are authenticated, auditable, and served over HTTPS; clients must not trust policy values supplied by an untrusted client.

## Future mobile gates

- Responsive/touch-first game experience and accessible controls.
- Secure platform-appropriate sign-in and session handling.
- Android/iOS packaging, permissions, lifecycle, network changes, and device compatibility tests.
- Store policy, privacy disclosures, age-rating, and review requirements assessed before submission.
- Required updates use the platform's official store/update mechanism; do not sideload unsigned packages.

## Future TV, console, and embedded-device gates

- Confirm the platform has a supported browser/runtime and an approved distribution path.
- Prototype remote/controller/touch/limited-input navigation without depending on keyboard and mouse.
- Assess memory, rendering performance, networking, identity, privacy, accessibility, and platform certification.
- For smart appliances, use a minimal responsive web/PWA surface when the built-in browser supports the required web standards; do not promise native installation or background updating.
- Select and certify device families individually. A successful test on one smart TV or refrigerator does not imply compatibility with all models.

## Release naming

Use clear GitHub Release titles:

- Card Stuff Yes Web vX.Y.Z
- Card Stuff Yes Desktop vX.Y.Z
- Card Stuff Yes Server vX.Y.Z
- Card Stuff Yes Android vX.Y.Z (future)
- Card Stuff Yes iOS vX.Y.Z (future)
- Card Stuff Yes TV / Embedded vX.Y.Z (future, only for a defined device family)
- Card Stuff Yes Console vX.Y.Z (future)

Keep installers, container references, checksums, release notes, and supported-platform details scoped to the relevant product. Do not bundle server credentials, database files, signing private keys, or production configuration into client artifacts.
