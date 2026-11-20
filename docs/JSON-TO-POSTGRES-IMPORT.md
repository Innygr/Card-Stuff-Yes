# Import legacy JSON accounts into Supabase PostgreSQL

This importer transfers the existing Node account store into the private `csy_private` schema. Run the repository's automated checks with `npm test` before any database operation. It does not change the source JSON file, enable PostgreSQL mode, change Compose, or deploy anything.

## Before running it

1. Review and merge the Supabase schema and PostgreSQL account/settings/deck adapter PRs first.
2. Keep `CSY_ACCOUNT_STORAGE` unset on the live server.
3. Make a separate, protected backup of `private-data/accounts.json`. Do not place the backup in a public web directory or commit it.
4. Ensure `DATABASE_URL` points to the intended Supabase project and that the Supabase CA certificate is trusted using `NODE_EXTRA_CA_CERTS`.
5. Run the importer from the same release/repository version that will be used for the PostgreSQL adapter.

The importer defaults to `private-data/accounts.json`, or reads the path in `CSY_ACCOUNT_FILE`.

## Dry run (required first)

The command requires an explicit mode. Start with:

```sh
npm run db:import:accounts -- --dry-run
```

Dry-run validates the full source file, connects to PostgreSQL using a read-only transaction, checks identity collisions and existing deck/session records, and prints a count summary. It does not write to PostgreSQL or modify the JSON file.

If it reports an identity conflict, stop and investigate. Do not edit account IDs, usernames, player IDs, or password hashes just to make the import pass.

## Apply

Only after reviewing the dry-run report and confirming the target database:

```sh
npm run db:import:accounts -- --apply
```

The apply mode runs in one transaction and takes a PostgreSQL advisory transaction lock to prevent two copies of this importer from running concurrently. Any error rolls back the whole import.

It imports:
- Account IDs, usernames, username keys, player IDs, existing scrypt password hashes, and timestamps.
- Profile display names and bios.
- Existing settings JSON.
- Saved deck IDs, names, timestamps, and ordered card IDs.
- Unexpired session token hashes and their expiry timestamps.

Expired sessions are skipped. Raw session tokens are not present in the JSON store and are never created by this import. Existing password hashes are copied unchanged, so players do not need a password reset solely because of this migration.

The importer is repeatable: identical existing accounts, decks, and session hashes are treated as already imported. If an existing identity, deck, or session conflicts with the source, the importer stops rather than overwriting existing PostgreSQL data. Existing profiles/settings are not overwritten on a repeat run, protecting changes made after an initial import.

## After import

- Keep `CSY_ACCOUNT_STORAGE` unset until a separate cutover plan is approved.
- Run the dry-run again; it should report the imported rows as existing and no new rows to add.
- Verify account, profile, settings, deck, and session counts in the private schema.
- Test sign-in and account endpoints against a disposable/test deployment before production cutover.
- Keep the original JSON file and backup unchanged until the PostgreSQL deployment has been verified and a separate backup/restore plan exists.

## Rollback boundary

Before PostgreSQL mode is enabled, rollback is simple: leave `CSY_ACCOUNT_STORAGE` unset. The existing application continues to use the untouched JSON file; imported rows can remain dormant in Supabase.

After PostgreSQL mode is enabled and users can create or change accounts, profiles, settings, decks, or sessions, do **not** simply switch back to JSON. New writes would exist only in PostgreSQL. A post-cutover rollback requires a separately tested export/reconciliation plan and a maintenance window. This importer intentionally does not provide a destructive database cleanup command.

## Safety properties

- Explicit `--dry-run` or `--apply` is mandatory; no implicit write mode.
- Parameterized SQL only.
- One transaction for the full apply.
- Advisory lock for concurrent importer runs.
- Identity collisions and mismatched existing records stop the import.
- No deletes, truncation, source-file writes, credential logging, or schema privilege changes.
- The browser never connects directly to PostgreSQL.
