CREATE TABLE date_plans (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    creator_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
    partner_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
    proposed_by bigint NOT NULL REFERENCES users ON DELETE CASCADE,
    client_id uuid NOT NULL,
    title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
    starts_at timestamptz NOT NULL,
    timezone text NOT NULL,
    venue text NOT NULL CHECK (char_length(venue) BETWEEN 1 AND 200),
    notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 1000),
    state text NOT NULL DEFAULT 'proposed'
        CHECK (state IN ('proposed', 'accepted', 'declined', 'cancelled')),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_by bigint NOT NULL REFERENCES users ON DELETE CASCADE,
    cancellation_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (creator_id <> partner_id),
    CHECK (proposed_by IN (creator_id, partner_id)),
    UNIQUE (creator_id, client_id)
);
CREATE INDEX date_plans_creator ON date_plans (creator_id, starts_at, id);
CREATE INDEX date_plans_partner ON date_plans (partner_id, starts_at, id);

CREATE TABLE date_plan_history (
    plan_id bigint NOT NULL REFERENCES date_plans ON DELETE CASCADE,
    version integer NOT NULL,
    actor_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
    action text NOT NULL,
    snapshot jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (plan_id, version)
);

ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
    CHECK (kind IN ('like', 'visit', 'message', 'match', 'unlike', 'plan'));
