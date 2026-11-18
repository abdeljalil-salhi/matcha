ALTER TABLE users
    ADD COLUMN birth_date date,
    ADD COLUMN gender text CHECK (gender IN ('woman', 'man', 'nonbinary', 'other')),
    ADD COLUMN seeks text[],
    ADD COLUMN bio text,
    ADD COLUMN is_demo boolean NOT NULL DEFAULT false;

CREATE TABLE tags (name text PRIMARY KEY);
CREATE TABLE user_tags (
    user_id bigint REFERENCES users ON DELETE CASCADE,
    tag text REFERENCES tags ON DELETE CASCADE,
    PRIMARY KEY (user_id, tag)
);
CREATE INDEX user_tags_by_tag ON user_tags (tag, user_id);
