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

-- ── Aggregation function ────────────────────────────────────────────────────
-- Returns pre-bucketed averages so the frontend never hits the 1000-row limit.
-- p_bucket_secs: 300=5 min, 3600=1 h, 21600=6 h, 86400=1 day
CREATE OR REPLACE FUNCTION get_occupancy_bucketed(
  p_pool_id      TEXT,
  p_from         TIMESTAMPTZ,
  p_to           TIMESTAMPTZ,
  p_bucket_secs  INTEGER
)
RETURNS TABLE (bucket TIMESTAMPTZ, people_count INTEGER)
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT
    TO_TIMESTAMP(
      FLOOR(EXTRACT(EPOCH FROM recorded_at) / p_bucket_secs) * p_bucket_secs
    ) AS bucket,
    ROUND(AVG(occupancy.people_count))::INTEGER AS people_count
  FROM occupancy
  WHERE pool_id = p_pool_id
    AND recorded_at >= p_from
    AND recorded_at <= p_to
    AND occupancy.people_count IS NOT NULL
  GROUP BY 1
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION get_occupancy_bucketed TO anon;

-- ── Row Level Security ──────────────────────────────────────────────────────
-- The frontend uses the anon key (read-only).
-- The scraper uses the service-role key (bypasses RLS, can INSERT).

ALTER TABLE occupancy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read"
    ON occupancy FOR SELECT
    USING (true);
