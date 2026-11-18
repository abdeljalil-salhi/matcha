CREATE TABLE users (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username text NOT NULL UNIQUE,
    email text NOT NULL UNIQUE,
    first_name text NOT NULL,
    last_name text NOT NULL,
    password_hash text NOT NULL,
    verified_at timestamptz,
    last_seen timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
    token_hash bytea PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    last_seen timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_by_user ON sessions (user_id, expires_at, last_seen);

CREATE TABLE account_links (
    id uuid PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('verify', 'reset', 'email')),
    destination text NOT NULL,
    expires_at timestamptz NOT NULL,
    UNIQUE (user_id, kind)
);

CREATE TABLE mail_outbox (
    link_id uuid PRIMARY KEY REFERENCES account_links ON DELETE CASCADE,
    attempts integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now()
);
