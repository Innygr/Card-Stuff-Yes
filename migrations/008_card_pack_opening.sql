-- Account-owned unopened packs and idempotent pack-opening receipts.
CREATE TABLE IF NOT EXISTS csy_private.account_pack_inventory (
    account_id text NOT NULL REFERENCES csy_private.accounts(id) ON DELETE CASCADE,
    pack_id text NOT NULL,
    quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0 AND quantity <= 999),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, pack_id)
);

CREATE TABLE IF NOT EXISTS csy_private.pack_openings (
    opening_id bigserial PRIMARY KEY,
    account_id text NOT NULL REFERENCES csy_private.accounts(id) ON DELETE CASCADE,
    request_id uuid NOT NULL,
    pack_id text NOT NULL,
    cards jsonb NOT NULL CHECK (jsonb_typeof(cards) = 'array'),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (account_id, request_id)
);

CREATE INDEX IF NOT EXISTS pack_openings_account_created_idx
    ON csy_private.pack_openings(account_id, created_at DESC);

REVOKE ALL ON TABLE csy_private.account_pack_inventory FROM PUBLIC;
REVOKE ALL ON TABLE csy_private.pack_openings FROM PUBLIC;
REVOKE ALL ON SEQUENCE csy_private.pack_openings_opening_id_seq FROM PUBLIC;
