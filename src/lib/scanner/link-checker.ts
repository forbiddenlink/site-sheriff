import type { LinkData } from '../types';

export interface LinkCheckResult extends LinkData {
  statusCode: number;
  error?: string;
  redirectUrl?: string;
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

async function checkSingleLink(link: LinkData, timeout: number): Promise<LinkCheckResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Try HEAD first (faster), fall back to GET
    let response = await fetch(link.href, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });

    // Some servers don't support HEAD, try GET
    if (response.status === 405 || response.status === 501) {
      response = await fetch(link.href, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
      });
    }

    return {
      ...link,
      statusCode: response.status,
      redirectUrl: response.redirected ? response.url : undefined,
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
