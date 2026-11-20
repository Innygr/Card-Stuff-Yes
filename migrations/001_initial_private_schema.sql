-- Card Stuff Yes private persistence schema.
-- This schema is intentionally separate from Supabase's exposed public schema.
CREATE SCHEMA IF NOT EXISTS csy_private;
REVOKE ALL ON SCHEMA csy_private FROM PUBLIC;

CREATE TABLE csy_private.accounts (
    id text PRIMARY KEY,
    player_id text NOT NULL UNIQUE,
    username text NOT NULL,
    username_key text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE TABLE csy_private.profiles (
    account_id text PRIMARY KEY REFERENCES csy_private.accounts(id) ON DELETE CASCADE,
    display_name varchar(24) NOT NULL DEFAULT '',
    bio varchar(240) NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE csy_private.player_settings (
    account_id text PRIMARY KEY REFERENCES csy_private.accounts(id) ON DELETE CASCADE,
    settings jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT player_settings_object CHECK (jsonb_typeof(settings) = 'object')
);

CREATE TABLE csy_private.decks (
    id text PRIMARY KEY,
    account_id text NOT NULL REFERENCES csy_private.accounts(id) ON DELETE CASCADE,
    name varchar(40) NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    UNIQUE (account_id, id)
);

CREATE TABLE csy_private.deck_cards (
    deck_id text NOT NULL REFERENCES csy_private.decks(id) ON DELETE CASCADE,
    position smallint NOT NULL CHECK (position >= 0 AND position < 60),
    card_id text NOT NULL,
    PRIMARY KEY (deck_id, position)
);

CREATE TABLE csy_private.account_sessions (
    token_hash char(64) PRIMARY KEY,
    account_id text NOT NULL REFERENCES csy_private.accounts(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    CONSTRAINT session_expiry_after_creation CHECK (expires_at > created_at)
);

CREATE INDEX accounts_player_id_idx ON csy_private.accounts(player_id);
CREATE INDEX decks_account_updated_idx ON csy_private.decks(account_id, updated_at DESC);
CREATE INDEX sessions_account_idx ON csy_private.account_sessions(account_id);
CREATE INDEX sessions_expiry_idx ON csy_private.account_sessions(expires_at);

REVOKE ALL ON ALL TABLES IN SCHEMA csy_private FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA csy_private FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA csy_private REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA csy_private REVOKE ALL ON SEQUENCES FROM PUBLIC;
