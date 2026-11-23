ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text',
    ADD COLUMN IF NOT EXISTS media_url text,
    ADD COLUMN IF NOT EXISTS media_alt text;

ALTER TABLE messages
    ALTER COLUMN body SET DEFAULT '';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'messages_kind'
    ) THEN
        ALTER TABLE messages
            ADD CONSTRAINT messages_kind CHECK (kind IN ('text', 'gif'));
    END IF;
END $$;

ALTER TABLE messages
    DROP CONSTRAINT IF EXISTS chat_message_length_limit,
    DROP CONSTRAINT IF EXISTS chat_message_body_limit,
    DROP CONSTRAINT IF EXISTS chat_message_media_alt_limit;

ALTER TABLE messages
    ADD CONSTRAINT chat_message_body_limit CHECK (
        (kind = 'text' AND char_length(body) BETWEEN 1 AND 2000 AND media_url IS NULL)
        OR (kind = 'gif' AND char_length(body) <= 2000 AND media_url IS NOT NULL
            AND char_length(media_url) BETWEEN 1 AND 2048)
    ),
    ADD CONSTRAINT chat_message_media_alt_limit CHECK (
        media_alt IS NULL OR char_length(media_alt) <= 200
    );
