CREATE TABLE photos (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
    slot smallint NOT NULL CONSTRAINT profile_photo_slot_limit CHECK (slot BETWEEN 1 AND 5),
    is_primary boolean NOT NULL,
    content bytea NOT NULL,
    UNIQUE (user_id, slot)
);
CREATE UNIQUE INDEX photos_one_primary ON photos (user_id) WHERE is_primary;
