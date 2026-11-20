# Supabase PostgreSQL foundation

Card Stuff Yes connects to Supabase from the Node.js server only. Browser code must continue to call the Card Stuff Yes API; never place `DATABASE_URL`, a database password, or a Supabase service-role key in frontend files or GitHub source.

## Current stage

This branch adds the PostgreSQL client, a TLS-required connection pool, a connectivity check, an ordered migration runner, and the first private database schema. It does not yet move account, profile, settings, deck, session, multiplayer, or match writes from the existing JSON stores into PostgreSQL. The JSON files remain authoritative until a later migration has been tested and explicitly switched over.

## Runtime configuration

Provide `DATABASE_URL` to the Node.js container through the host's protected environment file. On the current Ubuntu host that file is:

```text
/opt/card-stuff-yes-secrets/database.env
```

It should contain one line:

```text
DATABASE_URL=postgresql://...
```

Keep the file outside the repository, restrict its permissions, and do not paste its contents into issues, logs, or chat. The Docker Compose service must reference this file with `env_file`. The application requires TLS and verifies the server certificate.

The current Supabase Session Pooler URI (port 5432) is suitable for the long-running Node.js server. URL-encode reserved characters in the password component of the URI.

## Commands

Run these from the server project directory in an environment where `DATABASE_URL` is available:

- `npm run db:check` — executes a harmless `SELECT 1` and reports only success/failure.
- `npm run db:migrate` — applies unapplied SQL files from `migrations/` in filename order.

The migration runner uses a PostgreSQL advisory lock, a private migration ledger, and a transaction per migration. It does not print the connection URI.

## Initial schema

The first migration creates the `csy_private` schema, which is intentionally separate from Supabase's exposed `public` schema. It creates tables for accounts, profiles, settings, decks, deck cards, and hashed account sessions. The schema and its tables receive no grants to PUBLIC. Do not add `csy_private` to Supabase's exposed schemas or grant it to the `anon` or `authenticated` API roles.

The Node server will enforce account ownership and authorization when application persistence is migrated. Database credentials stay server-side.

## Deployment safety

Do not restart/recreate the production container or run migrations against production as part of this branch's development work. First review the pull request and CI results. Then use a separate test project/database to validate TLS, migrations, backup/restore, and the import/export path. Keep the current JSON persistence and volume intact until rollback has been rehearsed.
