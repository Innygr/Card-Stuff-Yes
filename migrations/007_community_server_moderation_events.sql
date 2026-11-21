-- Durable moderation event history for the official community server registry.
-- Events are append-only at the database level; application roles receive no
-- public privileges and UPDATE/DELETE are rejected by a trigger.
CREATE TABLE IF NOT EXISTS csy_private.community_server_moderation_events (
    event_id bigserial PRIMARY KEY,
    server_id varchar(128) NOT NULL,
    actor varchar(128) NOT NULL,
    action varchar(16) NOT NULL,
    reason varchar(240) NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT community_server_moderation_action_check
        CHECK (action IN ('approved', 'revoked'))
);

CREATE INDEX IF NOT EXISTS community_server_moderation_events_server_idx
    ON csy_private.community_server_moderation_events (server_id, created_at DESC, event_id DESC);

CREATE OR REPLACE FUNCTION csy_private.reject_community_server_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'community server moderation events are append-only';
END;
$$;

REVOKE ALL ON FUNCTION csy_private.reject_community_server_event_mutation() FROM PUBLIC;

DROP TRIGGER IF EXISTS community_server_moderation_events_immutable
    ON csy_private.community_server_moderation_events;
CREATE TRIGGER community_server_moderation_events_immutable
    BEFORE UPDATE OR DELETE ON csy_private.community_server_moderation_events
    FOR EACH ROW EXECUTE FUNCTION csy_private.reject_community_server_event_mutation();

REVOKE ALL ON TABLE csy_private.community_server_moderation_events FROM PUBLIC;
REVOKE ALL ON SEQUENCE csy_private.community_server_moderation_events_event_id_seq FROM PUBLIC;
