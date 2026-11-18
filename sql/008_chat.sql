CREATE TABLE messages (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sender_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
    recipient_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
    client_id uuid NOT NULL,
    body text NOT NULL CONSTRAINT chat_message_length_limit
        CHECK (char_length(body) BETWEEN 1 AND 2000),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sender_id, recipient_id, client_id),
    CHECK (sender_id <> recipient_id)
);
CREATE INDEX messages_thread ON messages (sender_id, recipient_id, id DESC);
