# Card Stuff Yes container

The `Server` branch contains the Node.js web and multiplayer server. The
container image is published to GitHub Container Registry (GHCR) after a push
to `Server`, and only after the syntax checks, integration tests, and Docker
build pass.

## Image

```text
ghcr.io/innygr/card-stuff-yes:server
```

A commit-specific image is also published with a `sha-<commit>` tag.

## Run with Docker Compose

On the Ubuntu host, place `compose.yaml` in a dedicated Card Stuff Yes
directory, then run:

```bash
docker compose pull
docker compose up -d
docker compose ps
docker compose logs -f
```

The service listens on port 6565. Put a properly configured HTTPS reverse
proxy in front of it before making it publicly reachable.

## Persistent data

Compose creates a named Docker volume called `card-stuff-yes-data`. It is
mounted at `/app/private-data`, where the server stores
`multiplayer-state.json`. Replacing the container image does not replace
this volume. Do not remove the volume when updating the application.

## GHCR authentication

If the GHCR package is private, authenticate the Ubuntu host to
`ghcr.io` using a GitHub account or deploy identity with package read access.
Use a fine-scoped credential stored on the host; never put it in this
repository, the Docker image, or the Compose file.

## Separation from other containers

The Compose service has its own container name, port mapping, and named data
volume. It does not modify or manage other Docker containers on the host.
