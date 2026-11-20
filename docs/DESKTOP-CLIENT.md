# Desktop client (Windows and Linux)

The desktop client is an Electron shell around the hosted Card Stuff Yes web application. It keeps one game implementation and uses the same account/API behavior as the browser client.

## Current behavior
- Windows: x64 NSIS installer.
- Linux: x64 AppImage and Debian package.
- Default site: https://cardstuffyes.ca/
- Override the target during local development with `CSY_DESKTOP_URL`.
- HTTPS is required. HTTP is permitted only for localhost development.
- New windows open in the system browser only for HTTPS URLs.
- Renderer Node.js integration is disabled; context isolation and sandboxing are enabled.

## Build locally
From `desktop/`:
```sh
npm install
npm start
npm run dist
```
Build output is written to `desktop/dist/`.

## CI artifacts
The Desktop Client workflow builds Windows and Linux artifacts when desktop source changes. Artifacts are temporary CI downloads (14-day retention); they are not signed installers or a public release.

## Release requirements
Before publishing installers:
1. Confirm the canonical production site and API are live.
2. Add Windows code signing and Linux package/repository signing.
3. Add an update strategy and release-channel policy.
4. Test login, cookies, navigation, downloads, external links, and window sizing on real Windows and Linux systems.
5. Publish versioned checksums and release notes.

The desktop shell currently requires an internet connection and does not provide offline play. It does not bundle server credentials or database configuration.
