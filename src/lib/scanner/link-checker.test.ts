import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkLinks, findBrokenLinks, findRedirectChains, type LinkCheckResult } from './link-checker';
import type { LinkData } from '../types';

// Helper to create mock LinkData
function createLink(overrides: Partial<LinkData> = {}): LinkData {
  return {
    href: 'https://example.com',
    text: 'Example Link',
    isInternal: false,
    sourceUrl: 'https://source.com',
    ...overrides,
  };
}

// Helper to create mock LinkCheckResult
function createLinkResult(overrides: Partial<LinkCheckResult> = {}): LinkCheckResult {
  return {
    href: 'https://example.com',
    text: 'Example Link',
    isInternal: false,
    sourceUrl: 'https://source.com',
    statusCode: 200,
    ...overrides,
  };
}

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('checkLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deduplication', () => {
    it('deduplicates links by href', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        headers: new Map(),
      });

      const links = [
        createLink({ href: 'https://example.com/page1', text: 'Link 1' }),
        createLink({ href: 'https://example.com/page1', text: 'Link 1 Duplicate' }),
        createLink({ href: 'https://example.com/page2', text: 'Link 2' }),
        createLink({ href: 'https://example.com/page1', text: 'Link 1 Another Duplicate' }),
      ];

      const results = await checkLinks(links);

      // Should only have 2 unique links
      expect(results).toHaveLength(2);
      // Verify the unique URLs are present
      const hrefs = results.map(r => r.href);
      expect(hrefs).toContain('https://example.com/page1');
      expect(hrefs).toContain('https://example.com/page2');
    });

    it('keeps the last occurrence of duplicated links', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        headers: new Map(),
      });

      const links = [
        createLink({ href: 'https://example.com', text: 'First' }),
        createLink({ href: 'https://example.com', text: 'Last' }),
      ];

      const results = await checkLinks(links);

      expect(results).toHaveLength(1);
      expect(results[0].text).toBe('Last');
    });
  });

  describe('options', () => {
    it('respects timeout option', async () => {
      // Create a fetch that respects AbortSignal and aborts when signaled
      mockFetch.mockImplementation(async (_url: string, options: { signal?: AbortSignal }) => {
        return new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            resolve({ status: 200, headers: new Map() });
          }, 500);

          options.signal?.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      });

      const links = [createLink({ href: 'https://slow.example.com' })];
      const results = await checkLinks(links, { timeout: 50 });

      expect(results).toHaveLength(1);
      expect(results[0].statusCode).toBe(0);
      expect(results[0].error).toBe('Timeout');
    }, 10000);

    it('respects concurrency option', async () => {
      let concurrentCalls = 0;
      let maxConcurrentCalls = 0;

      mockFetch.mockImplementation(async () => {
        concurrentCalls++;
        maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 10));
        concurrentCalls--;
        return { status: 200, headers: new Map() };
      });

      const links = Array(10).fill(null).map((_, i) =>
        createLink({ href: `https://example.com/page${i}` })
      );

      await checkLinks(links, { concurrency: 3 });

      // Max concurrent calls should not exceed concurrency limit
      expect(maxConcurrentCalls).toBeLessThanOrEqual(3);
    });

    it('uses default timeout of 10000ms by checking AbortSignal is passed', async () => {
      // Verify that the abort signal is being used (indirect verification of timeout)
      let receivedSignal: AbortSignal | undefined;
      mockFetch.mockImplementation((url: string, options: { signal?: AbortSignal }) => {
        receivedSignal = options.signal;
        return Promise.resolve({ status: 200, headers: new Map() });
      });

      const links = [createLink()];
      await checkLinks(links);

      expect(receivedSignal).toBeDefined();
      expect(receivedSignal).toBeInstanceOf(AbortSignal);
    });

    it('uses default concurrency of 5', async () => {
      let concurrentCalls = 0;
      let maxConcurrentCalls = 0;

      mockFetch.mockImplementation(async () => {
        concurrentCalls++;
        maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
        await new Promise(resolve => setTimeout(resolve, 10));
        concurrentCalls--;
        return { status: 200, headers: new Map() };
      });

      const links = Array(20).fill(null).map((_, i) =>
        createLink({ href: `https://example.com/page${i}` })
      );

      await checkLinks(links);

      expect(maxConcurrentCalls).toBeLessThanOrEqual(5);
    });
  });

  describe('status codes', () => {
    it('returns correct statusCode for successful requests', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        headers: new Map(),
      });

      const links = [createLink()];
      const results = await checkLinks(links);

      expect(results[0].statusCode).toBe(200);
    });

    it('returns correct statusCode for 404 errors', async () => {
      mockFetch.mockResolvedValue({
        status: 404,
        headers: new Map(),
      });

      const links = [createLink()];
      const results = await checkLinks(links);

      expect(results[0].statusCode).toBe(404);
    });

    it('returns correct statusCode for 500 errors', async () => {
      mockFetch.mockResolvedValue({
        status: 500,
        headers: new Map(),
      });

      const links = [createLink()];
      const results = await checkLinks(links);

      expect(results[0].statusCode).toBe(500);
    });
  });

  describe('HEAD 405/501 fallback to GET', () => {
    it('falls back to GET when HEAD returns 405', async () => {
      let callCount = 0;
      mockFetch.mockImplementation((url: string, options: { method: string }) => {
        callCount++;
        if (options.method === 'HEAD') {
          return Promise.resolve({ status: 405, headers: new Map() });
        }
        return Promise.resolve({ status: 200, headers: new Map() });
      });

      const links = [createLink()];
      const results = await checkLinks(links);

      expect(results[0].statusCode).toBe(200);
      expect(callCount).toBe(2); // HEAD then GET
    });

    it('falls back to GET when HEAD returns 501', async () => {
      let callCount = 0;
      mockFetch.mockImplementation((url: string, options: { method: string }) => {
        callCount++;
        if (options.method === 'HEAD') {
          return Promise.resolve({ status: 501, headers: new Map() });
        }
        return Promise.resolve({ status: 200, headers: new Map() });
      });

      const links = [createLink()];
      const results = await checkLinks(links);

      expect(results[0].statusCode).toBe(200);
      expect(callCount).toBe(2); // HEAD then GET
    });

    it('does not fall back for other error codes', async () => {
      mockFetch.mockResolvedValue({
        status: 403,
        headers: new Map(),
      });

      const links = [createLink()];
      const results = await checkLinks(links);

      expect(results[0].statusCode).toBe(403);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('redirects', () => {
    it('tracks redirect chain for single redirect', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url === 'https://example.com/original') {
          return Promise.resolve({
            status: 301,
            headers: new Map([['location', 'https://example.com/final']]),
          });
        }
        return Promise.resolve({ status: 200, headers: new Map() });
      });

      const links = [createLink({ href: 'https://example.com/original' })];
      const results = await checkLinks(links);

      expect(results[0].statusCode).toBe(200);
      expect(results[0].redirectUrl).toBe('https://example.com/final');
      expect(results[0].redirectChain).toEqual([
        'https://example.com/original',
        'https://example.com/final',
      ]);
    });

    it('tracks multiple redirects', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url === 'https://example.com/start') {
          return Promise.resolve({
            status: 302,
            headers: new Map([['location', 'https://example.com/middle']]),
          });
        }
        if (url === 'https://example.com/middle') {
          return Promise.resolve({
            status: 302,
            headers: new Map([['location', 'https://example.com/end']]),
          });
        }
        return Promise.resolve({ status: 200, headers: new Map() });
      });

      const links = [createLink({ href: 'https://example.com/start' })];
      const results = await checkLinks(links);

      expect(results[0].redirectChain).toEqual([
        'https://example.com/start',
        'https://example.com/middle',
        'https://example.com/end',
      ]);
    });

    it('handles relative redirect URLs', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url === 'https://example.com/page') {
          return Promise.resolve({
            status: 301,
            headers: new Map([['location', '/new-page']]),
          });
        }
        return Promise.resolve({ status: 200, headers: new Map() });
      });

      const links = [createLink({ href: 'https://example.com/page' })];
      const results = await checkLinks(links);

      expect(results[0].redirectUrl).toBe('https://example.com/new-page');
    });

    it('does not set redirectUrl for non-redirect responses', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        headers: new Map(),
      });

      const links = [createLink()];
      const results = await checkLinks(links);

      expect(results[0].redirectUrl).toBeUndefined();
      expect(results[0].redirectChain).toBeUndefined();
    });

    it('stops following redirects after MAX_REDIRECTS (5)', async () => {
      let redirectCount = 0;
      mockFetch.mockImplementation(() => {
        redirectCount++;
        return Promise.resolve({
          status: 302,
          headers: new Map([['location', `https://example.com/redirect${redirectCount}`]]),
        });
      });

      const links = [createLink({ href: 'https://example.com/start' })];
      const results = await checkLinks(links);

      // Should stop at 5 redirects (0-indexed loop runs 5 times)
      expect(redirectCount).toBe(5);
      // Final status is 0 because the loop exits without setting finalStatus on the last redirect
      expect(results[0].statusCode).toBe(0);
    });
  });

  describe('error handling', () => {
    it('handles timeout errors (AbortError)', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      const links = [createLink()];
      const results = await checkLinks(links);

      expect(results[0].statusCode).toBe(0);
      expect(results[0].error).toBe('Timeout');
    });

    it('handles network errors', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const links = [createLink()];
      const results = await checkLinks(links);

      expect(results[0].statusCode).toBe(0);
      expect(results[0].error).toBe('ECONNREFUSED');
    });

    it('handles DNS resolution errors', async () => {
      mockFetch.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

      const links = [createLink()];
      const results = await checkLinks(links);

      expect(results[0].statusCode).toBe(0);
      expect(results[0].error).toBe('getaddrinfo ENOTFOUND');
    });

    it('handles unknown errors', async () => {
      mockFetch.mockRejectedValue('string error'); // non-Error object

      const links = [createLink()];
      const results = await checkLinks(links);

      expect(results[0].statusCode).toBe(0);
      expect(results[0].error).toBe('Unknown error');
    });

    it('preserves link properties in error results', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const links = [createLink({
        href: 'https://failing.example.com',
        text: 'Failing Link',
        isInternal: true,
        sourceUrl: 'https://source.example.com',
      })];
      const results = await checkLinks(links);

      expect(results[0].href).toBe('https://failing.example.com');
      expect(results[0].text).toBe('Failing Link');
      expect(results[0].isInternal).toBe(true);
      expect(results[0].sourceUrl).toBe('https://source.example.com');
    });
  });

  describe('batch processing', () => {
    it('processes empty link array', async () => {
      const results = await checkLinks([]);
      expect(results).toEqual([]);
    });

    it('processes single link', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        headers: new Map(),
      });

      const links = [createLink()];
      const results = await checkLinks(links);

      expect(results).toHaveLength(1);
    });

    it('processes multiple batches correctly', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        headers: new Map(),
      });

      // 12 links with concurrency 5 = 3 batches (5, 5, 2)
      const links = Array(12).fill(null).map((_, i) =>
        createLink({ href: `https://example.com/page${i}` })
      );

      const results = await checkLinks(links, { concurrency: 5 });

      expect(results).toHaveLength(12);
    });
  });
});

describe('findBrokenLinks', () => {
  it('returns links with status 0 (connection errors)', () => {
    const results: LinkCheckResult[] = [
      createLinkResult({ statusCode: 0, error: 'Network error' }),
      createLinkResult({ statusCode: 200 }),
    ];

    const broken = findBrokenLinks(results);

    expect(broken).toHaveLength(1);
    expect(broken[0].statusCode).toBe(0);
  });

  it('returns links with 4xx status', () => {
    const results: LinkCheckResult[] = [
      createLinkResult({ statusCode: 400 }),
      createLinkResult({ statusCode: 401 }),
      createLinkResult({ statusCode: 403 }),
      createLinkResult({ statusCode: 404 }),
      createLinkResult({ statusCode: 410 }),
      createLinkResult({ statusCode: 499 }),
      createLinkResult({ statusCode: 200 }),
    ];

    const broken = findBrokenLinks(results);

    expect(broken).toHaveLength(6);
    expect(broken.every(r => r.statusCode >= 400 && r.statusCode < 500)).toBe(true);
  });

  it('returns links with 5xx status', () => {
    const results: LinkCheckResult[] = [
      createLinkResult({ statusCode: 500 }),
      createLinkResult({ statusCode: 502 }),
      createLinkResult({ statusCode: 503 }),
      createLinkResult({ statusCode: 504 }),
      createLinkResult({ statusCode: 599 }),
      createLinkResult({ statusCode: 200 }),
    ];

    const broken = findBrokenLinks(results);

    expect(broken).toHaveLength(5);
    expect(broken.every(r => r.statusCode >= 500)).toBe(true);
  });

  it('does not return 2xx links', () => {
    const results: LinkCheckResult[] = [
      createLinkResult({ statusCode: 200 }),
      createLinkResult({ statusCode: 201 }),
      createLinkResult({ statusCode: 204 }),
      createLinkResult({ statusCode: 299 }),
    ];

    const broken = findBrokenLinks(results);

    expect(broken).toHaveLength(0);
  });

  it('does not return 3xx links', () => {
    const results: LinkCheckResult[] = [
      createLinkResult({ statusCode: 301, redirectUrl: 'https://example.com/new' }),
      createLinkResult({ statusCode: 302, redirectUrl: 'https://example.com/temp' }),
      createLinkResult({ statusCode: 307 }),
      createLinkResult({ statusCode: 308 }),
    ];

    const broken = findBrokenLinks(results);

    expect(broken).toHaveLength(0);
  });

  it('handles empty results array', () => {
    const broken = findBrokenLinks([]);
    expect(broken).toEqual([]);
  });

  it('returns all broken links when all are broken', () => {
    const results: LinkCheckResult[] = [
      createLinkResult({ statusCode: 0 }),
      createLinkResult({ statusCode: 404 }),
      createLinkResult({ statusCode: 500 }),
    ];

    const broken = findBrokenLinks(results);

    expect(broken).toHaveLength(3);
  });

  it('returns empty array when no links are broken', () => {
    const results: LinkCheckResult[] = [
      createLinkResult({ statusCode: 200 }),
      createLinkResult({ statusCode: 301 }),
      createLinkResult({ statusCode: 204 }),
    ];

    const broken = findBrokenLinks(results);

    expect(broken).toHaveLength(0);
  });

  it('preserves all link properties in returned broken links', () => {
    const results: LinkCheckResult[] = [
      createLinkResult({
        href: 'https://broken.example.com',
        text: 'Broken Link',
        isInternal: true,
        sourceUrl: 'https://source.com',
        statusCode: 404,
        error: 'Not Found',
      }),
    ];

    const broken = findBrokenLinks(results);

    expect(broken[0].href).toBe('https://broken.example.com');
    expect(broken[0].text).toBe('Broken Link');
    expect(broken[0].isInternal).toBe(true);
    expect(broken[0].sourceUrl).toBe('https://source.com');
    expect(broken[0].error).toBe('Not Found');
  });
});

describe('findRedirectChains', () => {
  it('returns links with 3+ redirects', () => {
    const results: LinkCheckResult[] = [
      createLinkResult({
        redirectChain: ['https://a.com', 'https://b.com', 'https://c.com'],
      }),
      createLinkResult({
        redirectChain: ['https://1.com', 'https://2.com', 'https://3.com', 'https://4.com'],
      }),
    ];

    const chains = findRedirectChains(results);

    expect(chains).toHaveLength(2);
  });

  it('returns links with exactly 3 redirects', () => {
    const results: LinkCheckResult[] = [
      createLinkResult({
        redirectChain: ['https://start.com', 'https://middle.com', 'https://end.com'],
      }),
    ];

    const chains = findRedirectChains(results);

    expect(chains).toHaveLength(1);
  });

  it('does not return links with 2 redirects (1 hop)', () => {
    const results: LinkCheckResult[] = [
      createLinkResult({
        redirectChain: ['https://old.com', 'https://new.com'],
      }),
    ];

    const chains = findRedirectChains(results);

    expect(chains).toHaveLength(0);
  });

  it('does not return links with 1 entry (no redirect)', () => {
    const results: LinkCheckResult[] = [
      createLinkResult({
        redirectChain: ['https://example.com'],
      }),
    ];

    const chains = findRedirectChains(results);

    expect(chains).toHaveLength(0);
  });

  it('does not return links without redirect chain', () => {
    const results: LinkCheckResult[] = [
      createLinkResult({ statusCode: 200 }),
      createLinkResult({ statusCode: 404 }),
    ];

    const chains = findRedirectChains(results);

    expect(chains).toHaveLength(0);
  });

  it('handles empty results array', () => {
    const chains = findRedirectChains([]);
    expect(chains).toEqual([]);
  });

  it('handles undefined redirectChain', () => {
    const results: LinkCheckResult[] = [
      createLinkResult({ redirectChain: undefined }),
    ];

    const chains = findRedirectChains(results);

    expect(chains).toHaveLength(0);
  });

  it('filters correctly with mixed redirect chain lengths', () => {
    const results: LinkCheckResult[] = [
      createLinkResult({ redirectChain: undefined }), // No chain
      createLinkResult({ redirectChain: ['https://a.com'] }), // 1 entry
      createLinkResult({ redirectChain: ['https://a.com', 'https://b.com'] }), // 2 entries
      createLinkResult({
        href: 'https://chain3.com',
        redirectChain: ['https://a.com', 'https://b.com', 'https://c.com'], // 3 entries - MATCH
      }),
      createLinkResult({
        href: 'https://chain4.com',
        redirectChain: ['https://a.com', 'https://b.com', 'https://c.com', 'https://d.com'], // 4 entries - MATCH
      }),
    ];

    const chains = findRedirectChains(results);

    expect(chains).toHaveLength(2);
    expect(chains[0].href).toBe('https://chain3.com');
    expect(chains[1].href).toBe('https://chain4.com');
  });

  it('preserves all link properties in returned results', () => {
    const results: LinkCheckResult[] = [
      createLinkResult({
        href: 'https://chained.example.com',
        text: 'Chained Link',
        isInternal: false,
        sourceUrl: 'https://source.com',
        statusCode: 200,
        redirectUrl: 'https://final.com',
        redirectChain: ['https://a.com', 'https://b.com', 'https://c.com'],
      }),
    ];

    const chains = findRedirectChains(results);

    expect(chains[0].href).toBe('https://chained.example.com');
    expect(chains[0].text).toBe('Chained Link');
    expect(chains[0].isInternal).toBe(false);
    expect(chains[0].sourceUrl).toBe('https://source.com');
    expect(chains[0].statusCode).toBe(200);
    expect(chains[0].redirectUrl).toBe('https://final.com');
  });
});
