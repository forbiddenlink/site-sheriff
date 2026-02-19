/**
 * URL utilities for normalizing and validating URLs
 */

/**
 * Normalize a URL for consistent comparison and storage
 */
export function normalizeUrl(input: string): string {
  try {
    // Add protocol if missing
    let url = input.trim();
    if (!url.match(/^https?:\/\//i)) {
      url = `https://${url}`;
    }

    const parsed = new URL(url);

    // Force HTTPS
    parsed.protocol = 'https:';

    // Remove trailing slash from pathname (unless it's just "/")
    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    // Remove hash
    parsed.hash = '';

    // Sort search params for consistency
    parsed.searchParams.sort();

    // Lowercase hostname
    parsed.hostname = parsed.hostname.toLowerCase();

    // Remove www. prefix for normalization
    if (parsed.hostname.startsWith('www.')) {
      parsed.hostname = parsed.hostname.slice(4);
    }

    return parsed.toString();
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }
}

/**
 * Extract the hostname from a URL
 */
export function getHostname(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Check if a URL is internal to the given base hostname
 */
export function isInternalUrl(url: string, baseHostname: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const base = baseHostname.toLowerCase().replace(/^www\./, '');
    return hostname === base;
  } catch {
    return false;
  }
}

/**
 * Check if a URL should be excluded from crawling
 */
export function shouldExcludeUrl(url: string): boolean {
  const excludePatterns = [
    /\/wp-admin/i,
    /\/admin/i,
    /\/login/i,
    /\/logout/i,
    /\/account/i,
    /\/cart/i,
    /\/checkout/i,
    /\.(pdf|jpg|jpeg|png|gif|svg|webp|ico|mp4|mp3|zip|tar|gz)$/i,
    /\?.*logout/i,
    /\/feed\/?$/i,
    /\/rss\/?$/i,
  ];

  return excludePatterns.some((pattern) => pattern.test(url));
}

/**
 * Resolve a relative URL against a base URL
 */
export function resolveUrl(relative: string, base: string): string | null {
  try {
    return new URL(relative, base).toString();
  } catch {
    return null;
  }
}
