import type { CrawlResult } from './crawler';
import * as cheerio from 'cheerio';

export interface SecurityIssue {
  code: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  category: 'SECURITY';
  title: string;
  whyItMatters: string;
  howToFix: string;
  evidence: {
    url: string;
    expected?: string;
    actual?: string;
    snippet?: string;
    header?: string;
  };
  impact: number;
  effort: number;
}

// Security headers to check with their importance
const SECURITY_HEADERS: Array<{
  header: string;
  code: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  title: string;
  whyItMatters: string;
  howToFix: string;
  impact: number;
  effort: number;
}> = [
  {
    header: 'content-security-policy',
    code: 'missing_csp',
    severity: 'P1',
    title: 'Missing Content-Security-Policy header',
    whyItMatters:
      'CSP prevents cross-site scripting (XSS), clickjacking, and other code injection attacks by specifying which content sources are allowed.',
    howToFix:
      "Add a Content-Security-Policy header. Start with a report-only policy: Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
    impact: 4,
    effort: 3,
  },
  {
    header: 'x-frame-options',
    code: 'missing_x_frame_options',
    severity: 'P2',
    title: 'Missing X-Frame-Options header',
    whyItMatters:
      'Without X-Frame-Options, your site can be embedded in an iframe on a malicious site, enabling clickjacking attacks.',
    howToFix:
      'Add the header: X-Frame-Options: DENY (or SAMEORIGIN if you need to embed your own pages).',
    impact: 3,
    effort: 1,
  },
  {
    header: 'x-content-type-options',
    code: 'missing_x_content_type_options',
    severity: 'P2',
    title: 'Missing X-Content-Type-Options header',
    whyItMatters:
      'Without this header, browsers may MIME-sniff responses away from the declared content-type, which can lead to security vulnerabilities.',
    howToFix: 'Add the header: X-Content-Type-Options: nosniff',
    impact: 3,
    effort: 1,
  },
  {
    header: 'strict-transport-security',
    code: 'missing_hsts',
    severity: 'P1',
    title: 'Missing Strict-Transport-Security (HSTS) header',
    whyItMatters:
      'Without HSTS, users can be downgraded from HTTPS to HTTP via man-in-the-middle attacks. HSTS tells browsers to always use HTTPS.',
    howToFix:
      'Add the header: Strict-Transport-Security: max-age=31536000; includeSubDomains. Start with a short max-age and increase once verified.',
    impact: 4,
    effort: 1,
  },
  {
    header: 'referrer-policy',
    code: 'missing_referrer_policy',
    severity: 'P3',
    title: 'Missing Referrer-Policy header',
    whyItMatters:
      'Without a Referrer-Policy, the browser sends the full URL as a referrer to other sites, potentially leaking sensitive data in URLs.',
    howToFix:
      'Add the header: Referrer-Policy: strict-origin-when-cross-origin',
    impact: 2,
    effort: 1,
  },
  {
    header: 'permissions-policy',
    code: 'missing_permissions_policy',
    severity: 'P3',
    title: 'Missing Permissions-Policy header',
    whyItMatters:
      'Permissions-Policy controls which browser features (camera, microphone, geolocation) can be used, reducing attack surface.',
    howToFix:
      'Add the header: Permissions-Policy: camera=(), microphone=(), geolocation=()',
    impact: 2,
    effort: 1,
  },
  {
    header: 'cross-origin-opener-policy',
    code: 'missing_coop',
    severity: 'P3',
    title: 'Missing Cross-Origin-Opener-Policy header',
    whyItMatters:
      'COOP prevents cross-origin documents from sharing a browsing context group, protecting against Spectre-style side-channel attacks.',
    howToFix:
      'Add the header: Cross-Origin-Opener-Policy: same-origin (or same-origin-allow-popups if you need cross-origin popups)',
    impact: 2,
    effort: 1,
  },
  {
    header: 'cross-origin-embedder-policy',
    code: 'missing_coep',
    severity: 'P3',
    title: 'Missing Cross-Origin-Embedder-Policy header',
    whyItMatters:
      'COEP prevents loading cross-origin resources that do not explicitly grant permission. Required for SharedArrayBuffer and high-resolution timers.',
    howToFix:
      'Add the header: Cross-Origin-Embedder-Policy: require-corp (ensures all resources are same-origin or explicitly marked cross-origin)',
    impact: 2,
    effort: 2,
  },
  {
    header: 'cross-origin-resource-policy',
    code: 'missing_corp',
    severity: 'P3',
    title: 'Missing Cross-Origin-Resource-Policy header',
    whyItMatters:
      'CORP controls which origins can embed your resources, preventing data leaks through cross-origin embedding attacks.',
    howToFix:
      'Add the header: Cross-Origin-Resource-Policy: same-origin (or cross-origin if resources need to be publicly embeddable)',
    impact: 2,
    effort: 1,
  },
];

/**
 * Analyze a crawl result for security issues
 */
export function checkSecurity(result: CrawlResult): SecurityIssue[] {
  const issues: SecurityIssue[] = [];

  // Check security headers
  for (const check of SECURITY_HEADERS) {
    if (!result.responseHeaders[check.header]) {
      issues.push({
        code: check.code,
        severity: check.severity,
        category: 'SECURITY',
        title: check.title,
        whyItMatters: check.whyItMatters,
        howToFix: check.howToFix,
        evidence: { url: result.url, header: check.header },
        impact: check.impact,
        effort: check.effort,
      });
    }
  }

  // Analyze CSP policy contents if present
  const csp = result.responseHeaders['content-security-policy'];
  if (csp) {
    // Check for unsafe-inline in script-src or style-src
    if (csp.includes("'unsafe-inline'")) {
      issues.push({
        code: 'csp_unsafe_inline',
        severity: 'P1',
        category: 'SECURITY',
        title: 'CSP allows unsafe-inline scripts or styles',
        whyItMatters:
          "unsafe-inline defeats the purpose of CSP by allowing inline scripts that could be injected by attackers via XSS vulnerabilities.",
        howToFix:
          "Remove 'unsafe-inline' and use nonces or hashes for legitimate inline scripts. For styles, consider extracting inline styles to external stylesheets.",
        evidence: { url: result.url, actual: csp.slice(0, 200) },
        impact: 4,
        effort: 3,
      });
    }

    // Check for unsafe-eval in script-src
    if (csp.includes("'unsafe-eval'")) {
      issues.push({
        code: 'csp_unsafe_eval',
        severity: 'P1',
        category: 'SECURITY',
        title: 'CSP allows unsafe-eval',
        whyItMatters:
          "unsafe-eval allows the use of eval() and similar functions, which can execute arbitrary code injected by attackers.",
        howToFix:
          "Remove 'unsafe-eval' from your CSP. Refactor code that uses eval(), new Function(), or setTimeout/setInterval with strings.",
        evidence: { url: result.url, actual: csp.slice(0, 200) },
        impact: 4,
        effort: 3,
      });
    }

    // Check for overly permissive wildcards in default-src or script-src
    // Match patterns like "default-src *" or "script-src *" but not "*.example.com"
    const hasWildcardDefaultSrc = /default-src[^;]*(?:^|[\s])(\*|https?:\*?)(?:[\s;]|$)/.test(csp);
    const hasWildcardScriptSrc = /script-src[^;]*(?:^|[\s])(\*|https?:\*?)(?:[\s;]|$)/.test(csp);
    if (hasWildcardDefaultSrc || hasWildcardScriptSrc) {
      issues.push({
        code: 'csp_wildcard_source',
        severity: 'P2',
        category: 'SECURITY',
        title: 'CSP uses overly permissive wildcard sources',
        whyItMatters:
          "Using '*' in default-src or script-src allows loading resources from any origin, effectively bypassing CSP protection.",
        howToFix:
          "Replace wildcard sources with specific trusted domains. Use 'self' for same-origin resources and explicitly list third-party domains.",
        evidence: { url: result.url, actual: csp.slice(0, 200) },
        impact: 3,
        effort: 2,
      });
    }

    // Check for data: URIs in script-src
    // Look for data: specifically in script-src directive
    const scriptSrcMatch = csp.match(/script-src[^;]*/);
    if (scriptSrcMatch && scriptSrcMatch[0].includes('data:')) {
      issues.push({
        code: 'csp_data_uri_scripts',
        severity: 'P2',
        category: 'SECURITY',
        title: 'CSP allows data: URIs in script-src',
        whyItMatters:
          "Allowing data: URIs in script-src enables attackers to inject executable scripts encoded as data URIs, bypassing CSP.",
        howToFix:
          "Remove 'data:' from script-src. If you need to load scripts dynamically, use nonces or hashes instead.",
        evidence: { url: result.url, actual: csp.slice(0, 200) },
        impact: 3,
        effort: 2,
      });
    }
  }

  // Check cookie security (limit to first 20 cookies to avoid report bloat)
  const cookiesWithoutSecure: string[] = [];
  const cookiesWithoutHttpOnly: string[] = [];
  const cookiesWithoutSameSite: string[] = [];

  for (const cookie of result.cookies.slice(0, 20)) {
    const cookieName = cookie.split('=')[0]?.trim();
    if (!cookieName) continue;

    const lowerCookie = cookie.toLowerCase();

    if (!lowerCookie.includes('secure')) {
      cookiesWithoutSecure.push(cookieName);
    }
    if (!lowerCookie.includes('httponly')) {
      cookiesWithoutHttpOnly.push(cookieName);
    }
    if (!lowerCookie.includes('samesite')) {
      cookiesWithoutSameSite.push(cookieName);
    }
  }

  // Create consolidated issues for cookie problems
  if (cookiesWithoutSecure.length > 0) {
    issues.push({
      code: 'cookie_missing_secure',
      severity: 'P1',
      category: 'SECURITY',
      title: `${cookiesWithoutSecure.length} cookie(s) missing Secure flag`,
      whyItMatters:
        'Without the Secure flag, cookies can be transmitted over unencrypted HTTP connections, exposing them to interception.',
      howToFix: 'Add the Secure flag to the Set-Cookie header for these cookies.',
      evidence: { url: result.url, actual: cookiesWithoutSecure.slice(0, 5).join(', ') + (cookiesWithoutSecure.length > 5 ? ` (+${cookiesWithoutSecure.length - 5} more)` : '') },
      impact: 4,
      effort: 1,
    });
  }

  if (cookiesWithoutHttpOnly.length > 0) {
    issues.push({
      code: 'cookie_missing_httponly',
      severity: 'P2',
      category: 'SECURITY',
      title: `${cookiesWithoutHttpOnly.length} cookie(s) missing HttpOnly flag`,
      whyItMatters:
        'Without HttpOnly, cookies can be accessed by JavaScript, making them vulnerable to XSS-based cookie theft.',
      howToFix: 'Add the HttpOnly flag to prevent JavaScript access to these cookies.',
      evidence: { url: result.url, actual: cookiesWithoutHttpOnly.slice(0, 5).join(', ') + (cookiesWithoutHttpOnly.length > 5 ? ` (+${cookiesWithoutHttpOnly.length - 5} more)` : '') },
      impact: 3,
      effort: 1,
    });
  }

  if (cookiesWithoutSameSite.length > 0) {
    issues.push({
      code: 'cookie_missing_samesite',
      severity: 'P3',
      category: 'SECURITY',
      title: `${cookiesWithoutSameSite.length} cookie(s) missing SameSite attribute`,
      whyItMatters:
        'Without SameSite, cookies are sent with cross-origin requests, potentially enabling CSRF attacks.',
      howToFix:
        'Add SameSite=Strict (or SameSite=Lax for login cookies) to the Set-Cookie header.',
      evidence: { url: result.url, actual: cookiesWithoutSameSite.slice(0, 5).join(', ') + (cookiesWithoutSameSite.length > 5 ? ` (+${cookiesWithoutSameSite.length - 5} more)` : '') },
      impact: 2,
      effort: 1,
    });
  }

  // Check for mixed content
  const $ = cheerio.load(result.html);
  if (result.url.startsWith('https://')) {
    const insecureResources: string[] = [];

    $('img[src^="http://"], script[src^="http://"], link[href^="http://"], iframe[src^="http://"]').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('href');
      if (src) insecureResources.push(src);
    });

    if (insecureResources.length > 0) {
      issues.push({
        code: 'mixed_content',
        severity: 'P1',
        category: 'SECURITY',
        title: `Mixed content: ${insecureResources.length} insecure resource(s)`,
        whyItMatters:
          'Loading HTTP resources on an HTTPS page undermines the security of the encrypted connection and may cause browser warnings.',
        howToFix: 'Update all resource URLs to use HTTPS instead of HTTP.',
        evidence: {
          url: result.url,
          snippet: insecureResources.slice(0, 5).join(', '),
        },
        impact: 4,
        effort: 2,
      });
    }
  }

  // Check for links missing rel="noopener"
  const unsafeLinks: string[] = [];
  $('a[target="_blank"]').each((_, el) => {
    const rel = $(el).attr('rel') || '';
    if (!rel.includes('noopener') && !rel.includes('noreferrer')) {
      const href = $(el).attr('href') || 'unknown';
      unsafeLinks.push(href);
    }
  });

  if (unsafeLinks.length > 0) {
    issues.push({
      code: 'missing_noopener',
      severity: 'P3',
      category: 'SECURITY',
      title: `${unsafeLinks.length} link(s) with target="_blank" missing rel="noopener"`,
      whyItMatters:
        'Links with target="_blank" without rel="noopener" allow the opened page to access window.opener, potentially enabling phishing attacks.',
      howToFix:
        'Add rel="noopener noreferrer" to all links that use target="_blank".',
      evidence: {
        url: result.url,
        snippet: unsafeLinks.slice(0, 5).join(', '),
      },
      impact: 2,
      effort: 1,
    });
  }

  // Check for external scripts without Subresource Integrity (SRI)
  const scriptsWithoutSRI: string[] = [];
  let pageHostname: string;
  try {
    pageHostname = new URL(result.url).hostname;
  } catch {
    pageHostname = '';
  }

  $('script[src]').each((_, el) => {
    const src = $(el).attr('src');
    const integrity = $(el).attr('integrity');
    if (src && src.startsWith('http')) {
      try {
        const scriptHostname = new URL(src).hostname;
        // Only flag if it's a different hostname (CDN/external) and no integrity
        if (scriptHostname !== pageHostname && !integrity) {
          scriptsWithoutSRI.push(src);
        }
      } catch {
        // Invalid URL — skip
      }
    }
  });

  if (scriptsWithoutSRI.length > 0) {
    issues.push({
      code: 'external_script_missing_sri',
      severity: 'P3',
      category: 'SECURITY',
      title: `${scriptsWithoutSRI.length} external script(s) missing Subresource Integrity`,
      whyItMatters:
        'External scripts loaded from CDNs without integrity attributes can be tampered with if the CDN is compromised, potentially injecting malicious code into your site.',
      howToFix:
        'Add integrity="sha384-..." and crossorigin="anonymous" attributes to external scripts. Generate hashes using tools like srihash.org.',
      evidence: {
        url: result.url,
        snippet: scriptsWithoutSRI.slice(0, 5).join(', '),
      },
      impact: 3,
      effort: 2,
    });
  }

  return issues;
}

/**
 * Check if security.txt exists at the well-known location
 */
export async function checkSecurityTxt(baseUrl: string): Promise<SecurityIssue[]> {
  const issues: SecurityIssue[] = [];

  try {
    const origin = new URL(baseUrl).origin;
    const response = await fetch(`${origin}/.well-known/security.txt`, {
      headers: { 'User-Agent': 'SiteSheriffBot/1.0' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      issues.push({
        code: 'missing_security_txt',
        severity: 'P3',
        category: 'SECURITY',
        title: 'Missing security.txt file',
        whyItMatters:
          'security.txt (RFC 9116) helps security researchers report vulnerabilities to your organization. Without it, they may not know how to contact you.',
        howToFix:
          'Create a /.well-known/security.txt file with Contact, Expires, and optionally Encryption and Policy fields.',
        evidence: { url: `${origin}/.well-known/security.txt` },
        impact: 1,
        effort: 1,
      });
    }
  } catch {
    // Network error — skip silently
  }

  return issues;
}

/**
 * Check if the HTTP version of a site properly redirects to HTTPS.
 * Only meaningful when the base URL uses HTTPS.
 */
export async function checkHttpsRedirect(baseUrl: string): Promise<SecurityIssue[]> {
  const issues: SecurityIssue[] = [];

  if (!baseUrl.startsWith('https://')) return issues;

  try {
    const origin = new URL(baseUrl).origin;
    const httpUrl = origin.replace('https://', 'http://');

    const response = await fetch(httpUrl, {
      redirect: 'manual',
      headers: { 'User-Agent': 'SiteSheriffBot/1.0' },
      signal: AbortSignal.timeout(5000),
    });

    const status = response.status;
    const location = response.headers.get('location') ?? '';
    const isRedirect = [301, 302, 307, 308].includes(status);

    if (isRedirect && location.startsWith('https://')) {
      // Good — HTTP redirects to HTTPS
      return issues;
    }

    if (status === 200) {
      issues.push({
        code: 'no_https_redirect',
        severity: 'P1',
        category: 'SECURITY',
        title: 'HTTP does not redirect to HTTPS',
        whyItMatters:
          'Users accessing your site over HTTP are not automatically redirected to the secure HTTPS version, leaving them vulnerable to man-in-the-middle attacks.',
        howToFix:
          'Configure your server/hosting to redirect all HTTP requests to HTTPS with a 301 redirect.',
        evidence: {
          url: httpUrl,
          expected: '301 redirect to HTTPS',
          actual: 'HTTP 200 (serves content)',
        },
        impact: 5,
        effort: 1,
      });
    } else if (isRedirect && !location.startsWith('https://')) {
      issues.push({
        code: 'http_redirect_not_https',
        severity: 'P2',
        category: 'SECURITY',
        title: 'HTTP redirects but not to HTTPS',
        whyItMatters:
          'The HTTP version of your site redirects, but not to the secure HTTPS version. Users are still not getting a secure connection.',
        howToFix:
          'Update the redirect to point to the HTTPS version of the URL.',
        evidence: {
          url: httpUrl,
          expected: 'https redirect',
          actual: `Redirects to: ${location}`,
        },
        impact: 4,
        effort: 1,
      });
    }
  } catch {
    // Fetch failed entirely (HTTP port may not be open) — skip silently
  }

  return issues;
}

/**
 * Check if the SSL/TLS certificate is expiring soon.
 * Uses Node.js TLS to inspect the certificate directly.
 */
export async function checkCertificateExpiry(baseUrl: string): Promise<SecurityIssue[]> {
  const issues: SecurityIssue[] = [];

  if (!baseUrl.startsWith('https://')) return issues;

  try {
    const { hostname, port } = new URL(baseUrl);
    const tls = await import('tls');

    const certInfo = await new Promise<{ validTo: Date; daysRemaining: number } | null>((resolve) => {
      const socket = tls.connect(
        {
          host: hostname,
          port: port ? parseInt(port, 10) : 443,
          servername: hostname,
          rejectUnauthorized: false, // We want to check expiry even for self-signed
        },
        () => {
          const cert = socket.getPeerCertificate();
          socket.destroy();

          if (cert && cert.valid_to) {
            const validTo = new Date(cert.valid_to);
            const now = new Date();
            const daysRemaining = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            resolve({ validTo, daysRemaining });
          } else {
            resolve(null);
          }
        }
      );

      socket.on('error', () => {
        socket.destroy();
        resolve(null);
      });

      // Timeout after 5 seconds
      socket.setTimeout(5000, () => {
        socket.destroy();
        resolve(null);
      });
    });

    if (certInfo) {
      if (certInfo.daysRemaining < 0) {
        issues.push({
          code: 'certificate_expired',
          severity: 'P0',
          category: 'SECURITY',
          title: 'SSL certificate has expired',
          whyItMatters:
            'An expired SSL certificate will cause browsers to show security warnings, blocking users from accessing your site and destroying trust.',
          howToFix:
            'Renew your SSL certificate immediately. If using Let\'s Encrypt, run certbot renew. If using a paid certificate, contact your certificate authority.',
          evidence: {
            url: baseUrl,
            expected: 'Valid certificate',
            actual: `Expired ${Math.abs(certInfo.daysRemaining)} day(s) ago on ${certInfo.validTo.toISOString().split('T')[0]}`,
          },
          impact: 5,
          effort: 1,
        });
      } else if (certInfo.daysRemaining <= 7) {
        issues.push({
          code: 'certificate_expiring_critical',
          severity: 'P0',
          category: 'SECURITY',
          title: `SSL certificate expires in ${certInfo.daysRemaining} day(s)`,
          whyItMatters:
            'Your SSL certificate is about to expire. Once expired, browsers will show security warnings and users may not be able to access your site.',
          howToFix:
            'Renew your SSL certificate immediately. If using Let\'s Encrypt, set up automatic renewal with certbot. Check your hosting provider\'s SSL settings.',
          evidence: {
            url: baseUrl,
            expected: 'Certificate valid for >30 days',
            actual: `Expires on ${certInfo.validTo.toISOString().split('T')[0]} (${certInfo.daysRemaining} days remaining)`,
          },
          impact: 5,
          effort: 1,
        });
      } else if (certInfo.daysRemaining <= 30) {
        issues.push({
          code: 'certificate_expiring_soon',
          severity: 'P2',
          category: 'SECURITY',
          title: `SSL certificate expires in ${certInfo.daysRemaining} days`,
          whyItMatters:
            'Your SSL certificate will expire soon. Plan to renew it before expiration to avoid security warnings and service disruption.',
          howToFix:
            'Renew your SSL certificate. Consider setting up automatic renewal if not already configured. Most hosting providers and Let\'s Encrypt support auto-renewal.',
          evidence: {
            url: baseUrl,
            expected: 'Certificate valid for >30 days',
            actual: `Expires on ${certInfo.validTo.toISOString().split('T')[0]} (${certInfo.daysRemaining} days remaining)`,
          },
          impact: 4,
          effort: 1,
        });
      }
    }
  } catch {
    // TLS connection failed — skip silently (could be network issue, not a security problem we can report)
  }

  return issues;
}
