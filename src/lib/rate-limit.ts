/**
 * Simple in-memory rate limiter using a sliding window.
 * Stores request timestamps per key (IP address).
 * Resets on redeploy (stateless across instances).
 */

interface RateEntry {
  timestamps: number[];
}

const store = new Map<string, RateEntry>();

// Clean up old entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  const cutoff = now - windowMs;
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

/**
 * Check if a request is allowed under the rate limit.
 *
 * @param key - Unique identifier (e.g., IP address)
 * @param maxRequests - Maximum requests allowed in the window
 * @param windowMs - Time window in milliseconds
 */
export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  cleanup(windowMs);

  const entry = store.get(key) ?? { timestamps: [] };

  // Remove timestamps outside the window
  const cutoff = now - windowMs;
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= maxRequests) {
    const oldestInWindow = entry.timestamps[0];
    return {
      allowed: false,
      remaining: 0,
      resetMs: oldestInWindow + windowMs - now,
    };
  }

  entry.timestamps.push(now);
  store.set(key, entry);

  return {
    allowed: true,
    remaining: maxRequests - entry.timestamps.length,
    resetMs: windowMs,
  };
}
