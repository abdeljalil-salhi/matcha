ALTER TABLE users
    ADD COLUMN map_visible boolean NOT NULL DEFAULT false,
    ADD COLUMN map_shared_at timestamptz;

-- Fictional evaluator fixtures can demonstrate the map without opting real users in.
UPDATE users SET map_visible = true, map_shared_at = now() WHERE is_demo;
CREATE INDEX users_shared_on_map ON users (id) WHERE map_visible;
