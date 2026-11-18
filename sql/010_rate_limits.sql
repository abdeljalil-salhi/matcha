CREATE TABLE rate_windows (
    bucket text NOT NULL,
    window_start timestamptz NOT NULL,
    hits integer NOT NULL,
    PRIMARY KEY (bucket, window_start)
);
