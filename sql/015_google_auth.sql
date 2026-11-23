CREATE TABLE oauth_accounts (
    provider text NOT NULL CHECK (provider = 'google'),
    provider_user_id text NOT NULL,
    user_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
    linked_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, provider_user_id),
    UNIQUE (provider, user_id)
);
