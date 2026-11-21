-- Persistent official community-server directory.
-- Registration, ownership verification, and operator approval are separate
-- states. A registered server cannot receive account-authority join tickets.
CREATE TABLE IF NOT EXISTS csy_private.community_servers (
    server_id varchar(128) PRIMARY KEY,
    owner_account_id text NOT NULL REFERENCES csy_private.accounts(id) ON DELETE CASCADE,
    endpoint text NOT NULL,
    display_name varchar(64) NOT NULL,
    status varchar(16) NOT NULL DEFAULT 'pending',
    verification_token_hash char(64),
    verification_expires_at timestamptz,
    verified_at timestamptz,
    approved_at timestamptz,
    approved_by text,
    revoked_at timestamptz,
    revoked_by text,
    revocation_reason varchar(240),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT community_servers_status_check
        CHECK (status IN ('pending', 'approved', 'revoked')),
    CONSTRAINT community_servers_endpoint_https
        CHECK (endpoint ~ '^https://'),
    CONSTRAINT community_servers_verification_pair
        CHECK ((verification_token_hash IS NULL) = (verification_expires_at IS NULL)),
    CONSTRAINT community_servers_approval_requires_verification
        CHECK (status <> 'approved' OR (verified_at IS NOT NULL AND approved_at IS NOT NULL)),
    CONSTRAINT community_servers_revocation_timestamp
        CHECK (status <> 'revoked' OR revoked_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS community_servers_owner_idx
    ON csy_private.community_servers (owner_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS community_servers_public_directory_idx
    ON csy_private.community_servers (status, verified_at)
    WHERE status = 'approved';

REVOKE ALL ON TABLE csy_private.community_servers FROM PUBLIC;
