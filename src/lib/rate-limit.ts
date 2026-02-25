import { createClient } from '@supabase/supabase-js';

/**
 * Database-backed rate limiter using a dedicated rate_limits table in Supabase.
 *
 * Why not in-memory?
 * ─────────────────
 * On Vercel serverless, each function invocation may run in a different
 * container with its own memory space. An in-memory Map resets on every
 * cold start and is not shared across concurrent invocations, making it
 * ineffective as a rate limiter in production.
 *
 * This implementation queries Supabase for recent requests from the same
 * key (IP address) within the sliding window. It falls back to an
 * in-memory limiter when env vars are missing (local dev) and fails open
 * on database errors so legitimate requests are never blocked by infra issues.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory fallback (local dev / missing env vars)
// ─────────────────────────────────────────────────────────────────────────────
interface RateEntry { timestamps: number[] }
const memStore = new Map<string, RateEntry>();

function memRateLimit(key: string, maxRequests: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  const entry = memStore.get(key) ?? { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= maxRequests) {
    return { allowed: false, remaining: 0, resetMs: entry.timestamps[0] + windowMs - now };
  }

  entry.timestamps.push(now);
  memStore.set(key, entry);
  return { allowed: true, remaining: maxRequests - entry.timestamps.length, resetMs: windowMs };
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase-backed limiter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a request and check if it is within the rate limit.
 *
 * Uses a `rate_limits` table in Supabase:
 *   key TEXT, created_at TIMESTAMPTZ DEFAULT now()
 *
 * @param key          Unique identifier (e.g., client IP address)
 * @param maxRequests  Maximum requests allowed in the window (default 10)
 * @param windowMs     Sliding window in milliseconds (default 600 000 = 10 min)
 */
export async function rateLimit(
  key: string,
  maxRequests: number = 10,
  windowMs: number = 600_000,
): Promise<RateLimitResult> {
  // Fall back to in-memory limiter when Supabase is not configured
  if (!supabaseUrl || !supabaseServiceKey) {
    return memRateLimit(key, maxRequests, windowMs);
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const windowStart = new Date(Date.now() - windowMs).toISOString();

    // Insert a row for this request
    const { error: insertError } = await supabase
      .from('rate_limits')
      .insert({ key });
    if (insertError) {
      console.error('Rate limit insert failed:', insertError);
      return memRateLimit(key, maxRequests, windowMs);
    }

    // Count requests in the window
    const { count, error: countError } = await supabase
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('key', key)
      .gte('created_at', windowStart);

    if (countError) {
      console.error('Rate limit count failed:', countError);
      // Fail open — don't block the request
      return { allowed: true, remaining: maxRequests, resetMs: windowMs };
    }

    const used = count ?? 0;
    return {
      allowed: used <= maxRequests,
      remaining: Math.max(0, maxRequests - used),
      resetMs: windowMs,
    };
  } catch (err) {
    console.error('Rate limit error:', err);
    // Fail open on any unexpected error
    return { allowed: true, remaining: maxRequests, resetMs: windowMs };
  }
}
