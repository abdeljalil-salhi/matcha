CREATE TABLE geocoder_cache (
    cache_key text PRIMARY KEY,
    payload jsonb NOT NULL,
    expires_at timestamptz NOT NULL
);
CREATE INDEX geocoder_cache_expiration ON geocoder_cache (expires_at);

CREATE TABLE geocoder_windows (
    provider_host text PRIMARY KEY,
    next_request_at timestamptz NOT NULL
);
