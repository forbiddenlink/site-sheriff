import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';

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
 * key (IP address) within the sliding window.
 *
 * Fallback Behavior (Fail-Open)
 * ─────────────────────────────
 * When Supabase is unavailable or env vars are missing, this falls back to
 * an in-memory limiter which provides degraded protection (only works within
 * a single container instance). This is a FAIL-OPEN design choice:
 *
 * - PRO: Availability - users can still use the service during DB outages
 * - CON: Security - rate limits may not be enforced across all instances
 *
 * For stricter security, consider changing to FAIL-CLOSED (reject all requests
 * when rate limit DB is unavailable) by returning { allowed: false } on errors.
 *
 * Monitoring Recommendation
 * ─────────────────────────
 * The console.error calls below should be monitored in production. Consider
 * sending these to an alerting system (e.g., Sentry, Vercel Analytics) to
 * detect when the rate limit database is failing.
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

    // Count requests in the window FIRST (before inserting)
    const { count, error: countError } = await supabase
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('key', key)
      .gte('created_at', windowStart);

    if (countError) {
      logger.warn('Rate limit count failed, using in-memory fallback', {
        error: countError.message,
        code: countError.code,
      });
      // Fall back to in-memory limiter (provides degraded protection vs none)
      return memRateLimit(key, maxRequests, windowMs);
    }

    const used = count ?? 0;

    // Check if already over limit BEFORE inserting
    if (used >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetMs: windowMs,
      };
    }

    // Only insert if under the limit
    const { error: insertError } = await supabase
      .from('rate_limits')
      .insert({ key });

    if (insertError) {
      logger.warn('Rate limit insert failed, using in-memory fallback', {
        error: insertError.message,
        code: insertError.code,
      });
      // Fall back to in-memory limiter for this request
      return memRateLimit(key, maxRequests, windowMs);
    }

    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - used - 1),
      resetMs: windowMs,
    };
  } catch (err) {
    logger.error('Rate limit error', { error: err instanceof Error ? err.message : String(err) });
    // Fall back to in-memory limiter (provides degraded protection vs none)
    return memRateLimit(key, maxRequests, windowMs);
  }
}
