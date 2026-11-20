# Admin server logs

The admin log reader is intentionally separate from Docker. The web container receives
only a read-only bind mount containing a bounded text snapshot; it is never given the
Docker socket or permission to execute host commands.

## Admin credentials

Set `CSY_ADMIN_USERS` in the deployment environment to a JSON array. Each entry has
`username`, `rank` (`owner` or `admin`), and a scrypt `passwordHash`.

Generate a hash on the Ubuntu host with a hidden terminal prompt:

```bash
read -s -p "New admin password: " CSY_NEW_ADMIN_PASSWORD; echo
printf '%s' "$CSY_NEW_ADMIN_PASSWORD" | node scripts/hash-admin-password.js
unset CSY_NEW_ADMIN_PASSWORD
```

Use a password of at least 12 characters. Configure the variable in the deployment's
private environment file; do not commit credentials or hashes to Git. Example shape:

```json
[{"username":"your-owner-login","rank":"owner","passwordHash":"scrypt:SALT_HEX:HASH_HEX"}]
```

The login cookie is HttpOnly, SameSite=Strict, and expires after eight hours. In the
production Compose configuration, `CSY_ADMIN_COOKIE_DOMAIN=.cardstuffyes.ca` shares
the cookie between the admin page and API subdomains. Override it with an empty value
for localhost-only development. Keep the domain scoped to this project and serve the
site over HTTPS. Admin login/logout requests must come from the same origin or an exact
origin in `CSY_ALLOWED_ORIGINS`; API CORS runs before admin route dispatch. Sessions
are held in memory and are invalidated when the app restarts. Only owner/admin entries
are accepted by the log endpoint.

## Host log snapshot

Install `scripts/card-stuff-yes-log-snapshot` as
`/usr/local/sbin/card-stuff-yes-log-snapshot`, then install the two systemd unit files
from `deploy/systemd` into `/etc/systemd/system/`. The script snapshots at most the
last 1,000 lines / 24 hours from the named container, plus the latest 100 lines from the Ubuntu updater service. It writes a regular file with
read-only permissions for the app container.

Add this read-only volume to the app service:

```yaml
- ./private-logs:/app/private-logs:ro
```

Add the generated hash to the private deployment environment as a JSON value, for example `CSY_ADMIN_USERS='[{"username":"your-owner-login","rank":"owner","passwordHash":"scrypt:SALT:HASH"}]'`. Keep that file private.

Then run `systemctl daemon-reload`, enable and start
`card-stuff-yes-log-snapshot.timer`, and recreate the app container. Keep the
directory readable (0755) and snapshot file readable (0644).

The admin panel refreshes every 10 seconds and supports all/error/warning filtering,
copy, and download. Log output can contain operational details; do not share it publicly.
