-- Durable one-time redemption records for community join tickets.
-- The unique ticket_id constraint makes concurrent redemption atomic.
CREATE TABLE IF NOT EXISTS community_join_ticket_uses (
    ticket_id VARCHAR(128) PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS community_join_ticket_uses_expiry_idx
    ON community_join_ticket_uses (expires_at);
