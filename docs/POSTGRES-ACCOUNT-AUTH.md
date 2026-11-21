# PostgreSQL account storage

PostgreSQL-backed account storage is implemented as an opt-in server mode.
The default remains the existing JSON account adapter.

## Enabled capabilities

With `CSY_ACCOUNT_STORAGE=postgres`, the account adapter routes account
registration, login, session lookup/logout, password changes, profile
reads/writes, settings, saved decks, and the community join-ticket authority
routes through PostgreSQL.

The adapter:
- Uses the private `csy_private` schema and parameterized SQL.
- Stores only SHA-256 hashes of opaque account-session tokens.
- Uses the existing scrypt password-hash format and password policy.
- Preserves the existing guest player ID when an account is created.
- Validates settings against the shared allowlist.
- Validates saved-deck card IDs against the current card catalog and enforces
  the existing deck/card limits.
- Keeps database credentials and account session records server-side.

The JSON-to-PostgreSQL import utility is available at
`scripts/import-json-accounts.js`. It requires an explicit dry-run or apply
mode and rejects conflicting existing profiles rather than silently
overwriting them.

## Deployment status

**Do not enable PostgreSQL account storage on a production server solely
because the adapter and automated tests exist.** A deployment still needs a
verified database, correctly applied schema migrations, a reviewed import
plan, a restorable backup, and an end-to-end test against a disposable
PostgreSQL instance.

Until that operational checklist is complete:
- Leave `CSY_ACCOUNT_STORAGE` unset on the live host.
- Do not add it to a production Compose environment.
- Do not restart or redeploy production as part of development work.
- Preserve the JSON account file and independent backups.

## Database and session boundaries

The browser calls the Node API; it never receives PostgreSQL credentials.
Account session tokens are opaque random values, while only their SHA-256
hashes are stored in the database. The official account authority retains
account credentials, recovery/session records, and account data. Community
hosts must not receive database credentials or official account cookies.

## Reverse proxy and rate limiting

The account login rate limiter uses the direct TCP peer address by default.
It honors `CF-Connecting-IP` or the first `X-Forwarded-For` address only
when `CSY_TRUST_PROXY=true`.

Set that flag only if the Node process is reachable exclusively through a
trusted ingress that strips client-supplied forwarding headers and writes
its own. Do not enable it when clients can reach the application directly.
The flag also controls whether the server trusts `X-Forwarded-Proto` for
HTTPS detection and secure-cookie handling.

## Validation still required

Automated tests cover account route selection, password hashing, session
behavior, profile/settings/deck validation, import safeguards, and rate-limit
behavior. Before production activation, still complete:
- A disposable-PostgreSQL integration run covering the current migrations.
- A full JSON-account import dry-run and independent review of its report.
- A verified backup and restore rehearsal.
- A staged login, logout, password-change, profile, settings, and deck test.
- An explicit operator decision to enable the feature and a rollback plan.

No production database migration or account-storage switch is performed by
this documentation or by the development workflows.
