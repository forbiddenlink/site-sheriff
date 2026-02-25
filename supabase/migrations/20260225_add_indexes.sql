-- Add composite index for scan history lookups (used by trend comparison)
CREATE INDEX IF NOT EXISTS "ScanRun_normalizedUrl_idx" ON "ScanRun" ("normalizedUrl");
CREATE INDEX IF NOT EXISTS "ScanRun_normalizedUrl_status_createdAt_idx" ON "ScanRun" ("normalizedUrl", "status", "createdAt");
