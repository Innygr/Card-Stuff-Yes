# Server container release

This guide describes building and distributing the Card Stuff Yes server container. It does not authorize production deployment or database migration.

## Build and test locally

From the repository root on the `Server` branch:

```sh
npm ci
npm run check
npm test
docker build --tag card-stuff-yes:local .
```

If the repository does not yet contain a committed lockfile, `npm ci` will fail; create and review the lockfile as a separate dependency-management change before relying on reproducible installs.

## Container configuration

- The image uses Node.js 22 and runs as the unprivileged `node` user.
- Bind the service to a private interface or place it behind a TLS-terminating reverse proxy. Do not expose the prototype directly to the public internet.
- Keep `private-data/` in a persistent, access-controlled volume. It contains account and/or multiplayer runtime data and must not be committed or included in a public image.
- Supply database URLs, admin bootstrap credentials, email credentials, and signing keys only through protected runtime secrets. Never bake them into the image or Compose file.
- Back up persistent data before upgrades and test restore procedures.
- Configure exact trusted frontend origins and secure cookie settings for the real deployment. Do not copy example origins blindly.
- The current multiplayer snapshot is JSON-based prototype persistence; it is not suitable for concurrent multi-process writers or high-availability operation.

## Compose

The repository's `compose.yaml` is a starting point, not a production-ready turnkey deployment. Review its image reference, port exposure, allowed origins, volume permissions, reverse-proxy/TLS arrangement, and environment values before use. Prefer binding the application port to loopback when a reverse proxy runs on the same host.

## CI and package publication

- Pushes to `Server` run syntax checks, integration tests, and a container build without publishing the image.
- A maintainer must explicitly create and push a version tag matching `server-v*` to publish to GitHub Container Registry.
- The workflow emits the stable `server` tag, the version tag, and a commit-SHA tag. Do not use the mutable `server` tag for reproducible deployments; pin a version or SHA tag.
- CI publication is not a production deployment and does not apply database migrations.

## Current product limitations

The current server includes the multiplayer prototype and APIs documented in the Server README. Community-hosted federation and private standalone account isolation remain unimplemented. Do not advertise those modes as ready until their authentication, storage boundaries, and security tests are complete.