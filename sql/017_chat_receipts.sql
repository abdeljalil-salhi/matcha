CREATE TABLE chat_receipts (
    recipient_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delivered_through bigint NOT NULL DEFAULT 0,
    read_through bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (recipient_id, sender_id),
    CHECK (read_through <= delivered_through)
);
