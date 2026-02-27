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
    /\/api\//i,
    /\/_next\//i,
    /\/\.well-known\//i,
  ];

  return excludePatterns.some((pattern) => pattern.test(url));
}

/**
 * Cloud metadata hostnames to block (SSRF protection)
 */
const BLOCKED_HOSTNAMES = [
  'metadata.aws.internal',
  'instance-data.ec2.internal',
  'metadata.google.internal',
  'metadata',
  'metadata.azure.com',
  'metadata.oraclecloud.com',
];

/**
 * Check if an IPv4 address is in a private/blocked range
 */
function isPrivateIPv4(ip: string): boolean {
  const match = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;

  const [, a, b, c] = match.map(Number);

  // Loopback
  if (a === 127) return true;

  // Private networks
  if (a === 10) return true;                           // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16.0.0/12
  if (a === 192 && b === 168) return true;             // 192.168.0.0/16

  // Link-local and cloud metadata
  if (a === 169 && b === 254) return true;             // 169.254.0.0/16

  // This host
  if (a === 0) return true;                            // 0.0.0.0/8

  // CGNAT (Carrier-Grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;   // 100.64.0.0/10

  // IETF Protocol Assignments
  if (a === 192 && b === 0 && c === 0) return true;    // 192.0.0.0/24

  // Documentation/Test ranges
  if (a === 192 && b === 0 && c === 2) return true;    // 192.0.2.0/24 (TEST-NET-1)
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 (TEST-NET-2)
  if (a === 203 && b === 0 && c === 113) return true;  // 203.0.113.0/24 (TEST-NET-3)

  // Benchmarking
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15

  // Multicast and reserved
  if (a >= 224) return true;                           // 224.0.0.0/4 and above

  return false;
}

/**
 * Check if an IPv6 address is in a private/blocked range
 */
function isPrivateIPv6(hostname: string): boolean {
  // Remove brackets if present
  const ip = hostname.replace(/^\[|\]$/g, '').toLowerCase();

  // Loopback
  if (ip === '::1') return true;

  // IPv4-mapped IPv6 addresses - two formats:
  // 1. Dotted decimal: ::ffff:192.168.1.1
  // 2. Hex (URL-normalized): ::ffff:c0a8:101 or [::ffff:7f00:1]
  const v4MappedDottedMatch = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4MappedDottedMatch && isPrivateIPv4(v4MappedDottedMatch[1])) return true;

  // Check hex form - URL API normalizes ::ffff:127.0.0.1 to ::ffff:7f00:1
  const v4MappedHexMatch = ip.match(/^::ffff:([0-9a-f]+):([0-9a-f]+)$/i);
  if (v4MappedHexMatch) {
    // Convert hex back to IPv4 to check
    const high = parseInt(v4MappedHexMatch[1], 16);
    const low = parseInt(v4MappedHexMatch[2], 16);
    const a = (high >> 8) & 0xff;
    const b = high & 0xff;
    const c = (low >> 8) & 0xff;
    const d = low & 0xff;
    if (isPrivateIPv4(`${a}.${b}.${c}.${d}`)) return true;
  }

  // Unique Local Addresses (fc00::/7 = fc00:: to fdff::)
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true;

  // Link-local (fe80::/10)
  if (ip.startsWith('fe80:') || ip.startsWith('fe8') || ip.startsWith('fe9') ||
      ip.startsWith('fea') || ip.startsWith('feb')) return true;

  // Site-local (deprecated but still block fec0::/10)
  if (ip.startsWith('fec') || ip.startsWith('fed') || ip.startsWith('fee') || ip.startsWith('fef')) return true;

  return false;
}

/**
 * Check if a URL is safe to crawl (SSRF protection).
 * Rejects private IPs, localhost, cloud metadata endpoints, and non-http(s) protocols.
 */
export function isSafeUrl(url: string): boolean {
  try {
    // Check protocol BEFORE adding default prefix
    // This prevents file://, ftp://, javascript: etc. from being rewritten to https://
    const lowerUrl = url.toLowerCase().trim();
    if (lowerUrl.startsWith('file:') ||
        lowerUrl.startsWith('ftp:') ||
        lowerUrl.startsWith('javascript:') ||
        lowerUrl.startsWith('data:') ||
        lowerUrl.startsWith('blob:') ||
        lowerUrl.startsWith('about:') ||
        lowerUrl.startsWith('chrome:') ||
        lowerUrl.startsWith('view-source:')) {
      return false;
    }

    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost variants
    if (hostname === 'localhost' || hostname === '0.0.0.0') return false;

    // Block cloud metadata hostnames
    if (BLOCKED_HOSTNAMES.some(blocked =>
      hostname === blocked || hostname.endsWith(`.${blocked}`)
    )) {
      return false;
    }

    // Block hostnames that look like internal resources
    if (hostname.endsWith('.local') ||
        hostname.endsWith('.internal') ||
        hostname.endsWith('.corp') ||
        hostname.endsWith('.lan') ||
        hostname.endsWith('.home') ||
        hostname.endsWith('.localdomain')) {
      return false;
    }

    // Check for IPv4 addresses
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      if (isPrivateIPv4(hostname)) return false;
    }

    // Check for IPv6 addresses (with or without brackets)
    if (hostname.startsWith('[') || hostname.includes(':')) {
      if (isPrivateIPv6(hostname)) return false;
    }

    return true;
  } catch {
    return false;
  }
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
