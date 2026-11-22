-- Owner-published, versioned card catalogue. Versions are append-only.
CREATE TABLE IF NOT EXISTS csy_private.card_catalogue_versions (
    version BIGINT PRIMARY KEY CHECK (version > 0),
    cards JSONB NOT NULL CHECK (jsonb_typeof(cards) = 'array'),
    published_by TEXT NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON csy_private.card_catalogue_versions FROM PUBLIC;
