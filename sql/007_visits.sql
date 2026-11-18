CREATE TABLE visits (
    viewer_id bigint REFERENCES users ON DELETE CASCADE,
    target_id bigint REFERENCES users ON DELETE CASCADE,
    last_viewed_at timestamptz NOT NULL DEFAULT now(),
    last_notified_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (viewer_id, target_id),
    CHECK (viewer_id <> target_id)
);
CREATE INDEX visits_received ON visits (target_id, last_viewed_at DESC, viewer_id);
