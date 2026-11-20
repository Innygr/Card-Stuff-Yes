# Persistent player accounts

This branch adds the first server-backed account layer while preserving the existing multiplayer player identity.

## Implemented API

All endpoints are served by the API host. Production browser pages use `https://api.cardstuffyes.ca` through `runtime-config.js`.

- `POST /api/auth/register` — creates a username/password account and links it to the current guest player's existing ID.
- `POST /api/auth/login` — verifies credentials, issues a session, and restores the account's linked player ID in the browser.
- `GET /api/auth/me` and `GET /api/me` — returns the signed-in account profile.
- `POST /api/auth/logout` — revokes the current session.
- `POST /api/auth/change-password` — verifies the current password, changes the password, and revokes all sessions so the user signs in again.
- `GET /api/account/profile` and `PUT /api/account/profile` — reads or updates the account display name and bio.
- `GET /api/account/settings` and `PUT /api/account/settings` — reads or updates validated client settings.
- `GET /api/account/decks`, `POST /api/account/decks`, `PUT /api/account/decks/:id`, and `DELETE /api/account/decks/:id` — stores up to 25 private decks per account, with catalog-validated card IDs and a 60-card cap.

Usernames are case-insensitive and limited to 3–20 letters, numbers, or underscores. Passwords are 12–128 characters. Passwords are hashed with Node's built-in scrypt implementation. Session cookies contain random opaque tokens; only SHA-256 token hashes are persisted.

## Persistence and guest linking

Accounts and sessions are stored in `private-data/accounts.json` by default, separately from `private-data/multiplayer-state.json`. Set `CSY_ACCOUNT_FILE` to override the path in tests or alternate deployments. Writes use a temporary file and atomic rename, with restrictive file permissions.

Registration links the account to the guest player's current `csyPlayerId`. Login restores that same ID. Existing match records continue to refer to the same player ID, so registering or signing in does not replace a guest's multiplayer identity.

## Required deployment configuration

Add the account frontend origin to the API server's exact CORS allowlist:

```text
CSY_ALLOWED_ORIGINS=https://account.cardstuffyes.ca,https://profile.cardstuffyes.ca,https://settings.cardstuffyes.ca,https://decks.cardstuffyes.ca,https://admin.cardstuffyes.ca,https://pvp.cardstuffyes.ca,https://play.cardstuffyes.ca
```

Keep any other currently required origins in that comma-separated value. Do not replace the existing list blindly. The API host must remain HTTPS in production so its host-only Secure cookies are sent by the browser. No cookie Domain attribute is used.

## Not implemented yet

- Email address linking and verification (the account page explicitly reports that email delivery is not configured).
- Password reset/recovery.
- Two-factor authentication and user-visible session management.
- Card inventory/unlock progression and account migration for any legacy account data.
- Admin player management.

Do not advertise these features as available until their APIs, delivery/configuration, and tests exist.

## Tests

`npm test` includes account integration coverage for guest linking, duplicate registration, origin rejection, password policy, password hashing/token storage, persistent sessions, multiplayer continuity after restart, login identity restoration, password changes, session revocation, and logout.
