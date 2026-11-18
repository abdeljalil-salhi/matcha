ALTER TABLE users
    ADD COLUMN city text,
    ADD COLUMN area text,
    ADD COLUMN country_code text,
    ADD COLUMN latitude double precision CHECK (latitude BETWEEN -90 AND 90),
    ADD COLUMN longitude double precision CHECK (longitude BETWEEN -180 AND 180),
    ADD COLUMN location_source text CHECK (location_source IN ('manual', 'gps')),
    ADD COLUMN location_set_at timestamptz;
