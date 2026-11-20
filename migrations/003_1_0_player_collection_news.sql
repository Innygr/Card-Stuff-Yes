-- 1.0 player roles, card ownership, and managed news.
ALTER TABLE csy_private.accounts
    ADD COLUMN IF NOT EXISTS rank text NOT NULL DEFAULT 'player';

ALTER TABLE csy_private.accounts
    ADD CONSTRAINT accounts_rank_valid
    CHECK (rank IN ('player', 'mod', 'admin', 'owner'));

CREATE TABLE IF NOT EXISTS csy_private.account_card_inventory (
    account_id text NOT NULL REFERENCES csy_private.accounts(id) ON DELETE CASCADE,
    card_id text NOT NULL,
    quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0 AND quantity <= 999),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, card_id)
);

CREATE INDEX IF NOT EXISTS account_card_inventory_card_idx
    ON csy_private.account_card_inventory(card_id);

CREATE TABLE IF NOT EXISTS csy_private.news_posts (
    id text PRIMARY KEY,
    title varchar(120) NOT NULL,
    summary varchar(300) NOT NULL DEFAULT '',
    content text NOT NULL,
    published boolean NOT NULL DEFAULT false,
    featured boolean NOT NULL DEFAULT false,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz
);

CREATE INDEX IF NOT EXISTS news_posts_public_idx
    ON csy_private.news_posts(published, featured DESC, published_at DESC);

REVOKE ALL ON TABLE csy_private.account_card_inventory FROM PUBLIC;
REVOKE ALL ON TABLE csy_private.news_posts FROM PUBLIC;
