-- Map trusted issuer-scoped opaque subjects to local community player IDs.
-- No official account IDs or credentials are stored in this table.
CREATE TABLE IF NOT EXISTS csy_private.community_player_identities (
    issuer VARCHAR(256) NOT NULL,
    external_subject VARCHAR(512) NOT NULL,
    local_player_id UUID NOT NULL,
    display_name VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (issuer, external_subject),
    UNIQUE (local_player_id)
);

REVOKE ALL ON TABLE csy_private.community_player_identities FROM PUBLIC;
