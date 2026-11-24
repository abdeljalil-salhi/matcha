ALTER TABLE messages
    ADD COLUMN plan_id bigint REFERENCES date_plans ON DELETE CASCADE,
    ADD COLUMN plan_version integer,
    ADD COLUMN plan_action text,
    ADD COLUMN plan_snapshot jsonb,
    ADD CONSTRAINT messages_plan_revision UNIQUE (plan_id, plan_version),
    ADD CONSTRAINT messages_plan_metadata CHECK (
        (plan_id IS NULL AND plan_version IS NULL AND plan_action IS NULL
            AND plan_snapshot IS NULL)
        OR (plan_id IS NOT NULL AND plan_version IS NOT NULL AND plan_version > 0 AND plan_action IS NOT NULL
            AND plan_snapshot IS NOT NULL AND kind = 'text')
    );

-- Preserve proposals made before chat plan cards were introduced.
INSERT INTO messages (sender_id, recipient_id, client_id, body, created_at,
                      plan_id, plan_version, plan_action, plan_snapshot)
SELECT h.actor_id,
       CASE WHEN p.creator_id = h.actor_id THEN p.partner_id ELSE p.creator_id END,
       gen_random_uuid(),
       CASE h.action WHEN 'propose' THEN 'Date invitation: '
           WHEN 'reschedule' THEN 'New date proposal: '
           WHEN 'accept' THEN 'Date confirmed: '
           WHEN 'decline' THEN 'Date declined: '
           ELSE 'Date cancelled: ' END || (h.snapshot->>'title'),
       h.created_at, h.plan_id, h.version, h.action, h.snapshot
FROM date_plan_history h JOIN date_plans p ON p.id = h.plan_id
ORDER BY h.created_at, h.plan_id, h.version;

-- Existing invitation notifications were written in the same transaction.
ALTER TABLE notifications DROP CONSTRAINT notifications_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_message_kind CHECK (
    (kind = 'message' AND message_id IS NOT NULL)
    OR kind = 'plan'
    OR (kind NOT IN ('message', 'plan') AND message_id IS NULL)
);
UPDATE notifications n SET message_id = m.id
FROM messages m
WHERE n.kind = 'plan' AND n.message_id IS NULL AND m.plan_id IS NOT NULL
  AND n.actor_id = m.sender_id AND n.recipient_id = m.recipient_id
  AND n.created_at = m.created_at;
