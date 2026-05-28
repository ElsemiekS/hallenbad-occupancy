-- Run this once in the Supabase SQL editor to set up the database.

CREATE TABLE IF NOT EXISTS occupancy (
    id          BIGSERIAL    PRIMARY KEY,
    pool_id     TEXT         NOT NULL DEFAULT 'hallenbad_city',
    people_count INTEGER,            -- NULL = pool closed / data unavailable
    recorded_at TIMESTAMPTZ  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Fast lookups by time range (the main query pattern)
CREATE INDEX IF NOT EXISTS idx_occupancy_pool_time
    ON occupancy (pool_id, recorded_at DESC);

-- ── Row Level Security ──────────────────────────────────────────────────────
-- The frontend uses the anon key (read-only).
-- The scraper uses the service-role key (bypasses RLS, can INSERT).

ALTER TABLE occupancy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read"
    ON occupancy FOR SELECT
    USING (true);
