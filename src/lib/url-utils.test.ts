import { describe, it, expect } from 'vitest';
import { normalizeUrl, isSafeUrl, getHostname, isInternalUrl, shouldExcludeUrl, resolveUrl } from './url-utils';

describe('normalizeUrl', () => {
  it('should add https:// prefix if missing', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com/');
    expect(normalizeUrl('www.example.com')).toBe('https://example.com/');
  });

  it('should force https protocol', () => {
    expect(normalizeUrl('http://example.com')).toBe('https://example.com/');
  });

  it('should remove trailing slash from paths', () => {
    expect(normalizeUrl('https://example.com/path/')).toBe('https://example.com/path');
  });

  it('should keep trailing slash for root', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('should remove hash fragments', () => {
    expect(normalizeUrl('https://example.com/#section')).toBe('https://example.com/');
  });

  it('should lowercase hostname', () => {
    expect(normalizeUrl('https://EXAMPLE.COM')).toBe('https://example.com/');
  });

  it('should remove www prefix', () => {
    expect(normalizeUrl('https://www.example.com')).toBe('https://example.com/');
  });

  it('should sort query params', () => {
    const result = normalizeUrl('https://example.com?b=2&a=1');
    expect(result).toBe('https://example.com/?a=1&b=2');
  });

  it('should throw on invalid URL', () => {
    expect(() => normalizeUrl('not a url at all')).toThrow('Invalid URL');
  });
});

describe('isSafeUrl - SSRF Protection', () => {
  describe('Protocol validation', () => {
    it('should allow http and https', () => {
      expect(isSafeUrl('http://example.com')).toBe(true);
      expect(isSafeUrl('https://example.com')).toBe(true);
    });

    it('should block file:// protocol', () => {
      expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    });

    it('should block javascript: protocol', () => {
      expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    });

    it('should block ftp: protocol', () => {
      expect(isSafeUrl('ftp://example.com')).toBe(false);
    });
  });

  describe('Localhost blocking', () => {
    it('should block localhost', () => {
      expect(isSafeUrl('http://localhost')).toBe(false);
      expect(isSafeUrl('http://localhost:3000')).toBe(false);
    });

    it('should block 127.0.0.1', () => {
      expect(isSafeUrl('http://127.0.0.1')).toBe(false);
      expect(isSafeUrl('http://127.0.0.1:8080')).toBe(false);
    });

    it('should block 0.0.0.0', () => {
      expect(isSafeUrl('http://0.0.0.0')).toBe(false);
    });
  });

  describe('IPv4 private ranges', () => {
    it('should block 10.x.x.x (Class A private)', () => {
      expect(isSafeUrl('http://10.0.0.1')).toBe(false);
      expect(isSafeUrl('http://10.255.255.255')).toBe(false);
    });

    it('should block 172.16-31.x.x (Class B private)', () => {
      expect(isSafeUrl('http://172.16.0.1')).toBe(false);
      expect(isSafeUrl('http://172.31.255.255')).toBe(false);
      // 172.15.x.x should be allowed (not in private range)
      expect(isSafeUrl('http://172.15.0.1')).toBe(true);
      expect(isSafeUrl('http://172.32.0.1')).toBe(true);
    });

    it('should block 192.168.x.x (Class C private)', () => {
      expect(isSafeUrl('http://192.168.0.1')).toBe(false);
      expect(isSafeUrl('http://192.168.255.255')).toBe(false);
    });

    it('should block 127.x.x.x (loopback)', () => {
      expect(isSafeUrl('http://127.0.0.1')).toBe(false);
      expect(isSafeUrl('http://127.255.255.255')).toBe(false);
    });

    it('should block 169.254.x.x (link-local/metadata)', () => {
      expect(isSafeUrl('http://169.254.169.254')).toBe(false); // AWS metadata
      expect(isSafeUrl('http://169.254.0.1')).toBe(false);
    });

    it('should block 100.64-127.x.x (CGNAT)', () => {
      expect(isSafeUrl('http://100.64.0.1')).toBe(false);
      expect(isSafeUrl('http://100.127.255.255')).toBe(false);
      expect(isSafeUrl('http://100.63.0.1')).toBe(true); // Below CGNAT range
      expect(isSafeUrl('http://100.128.0.1')).toBe(true); // Above CGNAT range
    });

    it('should block multicast and reserved ranges', () => {
      expect(isSafeUrl('http://224.0.0.1')).toBe(false); // Multicast
      expect(isSafeUrl('http://255.255.255.255')).toBe(false); // Broadcast
    });
  });

  describe('IPv6 private ranges', () => {
    it('should block ::1 (loopback)', () => {
      expect(isSafeUrl('http://[::1]')).toBe(false);
    });

    it('should block fc00::/7 (Unique Local Addresses)', () => {
      expect(isSafeUrl('http://[fc00::1]')).toBe(false);
      expect(isSafeUrl('http://[fd00::1]')).toBe(false);
      expect(isSafeUrl('http://[fdff::1]')).toBe(false);
    });

    it('should block fe80::/10 (link-local)', () => {
      expect(isSafeUrl('http://[fe80::1]')).toBe(false);
    });

    it('should block IPv4-mapped IPv6 addresses', () => {
      expect(isSafeUrl('http://[::ffff:127.0.0.1]')).toBe(false);
      expect(isSafeUrl('http://[::ffff:192.168.1.1]')).toBe(false);
      expect(isSafeUrl('http://[::ffff:169.254.169.254]')).toBe(false);
    });
  });

  describe('Cloud metadata endpoints', () => {
    it('should block AWS metadata hostname', () => {
      expect(isSafeUrl('http://metadata.aws.internal')).toBe(false);
      expect(isSafeUrl('http://instance-data.ec2.internal')).toBe(false);
    });

    it('should block GCP metadata hostname', () => {
      expect(isSafeUrl('http://metadata.google.internal')).toBe(false);
      expect(isSafeUrl('http://metadata')).toBe(false);
    });

    it('should block Azure metadata hostname', () => {
      expect(isSafeUrl('http://metadata.azure.com')).toBe(false);
    });

    it('should block Oracle Cloud metadata hostname', () => {
      expect(isSafeUrl('http://metadata.oraclecloud.com')).toBe(false);
    });
  });

  describe('Internal hostname patterns', () => {
    it('should block .local domains', () => {
      expect(isSafeUrl('http://server.local')).toBe(false);
    });

    it('should block .internal domains', () => {
      expect(isSafeUrl('http://api.internal')).toBe(false);
    });

    it('should block .corp domains', () => {
      expect(isSafeUrl('http://intranet.corp')).toBe(false);
    });

    it('should block .lan domains', () => {
      expect(isSafeUrl('http://router.lan')).toBe(false);
    });

    it('should block .home domains', () => {
      expect(isSafeUrl('http://server.home')).toBe(false);
    });

    it('should block .localdomain', () => {
      expect(isSafeUrl('http://server.localdomain')).toBe(false);
    });
  });

  describe('Valid external URLs', () => {
    it('should allow public domains', () => {
      expect(isSafeUrl('https://google.com')).toBe(true);
      expect(isSafeUrl('https://example.com')).toBe(true);
      expect(isSafeUrl('https://github.com')).toBe(true);
    });

    it('should allow public IP addresses', () => {
      expect(isSafeUrl('http://8.8.8.8')).toBe(true); // Google DNS
      expect(isSafeUrl('http://1.1.1.1')).toBe(true); // Cloudflare DNS
    });
  });
});

describe('getHostname', () => {
  it('should extract hostname from URL', () => {
    expect(getHostname('https://example.com/path')).toBe('example.com');
  });

  it('should lowercase hostname', () => {
    expect(getHostname('https://EXAMPLE.COM')).toBe('example.com');
  });

  it('should return empty string for invalid URL', () => {
    expect(getHostname('not a url')).toBe('');
  });
});

describe('isInternalUrl', () => {
  it('should return true for same hostname', () => {
    expect(isInternalUrl('https://example.com/page', 'example.com')).toBe(true);
  });

  it('should ignore www prefix', () => {
    expect(isInternalUrl('https://www.example.com/page', 'example.com')).toBe(true);
    expect(isInternalUrl('https://example.com/page', 'www.example.com')).toBe(true);
  });

  it('should return false for different hostname', () => {
    expect(isInternalUrl('https://other.com/page', 'example.com')).toBe(false);
  });

  it('should return false for invalid URL', () => {
    expect(isInternalUrl('not a url', 'example.com')).toBe(false);
  });
});

describe('shouldExcludeUrl', () => {
  it('should exclude admin paths', () => {
    expect(shouldExcludeUrl('https://example.com/wp-admin')).toBe(true);
    expect(shouldExcludeUrl('https://example.com/admin')).toBe(true);
  });

  it('should exclude auth paths', () => {
    expect(shouldExcludeUrl('https://example.com/login')).toBe(true);
    expect(shouldExcludeUrl('https://example.com/logout')).toBe(true);
  });

  it('should exclude static files', () => {
    expect(shouldExcludeUrl('https://example.com/image.jpg')).toBe(true);
    expect(shouldExcludeUrl('https://example.com/document.pdf')).toBe(true);
    expect(shouldExcludeUrl('https://example.com/archive.zip')).toBe(true);
  });

  it('should exclude API paths', () => {
    expect(shouldExcludeUrl('https://example.com/api/users')).toBe(true);
  });

  it('should exclude Next.js internal paths', () => {
    expect(shouldExcludeUrl('https://example.com/_next/static')).toBe(true);
  });

  it('should allow regular pages', () => {
    expect(shouldExcludeUrl('https://example.com/about')).toBe(false);
    expect(shouldExcludeUrl('https://example.com/products')).toBe(false);
  });
});

describe('resolveUrl', () => {
  it('should resolve relative URLs', () => {
    expect(resolveUrl('/page', 'https://example.com')).toBe('https://example.com/page');
    expect(resolveUrl('./page', 'https://example.com/dir/')).toBe('https://example.com/dir/page');
  });

  it('should handle absolute URLs', () => {
    expect(resolveUrl('https://other.com/page', 'https://example.com')).toBe('https://other.com/page');
  });

  it('should return null for truly invalid URLs', () => {
    // Note: ':::invalid' is treated as a relative path, so we need a truly invalid case
    expect(resolveUrl('https://[invalid-bracket', 'https://example.com')).toBe(null);
  });

  it('should handle relative paths that look unusual but are valid', () => {
    // ':::invalid' is a valid relative path (becomes /:::invalid)
    expect(resolveUrl(':::invalid', 'https://example.com')).toBe('https://example.com/:::invalid');
  });
});
