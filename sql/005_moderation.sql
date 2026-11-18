CREATE TABLE blocks (
    actor_id bigint REFERENCES users ON DELETE CASCADE,
    target_id bigint REFERENCES users ON DELETE CASCADE,
    PRIMARY KEY (actor_id, target_id),
    CHECK (actor_id <> target_id)
);
CREATE TABLE mutes (
    actor_id bigint REFERENCES users ON DELETE CASCADE,
    target_id bigint REFERENCES users ON DELETE CASCADE,
    PRIMARY KEY (actor_id, target_id),
    CHECK (actor_id <> target_id)
);
CREATE TABLE reports (
    actor_id bigint REFERENCES users ON DELETE CASCADE,
    target_id bigint REFERENCES users ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (actor_id, target_id),
    CHECK (actor_id <> target_id)
);

-- Check whether either user has blocked the other.
-- Args: first_id and second_id (bigint user IDs).
-- Returns: boolean. True when a block exists in either direction.
CREATE FUNCTION is_blocked(first_id bigint, second_id bigint) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM blocks
        WHERE (actor_id = first_id AND target_id = second_id)
           OR (actor_id = second_id AND target_id = first_id)
    )
$$;
