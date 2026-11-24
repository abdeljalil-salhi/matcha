ALTER TABLE date_plans ADD COLUMN activity text NOT NULL DEFAULT 'other'
    CHECK (activity IN ('coffee', 'dining', 'outdoors', 'culture', 'other'));

-- Older plans and immutable revisions predate the activity selector.
UPDATE date_plan_history SET snapshot = snapshot || '{"activity":"other"}'::jsonb
WHERE NOT snapshot ? 'activity';
UPDATE messages SET plan_snapshot = plan_snapshot || '{"activity":"other"}'::jsonb
WHERE plan_id IS NOT NULL AND NOT plan_snapshot ? 'activity';
