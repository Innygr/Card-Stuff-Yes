-- Email ownership and password recovery tokens.
-- Raw tokens are never stored; only SHA-256 hashes are persisted.
ALTER TABLE csy_private.accounts
    ADD COLUMN IF NOT EXISTS email text,
    ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
    ADD COLUMN IF NOT EXISTS pending_email text;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_unique
    ON csy_private.accounts (lower(email))
    WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_pending_email_unique
    ON csy_private.accounts (lower(pending_email))
    WHERE pending_email IS NOT NULL;

CREATE TABLE IF NOT EXISTS csy_private.account_email_tokens (
    token_hash char(64) PRIMARY KEY,
    account_id text NOT NULL REFERENCES csy_private.accounts(id) ON DELETE CASCADE,
    purpose text NOT NULL CHECK (purpose IN ('verify_email', 'password_reset')),
    email text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    CONSTRAINT email_token_expiry_after_creation CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS account_email_tokens_account_purpose_idx
    ON csy_private.account_email_tokens(account_id, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS account_email_tokens_expiry_idx
    ON csy_private.account_email_tokens(expires_at);

REVOKE ALL ON TABLE csy_private.account_email_tokens FROM PUBLIC;

-- At most one live token per account and purpose, including concurrent requests.
CREATE UNIQUE INDEX IF NOT EXISTS account_email_tokens_one_active_purpose
    ON csy_private.account_email_tokens(account_id, purpose)
    WHERE consumed_at IS NULL;
