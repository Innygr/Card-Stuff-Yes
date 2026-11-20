# Card Stuff Yes Desktop

Electron desktop wrapper for the Card Stuff Yes web application.

## Requirements

- Node.js 22 or newer
- Windows x64 for the NSIS installer, or Linux x64 for AppImage/DEB
- A reachable HTTPS frontend/API deployment (or a loopback HTTP development server)

## Run locally

From this directory:

```sh
npm install
npm test
npm start
```

The default URL is `https://cardstuffyes.ca/`. To use a staging server, set `CSY_DESKTOP_URL` before starting:

Linux/macOS:
```sh
CSY_DESKTOP_URL=https://staging.example.test npm start
```

Windows PowerShell:
```powershell
$env:CSY_DESKTOP_URL = "https://staging.example.test"
npm start
```

For local development, HTTP is accepted only for `localhost`, `127.0.0.1`, and IPv6 loopback (`[::1]`). Never put credentials in the URL.

## Build installers

Build on the target operating system:

- Windows x64: `npm run dist:win`
- Linux x64: `npm run dist:linux`

Both scripts explicitly disable publishing. Output is written to `dist/`.

## Troubleshooting

- **Connection dialog on launch:** check that the configured URL is correct, resolves, uses HTTPS (unless loopback), and that the server is reachable. Choose **Retry** after fixing the issue or **Quit** to close the app.
- **Staging URL not taking effect:** set `CSY_DESKTOP_URL` in the same terminal/session that launches the app.
- **Linux desktop integration:** AppImage execution may require making the file executable (`chmod +x <file>.AppImage`). Debian packages should be installed with the distribution's package manager.
- **Installer checksum:** compare the downloaded file against its matching entry in `SHA256SUMS.txt` before running it.

## Security and limitations

The renderer has no Node.js integration or exposed privileged preload API. Context isolation, sandboxing, and web security are enabled. Navigation is confined to the configured origin; only external HTTPS links are handed to the system browser. The app uses a single-instance lock.

This is a network-dependent wrapper, not an offline client. CI artifacts are unsigned test builds, not public releases. Code signing, automatic updates, offline mode, and release publishing are not implemented.
