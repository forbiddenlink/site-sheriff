-- Rate limiting table for serverless-safe IP-based rate limiting
CREATE TABLE IF NOT EXISTS rate_limits (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by key + time window
CREATE INDEX idx_rate_limits_key_created ON rate_limits (key, created_at DESC);

-- Auto-cleanup: delete rows older than 1 hour (runs via pg_cron or manual)
-- For now we rely on the index to keep queries fast; add a scheduled
-- cleanup job if the table grows large.

-- Enable RLS (service role key bypasses RLS, so no policies needed)
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
