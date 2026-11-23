CREATE TABLE calls (
    id uuid PRIMARY KEY,
    caller_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
    callee_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
    caller_session bytea NOT NULL,
    callee_session bytea,
    caller_device uuid NOT NULL,
    callee_device uuid,
    mode text NOT NULL CHECK (mode IN ('audio', 'video')),
    state text NOT NULL DEFAULT 'ringing'
        CHECK (state IN ('ringing', 'active', 'ended', 'declined', 'missed', 'failed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    accepted_at timestamptz,
    ended_at timestamptz,
    CHECK (caller_id <> callee_id)
);
CREATE INDEX calls_live ON calls (created_at) WHERE state IN ('ringing', 'active');
CREATE TABLE call_participants (
    user_id bigint PRIMARY KEY REFERENCES users ON DELETE CASCADE,
    call_id uuid NOT NULL REFERENCES calls ON DELETE CASCADE,
    heartbeat_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX call_participants_by_call ON call_participants (call_id);
CREATE TABLE call_signals (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    call_id uuid NOT NULL REFERENCES calls ON DELETE CASCADE,
    sender_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
    client_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('offer', 'answer', 'ice')),
    payload jsonb NOT NULL,
    UNIQUE (call_id, sender_id, client_id)
);
CREATE INDEX call_signals_cursor ON call_signals (call_id, id);
CREATE UNIQUE INDEX call_description_once ON call_signals (call_id, kind)
    WHERE kind IN ('offer', 'answer');
