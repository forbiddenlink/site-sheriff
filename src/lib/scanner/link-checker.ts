import type { LinkData } from '../types';

export interface LinkCheckResult extends LinkData {
  statusCode: number;
  error?: string;
  redirectUrl?: string;
  redirectChain?: string[];
}

/**
 * Check a batch of links for broken status
 */
export async function checkLinks(
  links: LinkData[],
  options: { timeout?: number; concurrency?: number } = {}
): Promise<LinkCheckResult[]> {
  const { timeout = 10000, concurrency = 5 } = options;

  // Dedupe links by href
  const uniqueLinks = Array.from(new Map(links.map((l) => [l.href, l])).values());

  const results: LinkCheckResult[] = [];
  const queue = [...uniqueLinks];

  // Process in batches
  while (queue.length > 0) {
    const batch = queue.splice(0, concurrency);
    const batchResults = await Promise.all(
      batch.map((link) => checkSingleLink(link, timeout))
    );
    results.push(...batchResults);
  }

  return results;
}

const MAX_REDIRECTS = 5;

async function checkSingleLink(link: LinkData, timeout: number): Promise<LinkCheckResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const chain: string[] = [link.href];
    let currentUrl = link.href;
    let method: 'HEAD' | 'GET' = 'HEAD';
    let finalStatus = 0;

    for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
      const response = await fetch(currentUrl, {
        method,
        signal: controller.signal,
        redirect: 'manual',
      });

      // Some servers don't support HEAD, retry with GET
      if (method === 'HEAD' && (response.status === 405 || response.status === 501)) {
        method = 'GET';
        continue; // Retry same URL with GET
      }

      // Handle redirects (3xx with Location header)
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          const nextUrl = new URL(location, currentUrl).href;
          chain.push(nextUrl);
          currentUrl = nextUrl;
          continue;
        }
      }

      // Final response (non-redirect)
      finalStatus = response.status;
      break;
    }

    return {
      ...link,
      statusCode: finalStatus,
      redirectUrl: chain.length > 1 ? chain.at(-1) : undefined,
      redirectChain: chain.length > 1 ? chain : undefined,
    };
  } catch (error) {
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMessage = 'Timeout';
      } else {
        errorMessage = error.message;
      }
    }

    return {
      ...link,
      statusCode: 0,
      error: errorMessage,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Filter links to find broken ones
 */
export function findBrokenLinks(results: LinkCheckResult[]): LinkCheckResult[] {
  return results.filter((r) => {
    // Connection errors
    if (r.statusCode === 0) return true;
    // Client errors (4xx)
    if (r.statusCode >= 400 && r.statusCode < 500) return true;
    // Server errors (5xx)
    if (r.statusCode >= 500) return true;
    return false;
  });
}

/**
 * Find links with redirect chains of 2+ hops
 */
export function findRedirectChains(results: LinkCheckResult[]): LinkCheckResult[] {
  return results.filter((r) => r.redirectChain && r.redirectChain.length >= 3);
}
