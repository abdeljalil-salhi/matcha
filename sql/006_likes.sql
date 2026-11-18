CREATE TABLE likes (
    actor_id bigint REFERENCES users ON DELETE CASCADE,
    target_id bigint REFERENCES users ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (actor_id, target_id),
    CHECK (actor_id <> target_id)
);
CREATE INDEX likes_received ON likes (target_id, created_at DESC, actor_id);

-- Check whether two users have an active mutual connection.
-- Args: first_id and second_id (bigint user IDs).
-- Returns: boolean. True when both users like each other and neither has blocked the other.
CREATE FUNCTION is_connected(first_id bigint, second_id bigint) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT NOT is_blocked(first_id, second_id)
       AND EXISTS (SELECT 1 FROM likes WHERE actor_id = first_id AND target_id = second_id)
       AND EXISTS (SELECT 1 FROM likes WHERE actor_id = second_id AND target_id = first_id)
$$;
