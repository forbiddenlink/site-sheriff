-- Enable Row Level Security on all public tables
-- The app uses the service_role key which bypasses RLS,
-- so we add a permissive policy for the anon role (read-only)
-- and let service_role handle writes.

-- 1. Enable RLS
ALTER TABLE public."ScanRun"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PageResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Issue"      ENABLE ROW LEVEL SECURITY;

-- 2. Allow anon (public) read access to scan results
CREATE POLICY "Allow public read access on ScanRun"
  ON public."ScanRun"
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow public read access on PageResult"
  ON public."PageResult"
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow public read access on Issue"
  ON public."Issue"
  FOR SELECT
  TO anon
  USING (true);

-- 3. Allow service_role full access (service_role bypasses RLS by default,
--    but explicit policies make intent clear)
CREATE POLICY "Allow service_role full access on ScanRun"
  ON public."ScanRun"
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service_role full access on PageResult"
  ON public."PageResult"
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service_role full access on Issue"
  ON public."Issue"
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
