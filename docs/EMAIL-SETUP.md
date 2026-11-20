# Card Stuff Yes account email

Card Stuff Yes uses Resend for transactional mail. The server-side workflows support email linking/verification and password recovery. They remain disabled until the provider, sender, and canonical account-site URL are configured.

## Server-only environment

Add these to the root-owned environment file used by the Docker Compose service (for this installation, `/opt/card-stuff-yes-secrets/database.env` is already mounted as an env file):

- `RESEND_API_KEY`: Resend API key. Secret; never commit or expose to browser code.
- `CSY_EMAIL_FROM`: verified sender, e.g. `Card Stuff Yes <noreply@cardstuffyes.ca>`.
- `CSY_PUBLIC_BASE_URL`: canonical HTTPS origin hosting the account pages, e.g. `https://account.cardstuffyes.ca`.

All three must be valid before email actions are enabled. The server fails closed when any is missing. Do not use a temporary Quick Tunnel URL as the production base URL.

## DNS and provider setup (later)

1. Add `cardstuffyes.ca` as a sending domain in Resend.
2. Add the exact verification/DKIM/SPF records Resend provides.
3. Coordinate SPF with any mailbox provider so the domain has one valid SPF policy.
4. Publish a DMARC record and start with a monitoring policy before tightening it.
5. Keep inbound MX records for the mailbox provider; do not replace them with sending-provider records unless its instructions explicitly require it.
6. Verify the domain in Resend and create a restricted API key for this application.

DNS records must come from the provider dashboard; do not guess them.

## Database migration

Migration `002_account_email.sql` adds:
- `accounts.email`: current verified address.
- `accounts.email_verified_at`: verification timestamp.
- `accounts.pending_email`: proposed new address; the existing verified address stays active until confirmation.
- `account_email_tokens`: private, one-use token records.

Only SHA-256 hashes of random 256-bit tokens are stored. A partial unique index ensures at most one unconsumed token per account and purpose. Apply migrations with `npm run db:migrate` after this change is merged and deployed. The migration is additive and does not change existing passwords, accounts, player IDs, sessions, decks, or settings.

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

Run `npm run check` and `npm test`. The email tests do not contact Resend and require no credentials.
