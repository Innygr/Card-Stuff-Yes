# Card Stuff Yes account email

Card Stuff Yes uses Resend for transactional mail. The Server branch already implements email verification and password recovery. These workflows remain disabled until the server has PostgreSQL account storage, a Resend API key, a verified sender, and the canonical account-site URL.

## Sender configuration

Use the Card Stuff Yes Resend API key (not the Team Blacklight key):

- From: `CardStuffYes <noreply@cardstuffyes.ca>`
- Reply-To: `contact@teamblacklight.ca`
- Public action-link origin: `https://account.cardstuffyes.ca`

The reply-to address is the Team Blacklight contact address because Card Stuff Yes is a Team Blacklight project. Replies are not routed to a separate Card Stuff Yes mailbox.

## Server-only environment

The Server branch's `compose.yaml` passes these values into the backend container through Compose variable interpolation. The existing deployment documentation identifies `/opt/card-stuff-yes-secrets/database.env` as its protected environment file. Add the email settings to that existing file rather than replacing it, so its database and other runtime settings are preserved. When running Compose, pass that file with `docker compose --env-file /opt/card-stuff-yes-secrets/database.env ...`. For a new installation, copy `.env.example` to a private `.env` beside `compose.yaml` instead.

1. Preserve the existing `DATABASE_URL` and other server settings.
2. Add the CSY-specific `RESEND_API_KEY` from Resend.
3. Add or confirm `CSY_EMAIL_FROM`, `CSY_EMAIL_REPLY_TO`, and `CSY_PUBLIC_BASE_URL` exactly as listed above.
4. Set `CSY_ACCOUNT_STORAGE=postgres` only after confirming the account database is PostgreSQL-backed and the required account migrations have been applied.
5. Restrict the environment file so only the server operator can read it (for example, `chmod 600 /opt/card-stuff-yes-secrets/database.env`).

Never commit the real `.env`, paste API keys into source files, or expose them to browser code. The example file contains placeholders only. The Resend API key is a secret; the sender and reply-to addresses are configuration, not credentials.

Required variables:

- `RESEND_API_KEY`: CSY-specific Resend API key.
- `CSY_EMAIL_FROM`: verified Resend sender, `CardStuffYes <noreply@cardstuffyes.ca>`.
- `CSY_EMAIL_REPLY_TO`: `contact@teamblacklight.ca`.
- `CSY_PUBLIC_BASE_URL`: canonical HTTPS account-site origin, `https://account.cardstuffyes.ca`.
- `CSY_ACCOUNT_STORAGE`: must be `postgres` for account email routes.
- `DATABASE_URL`: protected PostgreSQL connection string.

The app intentionally reports email actions unavailable until the provider key, sender, and HTTPS public URL are valid. Account email routes also return unavailable unless PostgreSQL account storage is enabled.

## DNS and Resend setup

1. Add `cardstuffyes.ca` as a sending domain in Resend.
2. Publish the exact domain-verification, DKIM, and SPF records Resend provides in Cloudflare DNS.
3. Coordinate SPF with any existing mailbox provider so the domain has one valid SPF policy.
4. Publish a DMARC record, starting with a monitoring policy before tightening it.
5. Preserve the existing inbound MX records and Cloudflare Email Routing. Do not replace MX records with Resend records; this project only uses Resend to send.
6. Verify the domain in Resend and create a restricted API key specifically for Card Stuff Yes.

DNS records must come from the Resend dashboard; do not guess or reuse Team Blacklight's records or API key.

## Database migration

Migration `002_account_email.sql` adds:
- `accounts.email`: current verified address.
- `accounts.email_verified_at`: verification timestamp.
- `accounts.pending_email`: proposed new address; the existing verified address stays active until confirmation.
- `account_email_tokens`: private, one-use token records.

Only SHA-256 hashes of random 256-bit tokens are stored. A partial unique index ensures at most one unconsumed token per account and purpose. Apply migrations with `npm run db:migrate` after reviewing the target database and taking a backup. Do not run migrations against production until the database and deployment have been confirmed.

## Endpoints

### Link/change email (signed in)

- `GET /api/account/email/status`
- `POST /api/account/email/request-verification` with `{ "email": "..." }`
- `POST /api/account/email/verify` with `{ "token": "..." }`

A new address is stored as pending and does not replace the current verified address until the link is consumed. Email addresses are normalized to lowercase and checked against both verified and pending addresses.

### Password recovery (signed out)

- `POST /api/auth/password-reset/request` with `{ "email": "..." }`
- `POST /api/auth/password-reset/complete` with `{ "token": "...", "password": "..." }`

The request endpoint always returns the same generic 202 response for known, unknown, and unverified addresses. Provider sending happens asynchronously so the HTTP response does not wait for a mail-provider round trip. Reset tokens expire after 30 minutes, are single-use, and are bound to the currently verified email. A successful reset updates the password and revokes every existing session in one database transaction.

## Security properties

- Exact-origin checks use the same `CSY_ALLOWED_ORIGINS` allowlist as the API CORS policy.
- Provider API calls are server-side only; no API key is exposed to clients.
- Raw tokens are only included in outbound HTTPS links; token hashes are stored in PostgreSQL.
- Verification tokens expire after 24 hours; password reset tokens expire after 30 minutes.
- Token consumption, account updates, and session revocation are transactional and row-locked.
- Rate limits are per source IP and endpoint family; password reset is additionally scoped by a one-way hash of the normalized address.
- Password reset responses do not reveal whether an address exists.
- Email action URLs are generated only from the configured HTTPS `CSY_PUBLIC_BASE_URL`; request Host headers are never used to build links.
- Token-bearing pages use a no-referrer policy and remove the token from the visible URL/history before calling the API.
- Existing username/password login remains available; email is not required to sign in.
- No emails are sent until provider credentials and the verified sender are configured.

## Frontend

- `account.html` lets a signed-in user link or change an email address.
- `verify-email.html` consumes verification links.
- `reset-password.html` supports both requesting a reset and consuming a reset link.
- `login.html` links to password recovery.

## Checks

Run `npm run check` and `npm test`. The email tests do not contact Resend and require no credentials. A real end-to-end test still requires a verified Resend domain, a protected API key, a reachable account site, and a working PostgreSQL account database.
