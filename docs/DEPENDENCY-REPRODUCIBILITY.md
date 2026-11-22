# Dependency reproducibility

This is a tracked release-readiness item for the Desktop and Server release tracks.

## Current state (22 November 2026)

| Component | Direct dependencies | Lockfile | Install behavior | Status |
|---|---|---|---|---|
| Desktop (`desktop/`) | Electron `39.2.0`, electron-builder `26.0.12` (exact direct-version pins) | No `desktop/package-lock.json` | Desktop CI currently runs `npm install` | Transitive dependency resolution can change between builds. A reviewed lockfile and `npm ci` are still required. |
| Server | `pg` `8.16.3` (exact version) | Root `package-lock.json` is present on the `Server` branch | The current container build and CI workflow still use `npm install` | The lockfile exists, but the build does not yet enforce it. A release-preparation PR is changing CI and the Dockerfile to `npm ci`. |

## Required before 1.0 release

1. Generate the Desktop lockfile with a supported Node.js/npm toolchain in a network-enabled environment.
2. Review the generated lockfile; do not hand-author or guess integrity hashes.
3. Use `npm ci` in Desktop CI after the lockfile is committed.
4. Use `npm ci` in Server CI and the container build; verify the Server lockfile is committed and synchronized with `package.json`.
5. Add clean-install checks that fail if a lockfile is missing or out of sync with its package manifest.
6. Rebuild Windows, Linux, and Server container artifacts from lockfile-backed installs.
7. Record the Node.js and npm versions used by CI and the release build.

## Safe handling

- Do not commit `.env`, registry credentials, npm tokens, or private package configuration.
- Do not use a developer's local `node_modules` as a substitute for a lockfile.
- Do not fabricate lockfile entries or integrity values.
- Until both product tracks use reviewed lockfiles with `npm ci`, builds are testable but not fully dependency-reproducible.

This document records the current gap; it does not claim that the lockfile work is complete.
