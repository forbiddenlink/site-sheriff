-- Performance optimization indexes (2026-02-27)

-- Composite index for PageResult queries that filter by scanRunId AND url
-- Used in scanner index.ts for updating page results
CREATE INDEX IF NOT EXISTS "PageResult_scanRunId_url_idx" ON "PageResult" ("scanRunId", "url");

-- Composite index for Issue queries that sort by severity and createdAt
-- Used in scan/[id]/route.ts and export routes
CREATE INDEX IF NOT EXISTS "Issue_scanRunId_severity_createdAt_idx" ON "Issue" ("scanRunId", "severity", "createdAt");

-- Index for ScanRun pagination (createdAt desc, id desc)
CREATE INDEX IF NOT EXISTS "ScanRun_createdAt_id_idx" ON "ScanRun" ("createdAt" DESC, "id" DESC);

-- Cleanup function for rate_limits table
-- Removes entries older than 1 hour to prevent unbounded growth
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM rate_limits WHERE created_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- Note: To run cleanup automatically, set up pg_cron or call this function periodically:
-- SELECT cleanup_old_rate_limits();
-- Or schedule via Supabase Edge Functions / external cron
