CREATE TABLE notifications (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recipient_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
    actor_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('like', 'visit', 'message', 'match', 'unlike')),
    message_id bigint REFERENCES messages ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at timestamptz,
    CHECK ((kind = 'message') = (message_id IS NOT NULL))
);
CREATE INDEX notifications_inbox ON notifications (recipient_id, id DESC);
CREATE INDEX notifications_unread ON notifications (recipient_id, id) WHERE read_at IS NULL;

CREATE VIEW visible_notifications AS
SELECT n.*, u.username AS actor_username
FROM notifications n JOIN users u ON u.id = n.actor_id
WHERE NOT is_blocked(n.recipient_id, n.actor_id)
  AND (n.read_at IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM mutes m WHERE m.actor_id = n.recipient_id AND m.target_id = n.actor_id
  ))
  AND (n.kind <> 'message' OR is_connected(n.recipient_id, n.actor_id));
