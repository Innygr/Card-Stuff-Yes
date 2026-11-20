# Dependency reproducibility

This is a tracked release-readiness item for the Desktop and Server release tracks.

## Current state (20 November 2026)

| Component | Direct dependencies | Lockfile | Status |
|---|---|---|---|
| Desktop (`desktop/`) | Electron `39.2.0`, electron-builder `26.0.12` (exact direct-version pins) | No `desktop/package-lock.json` | CI installs exact direct versions; transitive dependency resolution can still change between builds. |
| Server | `pg` `8.16.3` (exact version) | No root `package-lock.json` on the Server branch | Direct dependency is pinned, but transitive resolution is not locked. Desktop direct dependencies are now also exact-version pinned; neither component has a lockfile yet. |

## Required before 1.0 release

1. Generate each lockfile with a supported Node.js/npm toolchain in a network-enabled environment.
2. Review the generated lockfile; do not hand-author or guess integrity hashes.
3. Change CI and container installation to `npm ci` where a lockfile is present.
4. Add a clean-install CI check that fails if the lockfile is missing or out of sync with its package manifest.
5. Rebuild Windows, Linux, and Server container artifacts from the lockfile-backed installs.
6. Record the Node.js and npm versions used by CI and the release build.

## Safe handling

- Do not commit `.env`, registry credentials, npm tokens, or private package configuration.
- Do not use a developer's local `node_modules` as a substitute for a lockfile.
- Do not fabricate lockfile entries or integrity values.
- Until the lockfiles are generated and CI uses `npm ci`, builds are testable but not fully dependency-reproducible.

This document records the current gap; it does not claim that the lockfile work is complete.
