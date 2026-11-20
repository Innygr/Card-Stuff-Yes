-- Durable one-time redemption records for community join tickets.
-- Keep replay records in the same private schema as account/session data.
-- The unique ticket_id constraint makes concurrent redemption atomic.
CREATE TABLE IF NOT EXISTS csy_private.community_join_ticket_uses (
    ticket_id VARCHAR(128) PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS community_join_ticket_uses_expiry_idx
    ON csy_private.community_join_ticket_uses (expires_at);

REVOKE ALL ON TABLE csy_private.community_join_ticket_uses FROM PUBLIC;
