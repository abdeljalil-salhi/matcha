CREATE TABLE messages (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sender_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
    recipient_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
    client_id uuid NOT NULL,
    kind text NOT NULL DEFAULT 'text'
        CONSTRAINT messages_kind CHECK (kind IN ('text', 'gif')),
    body text NOT NULL DEFAULT '',
    media_url text,
    media_alt text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sender_id, recipient_id, client_id),
    CHECK (sender_id <> recipient_id),
    CONSTRAINT chat_message_body_limit CHECK (
        (kind = 'text' AND char_length(body) BETWEEN 1 AND 2000 AND media_url IS NULL)
        OR (kind = 'gif' AND char_length(body) <= 2000 AND media_url IS NOT NULL
            AND char_length(media_url) BETWEEN 1 AND 2048)
    ),
    CONSTRAINT chat_message_media_alt_limit CHECK (
        media_alt IS NULL OR char_length(media_alt) <= 200
    )
);
CREATE INDEX messages_thread ON messages (sender_id, recipient_id, id DESC);
