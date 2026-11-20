# PostgreSQL account and profile adapter

This is the first application adapter for the private Supabase schema. It is intentionally opt-in.

## Current behavior

Set `CSY_ACCOUNT_STORAGE=postgres` to route account registration, login, session lookup/logout, password changes, and profile reads/writes through PostgreSQL. The adapter uses the existing scrypt password-hash format, keeps only SHA-256 hashes of opaque session tokens in `csy_private.account_sessions`, and preserves the guest player ID when an account is created.

Without that environment variable, the existing JSON account implementation remains unchanged.

## Important: do not enable on the live server yet

This PR does not import existing `private-data/accounts.json` records. If the flag is enabled before the JSON accounts have been safely imported, existing accounts will not be visible to the PostgreSQL login handler.

Player settings and saved decks now use PostgreSQL in this branch. Settings are stored as validated JSONB; saved decks and ordered card IDs use the private `decks` and `deck_cards` tables. Existing deck limits and catalog-ID validation are preserved.

Therefore:
- Keep `CSY_ACCOUNT_STORAGE` unset on the Ubuntu production host.
- Do not add it to the live Compose environment yet.
- Do not restart or redeploy production for this PR.
- Keep the existing JSON account file and backups intact.
- Complete the data import, settings/decks adapter, and end-to-end tests before enabling the flag.

## Database behavior

The adapter writes only to the private `csy_private` schema. It uses parameterized SQL, a transaction for account creation, database unique constraints for username/player-ID uniqueness, and the existing password policy. The browser never receives database credentials and continues to call the Node API.

## Validation

Automated tests cover route selection, profile normalization, scrypt hash compatibility, the default-off feature flag, settings allowlists, and saved-deck validation. A separate test against a disposable Supabase database is still required before enabling the adapter in any deployed environment.
