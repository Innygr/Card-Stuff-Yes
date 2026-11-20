# Desktop installer smoke-test plan

This checklist is for maintainers testing Windows and Linux CI artifacts before a public desktop release. CI packaging success is not a substitute for testing on real machines.

## Record the test build

- [ ] Record the full Git commit SHA and Desktop Client workflow run.
- [ ] Download the Windows or Linux artifact from that exact successful run.
- [ ] Verify every installer against `SHA256SUMS.txt`.
- [ ] Record OS name/version, CPU architecture, test date, and result.
- [ ] Use a disposable test account; do not put production credentials in screenshots or logs.

## Windows x64 (clean test machine)

- [ ] Confirm the NSIS installer starts and identifies the publisher/signing state accurately.
- [ ] Install for the current user without administrator privileges.
- [ ] Launch from the Start menu and confirm the app opens the configured staging URL.
- [ ] Close and relaunch; confirm normal startup and single-instance behavior.
- [ ] Open a second instance; confirm it focuses the existing window.
- [ ] Test sign-in, sign-out, session persistence, deck/collection pages, and one complete game flow.
- [ ] Open an external HTTPS link; confirm it opens in the system browser.
- [ ] Confirm HTTP external links and navigation to a different app origin are blocked.
- [ ] Disconnect networking or use an unreachable staging endpoint; confirm Retry/Quit recovery works.
- [ ] Uninstall and verify the application can be removed cleanly.

## Linux x64 (clean test machine)

- [ ] Test the AppImage on a supported desktop distribution; confirm executable launch and window behavior.
- [ ] Install the DEB using the distribution package manager; confirm dependencies are reported correctly.
- [ ] Launch from the desktop application menu and from a terminal.
- [ ] Repeat sign-in, sign-out, session, game-flow, external-link, navigation-guard, and connection-failure checks.
- [ ] Confirm the package can be removed cleanly using the package manager.
- [ ] Record any distribution-specific library or desktop integration requirements.

## Security and release decision

- [ ] Confirm the renderer cannot access Node.js APIs or a privileged preload bridge.
- [ ] Confirm only the configured application origin is rendered in the app window.
- [ ] Confirm no server credentials, database URLs, signing keys, or private runtime files are bundled.
- [ ] Confirm checksum verification succeeds after downloading the artifact.
- [ ] Document all failures and retest after fixes.
- [ ] Keep builds marked as unsigned test builds until platform signing is configured and verified.
- [ ] Do not enable automatic updates until signed update metadata, artifact signing, rollback behavior, and update-host security have been reviewed.
- [ ] Obtain explicit maintainer approval before publishing any installer.

## Test record template

| Field | Value |
| --- | --- |
| Commit SHA | |
| Workflow run | |
| Artifact | |
| Operating system/version | |
| Architecture | |
| Checksum verified | |
| Install/uninstall | |
| Core app flows | |
| Navigation/security checks | |
| Result and issues | |
| Tester/date | |
