# Supabase schema verification

Run this after applying the initial migration to the development Supabase project.

## Automated check

From the server project directory, with `DATABASE_URL` and the Supabase CA certificate trust configured in the environment:

```bash
node scripts/verify-database.js
```

Expected output:

```text
Database verification successful.
All 7 expected private tables are present.
anon/authenticated have no schema access; no PUBLIC/API-role table grants were found.
```

The check is read-only. It verifies the private schema contains:

- `accounts`
- `account_sessions`
- `decks`
- `deck_cards`
- `player_settings`
- `profiles`
- `schema_migrations`

It also confirms that Supabase's `anon` and `authenticated` roles do not have schema usage and that `PUBLIC`, `anon`, and `authenticated` have no table grants in `csy_private`.

## Supabase SQL Editor alternative

Run this query in the SQL Editor to inspect the table list:

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'csy_private'
ORDER BY table_name;
```

Expected: seven rows, including the migration ledger.

Check that the API roles cannot access the schema:

```sql
SELECT
    has_schema_privilege('anon', 'csy_private', 'USAGE') AS anon_schema_usage,
    has_schema_privilege('authenticated', 'csy_private', 'USAGE') AS authenticated_schema_usage;
```

Both values should be `false`.

Inspect explicit table grants:

```sql
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'csy_private'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY grantee, table_name, privilege_type;
```

Expected: zero rows.

## Safety boundary

This verification does not create or modify tables, change grants, import account data, or alter application storage. Keep the JSON stores authoritative until a separate persistence adapter and tested import/rollback path are reviewed.
