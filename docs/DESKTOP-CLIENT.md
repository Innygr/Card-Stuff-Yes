# Desktop client (Windows and Linux)

## Status and architecture

The initial desktop client is an Electron shell around the Card Stuff Yes web frontend. It reuses the browser game and API rather than duplicating game logic. The site deployment is not ready yet, so the default URL is a future production target, not a claim that the public site is currently live.

Set `CSY_DESKTOP_URL` to a reachable HTTPS staging site to test. HTTP is accepted only for loopback development hosts (`localhost` and `127.0.0.1`). No server credentials or database configuration are bundled.

## Platforms and outputs

- Windows x64: NSIS installer.
- Linux x64: AppImage and Debian package.
- Build artifacts are uploaded by GitHub Actions and retained for 14 days; they are not automatically published as a release. Each platform artifact includes `SHA256SUMS.txt` for corruption checks.
- Local build scripts are platform-specific: `npm run dist:win` on Windows and `npm run dist:linux` on Linux. Both explicitly disable publishing.

## Local development

See [`desktop/README.md`](../desktop/README.md) for the standalone setup and troubleshooting guide.

From `desktop/`:

```sh
npm install
CSY_DESKTOP_URL=https://your-staging-host.example npm start
npm test
```

Build on the matching operating system:

```sh
npm run dist:win
```

or:

```sh
npm run dist:linux
```

On Windows PowerShell, set the environment variable with `$env:CSY_DESKTOP_URL="https://your-staging-host.example"`.

## Downloading CI builds

1. Open the repository's **Actions** tab and select a successful **Desktop Client** run on the intended commit.
2. Download the platform artifact (`card-stuff-yes-windows` or `card-stuff-yes-linux`) from the run's **Artifacts** section and extract it.
3. Verify the installer against `SHA256SUMS.txt` before opening it. On Linux, run `sha256sum -c SHA256SUMS.txt`; on Windows, compare `Get-FileHash <installer> -Algorithm SHA256` with the matching entry.
4. These are CI test builds, not signed public releases. Only use builds from a trusted successful workflow run.

## Security controls

- Renderer Node.js integration is disabled; the preload script intentionally exposes no privileged bridge.
- Context isolation, sandboxing, and web security are enabled.
- Top-level navigation and redirects are restricted to the configured origin.
- External HTTPS links open in the system browser; failed browser launches are handled without crashing the app.
- A single-instance lock prevents duplicate app processes and focuses the existing window.
- Loopback development URLs support localhost, IPv4, and IPv6.
- Non-HTTPS external links and script/data URLs are blocked.
- A recoverable Retry/Quit dialog handles main-frame load failures and makes the network dependency explicit.
- Automated Node.js tests cover IPv6 loopback, origin/port confinement, rejected non-HTTPS external schemes, platform packaging targets, non-publishing build scripts, Electron security settings, preload isolation, and load-failure recovery.

## Release gates

Before publishing installers:
1. Deploy and verify a staging frontend/API environment.
2. Test login, session persistence, game flows, downloads, and external links on real Windows and Linux systems.
3. Add Windows code signing and Linux package/repository signing.
4. Define update channels and a secure update strategy.
5. Publish versioned checksums and release notes.

Offline play, auto-updates, code signing, and public release publishing are not implemented yet.
