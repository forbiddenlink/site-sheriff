import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock environment variables to force in-memory fallback
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

// Import after mocking env
const { rateLimit } = await import('./rate-limit');

describe('rateLimit - In-memory fallback', () => {
  beforeEach(() => {
    // Each test uses a unique key, so no cleanup needed
  });

  it('should allow requests under the limit', async () => {
    const key = `test-allow-${Date.now()}`;
    const result = await rateLimit(key, 5, 60000);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('should block requests over the limit', async () => {
    const key = `test-block-${Date.now()}`;

    // Make 5 requests (the limit)
    for (let i = 0; i < 5; i++) {
      const result = await rateLimit(key, 5, 60000);
      expect(result.allowed).toBe(true);
    }

    // 6th request should be blocked
    const blocked = await rateLimit(key, 5, 60000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('should track remaining correctly', async () => {
    const key = `test-remaining-${Date.now()}`;

    const first = await rateLimit(key, 3, 60000);
    expect(first.remaining).toBe(2);

    const second = await rateLimit(key, 3, 60000);
    expect(second.remaining).toBe(1);

    const third = await rateLimit(key, 3, 60000);
    expect(third.remaining).toBe(0);

    const fourth = await rateLimit(key, 3, 60000);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it('should use different limits for different keys', async () => {
    const key1 = `test-key1-${Date.now()}`;
    const key2 = `test-key2-${Date.now()}`;

    // Exhaust key1's limit
    for (let i = 0; i < 2; i++) {
      await rateLimit(key1, 2, 60000);
    }
    const key1Blocked = await rateLimit(key1, 2, 60000);
    expect(key1Blocked.allowed).toBe(false);

    // key2 should still have full allowance
    const key2Result = await rateLimit(key2, 2, 60000);
    expect(key2Result.allowed).toBe(true);
    expect(key2Result.remaining).toBe(1);
  });

  it('should respect window expiry', async () => {
    const key = `test-expiry-${Date.now()}`;
    const shortWindow = 10; // 10ms window

    // Make a request
    await rateLimit(key, 1, shortWindow);

    // Should be blocked immediately
    const blocked = await rateLimit(key, 1, shortWindow);
    expect(blocked.allowed).toBe(false);

    // Wait for window to expire
    await new Promise(r => setTimeout(r, 15));

    // Should be allowed again
    const allowed = await rateLimit(key, 1, shortWindow);
    expect(allowed.allowed).toBe(true);
  });

  it('should provide resetMs in response', async () => {
    const key = `test-reset-${Date.now()}`;
    const windowMs = 60000;

    const result = await rateLimit(key, 5, windowMs);
    expect(result.resetMs).toBe(windowMs);
  });
});
