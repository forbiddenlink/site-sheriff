import * as cheerio from 'cheerio';
import type { CrawlResult } from './crawler';

export interface EEATIssue {
  code: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  category: 'SEO' | 'CONTENT';
  title: string;
  whyItMatters: string;
  howToFix: string;
  evidence: {
    url: string;
    [key: string]: unknown;
  };
  impact: number;
  effort: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// E-E-A-T Signal Detection (Experience, Expertise, Authoritativeness, Trust)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check for author attribution on article pages
 */
function checkAuthorInfo(url: string, html: string, $: cheerio.CheerioAPI): EEATIssue[] {
  // Detect if this is an article/blog page
  const isArticle =
    $('article').length > 0 ||
    $('[itemtype*="Article"]').length > 0 ||
    $('meta[property="og:type"][content="article"]').length > 0 ||
    /\/blog\/|\/article\/|\/post\//i.test(url);

  if (!isArticle) return [];

  const issues: EEATIssue[] = [];

  // Check for author info
  const hasAuthorSchema = /author["']?\s*:\s*{[^}]*["']?@type["']?\s*:\s*["']?Person/i.test(html);
  const hasAuthorMeta = $('meta[name="author"]').length > 0;
  const hasAuthorRel = $('[rel="author"]').length > 0;
  const hasAuthorClass = $('.author, .byline, [class*="author"], [data-author]').length > 0;
  const hasAuthorItemProp = $('[itemprop="author"]').length > 0;

  if (!hasAuthorSchema && !hasAuthorMeta && !hasAuthorRel && !hasAuthorClass && !hasAuthorItemProp) {
    issues.push({
      code: 'missing_author_info',
      severity: 'P2',
      category: 'SEO',
      title: 'Article lacks author attribution',
      whyItMatters:
        'Google\'s E-E-A-T guidelines emphasize author expertise. Articles without visible authorship may be perceived as less trustworthy.',
      howToFix:
        'Add author name with rel="author" link, or include Person schema with author credentials.',
      evidence: { url, isArticle: true },
      impact: 4,
      effort: 2,
    });
  } else if (hasAuthorClass && !hasAuthorSchema) {
    issues.push({
      code: 'missing_author_schema',
      severity: 'P3',
      category: 'SEO',
      title: 'Author info found but missing structured data',
      whyItMatters:
        'Adding Person schema helps search engines understand author expertise and can enable rich results.',
      howToFix:
        'Add Person structured data with author name, credentials, and optionally sameAs links to social profiles.',
      evidence: { url },
      impact: 3,
      effort: 2,
    });
  }

  return issues;
}

/**
 * Check for publication date on article pages
 */
function checkPublicationDate(url: string, $: cheerio.CheerioAPI): EEATIssue[] {
  const isArticle =
    $('article').length > 0 ||
    $('[itemtype*="Article"]').length > 0 ||
    $('meta[property="og:type"][content="article"]').length > 0;

  if (!isArticle) return [];

  const hasDatePublished = $('[itemprop="datePublished"], time[datetime], .published, .post-date').length > 0;
  const hasDateMeta = $('meta[property="article:published_time"]').length > 0;

  if (!hasDatePublished && !hasDateMeta) {
    return [{
      code: 'no_publication_date',
      severity: 'P2',
      category: 'SEO',
      title: 'Article without publish date',
      whyItMatters:
        'Publication dates help users assess content freshness. Search engines may prefer dated content for time-sensitive queries.',
      howToFix:
        'Add a visible publication date with <time datetime="YYYY-MM-DD"> and article:published_time meta tag.',
      evidence: { url },
      impact: 3,
      effort: 1,
    }];
  }

  return [];
}

/**
 * Check for trust signals (privacy policy, contact info, about page links)
 */
function checkTrustSignals(url: string, $: cheerio.CheerioAPI): EEATIssue[] {
  const issues: EEATIssue[] = [];

  // Check for privacy policy link
  const hasPrivacyLink = $('a[href*="privacy"]').length > 0;
  if (!hasPrivacyLink) {
    issues.push({
      code: 'missing_privacy_policy',
      severity: 'P3',
      category: 'SEO',
      title: 'No privacy policy link detected',
      whyItMatters:
        'Privacy policies are a trust signal, especially for sites collecting user data. Required by GDPR/CCPA.',
      howToFix:
        'Add a privacy policy page and link to it from the footer on all pages.',
      evidence: { url },
      impact: 3,
      effort: 2,
    });
  }

  // Check for contact info
  const hasContactLink = $('a[href*="contact"], a[href*="mailto:"], a[href^="tel:"]').length > 0;
  const hasContactClass = $('.contact, [class*="contact"]').length > 0;
  if (!hasContactLink && !hasContactClass) {
    issues.push({
      code: 'missing_contact_info',
      severity: 'P3',
      category: 'SEO',
      title: 'No contact information detected',
      whyItMatters:
        'Contact information is a key trust signal. Users and search engines expect ways to reach the site owner.',
      howToFix:
        'Add a contact page or footer contact info (email, phone, or contact form link).',
      evidence: { url },
      impact: 3,
      effort: 1,
    });
  }

  return issues;
}

/**
 * Check for Organization schema
 */
function checkOrganizationSchema(url: string, html: string): EEATIssue[] {
  // Only check on homepage
  try {
    if (new URL(url).pathname !== '/') return [];
  } catch {
    return [];
  }

  const hasOrgSchema = /["']?@type["']?\s*:\s*["']?Organization["']?/i.test(html) ||
    /["']?@type["']?\s*:\s*["']?LocalBusiness["']?/i.test(html);

  if (!hasOrgSchema) {
    return [{
      code: 'missing_organization_schema',
      severity: 'P3',
      category: 'SEO',
      title: 'No Organization schema on homepage',
      whyItMatters:
        'Organization schema helps Google understand your brand, logo, social profiles, and contact info for Knowledge Panel eligibility.',
      howToFix:
        'Add Organization or LocalBusiness schema with name, logo, url, and sameAs social links.',
      evidence: { url },
      impact: 3,
      effort: 2,
    }];
  }

  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM Complexity Checks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check DOM size and depth
 */
function checkDOMComplexity(url: string, $: cheerio.CheerioAPI): EEATIssue[] {
  const issues: EEATIssue[] = [];

  // Count DOM nodes
  const nodeCount = $('*').length;
  if (nodeCount > 3000) {
    issues.push({
      code: 'very_large_dom',
      severity: 'P1',
      category: 'CONTENT',
      title: `DOM tree has ${nodeCount.toLocaleString()} nodes`,
      whyItMatters:
        'DOM trees over 3000 nodes significantly increase memory usage, slow down style calculations, and hurt Core Web Vitals.',
      howToFix:
        'Reduce DOM size by virtualizing long lists, lazy-loading off-screen content, removing unnecessary wrapper elements, and using CSS instead of DOM for visual effects.',
      evidence: { url, nodeCount },
      impact: 5,
      effort: 4,
    });
  } else if (nodeCount > 1500) {
    issues.push({
      code: 'large_dom',
      severity: 'P2',
      category: 'CONTENT',
      title: `DOM tree has ${nodeCount.toLocaleString()} nodes`,
      whyItMatters:
        'Large DOM trees (over 1500 nodes) can slow down page rendering and increase memory usage on mobile devices.',
      howToFix:
        'Consider reducing DOM complexity by removing unnecessary wrapper elements and using CSS Grid/Flexbox instead of nested divs.',
      evidence: { url, nodeCount },
      impact: 4,
      effort: 3,
    });
  }

  // Check DOM depth (simplified - count nesting via traversal)
  let maxDepth = 0;

  // Use a simple iterative approach to measure depth
  function measureDepth(element: ReturnType<typeof $>, depth: number): void {
    if (depth > maxDepth) {
      maxDepth = depth;
    }
    if (depth < 50) { // Safety limit to prevent infinite recursion
      element.children().each(function() {
        measureDepth($(this), depth + 1);
      });
    }
  }

  const body = $('body').first();
  if (body.length > 0) {
    measureDepth(body, 0);
  }

  if (maxDepth > 32) {
    issues.push({
      code: 'excessive_dom_depth',
      severity: 'P2',
      category: 'CONTENT',
      title: `DOM tree is ${maxDepth} levels deep`,
      whyItMatters:
        'Deeply nested DOM trees (over 32 levels) cause layout thrashing and slow down CSS selector matching.',
      howToFix:
        'Flatten the DOM structure by removing unnecessary wrapper elements and simplifying component nesting.',
      evidence: { url, maxDepth },
      impact: 3,
      effort: 3,
    });
  }

  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// CDN Detection
// ─────────────────────────────────────────────────────────────────────────────

const CDN_INDICATORS: Record<string, string[]> = {
  'Cloudflare': ['cf-ray', 'cf-cache-status', 'cf-request-id'],
  'Vercel': ['x-vercel-id', 'x-vercel-cache'],
  'Netlify': ['x-nf-request-id'],
  'CloudFront': ['x-amz-cf-id', 'x-amz-cf-pop'],
  'Fastly': ['x-served-by', 'x-cache', 'fastly-restarts'],
  'Akamai': ['x-akamai-transformed', 'akamai-origin-hop'],
  'Bunny CDN': ['cdn-pullzone', 'cdn-uid'],
  'KeyCDN': ['x-cache', 'x-edge-location'],
};

export function detectCDN(responseHeaders: Record<string, string>): string | null {
  const lowerHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(responseHeaders)) {
    lowerHeaders[key.toLowerCase()] = value;
  }

  for (const [cdn, headers] of Object.entries(CDN_INDICATORS)) {
    for (const header of headers) {
      if (lowerHeaders[header]) {
        return cdn;
      }
    }
  }

  // Check server header for known CDN signatures
  const server = lowerHeaders['server'] || '';
  if (server.toLowerCase().includes('cloudflare')) return 'Cloudflare';
  if (server.toLowerCase().includes('netlify')) return 'Netlify';
  if (server.toLowerCase().includes('vercel')) return 'Vercel';

  return null;
}

/**
 * Check for CDN usage and HTTP/2 protocol
 */
export function checkInfrastructure(result: CrawlResult): EEATIssue[] {
  const issues: EEATIssue[] = [];

  // CDN detection
  const cdn = detectCDN(result.responseHeaders);
  const isHomepage = new URL(result.url).pathname === '/';

  if (!cdn && isHomepage) {
    issues.push({
      code: 'no_cdn_detected',
      severity: 'P3',
      category: 'CONTENT',
      title: 'No CDN detected',
      whyItMatters:
        'CDNs improve global load times, reduce server load, and often provide DDoS protection. Sites without CDNs may have slower performance for distant users.',
      howToFix:
        'Consider using a CDN like Cloudflare, Vercel, Netlify, or CloudFront for improved global performance.',
      evidence: { url: result.url },
      impact: 3,
      effort: 3,
    });
  }

  // HTTP/2 check
  const httpVersion = result.httpVersion;
  if (httpVersion && !httpVersion.includes('2') && !httpVersion.includes('3')) {
    issues.push({
      code: 'no_http2',
      severity: 'P3',
      category: 'CONTENT',
      title: `Using ${httpVersion || 'HTTP/1.1'} instead of HTTP/2`,
      whyItMatters:
        'HTTP/2 enables multiplexing, header compression, and server push, significantly improving load performance.',
      howToFix:
        'Upgrade your server or CDN configuration to support HTTP/2 or HTTP/3.',
      evidence: { url: result.url, httpVersion: httpVersion || 'HTTP/1.1' },
      impact: 3,
      effort: 2,
    });
  }

  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema Detection and Suggestions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect content type and suggest appropriate schema
 */
function checkSchemaSuggestions(url: string, html: string, $: cheerio.CheerioAPI): EEATIssue[] {
  const issues: EEATIssue[] = [];

  // Check for FAQ content without FAQ schema
  const hasFAQContent = $('details, .faq, [class*="faq"], .accordion, [class*="question"]').length > 2 ||
    (html.match(/\?\s*<\/h[2-4]>/gi) || []).length > 2;
  const hasFAQSchema = /FAQPage/i.test(html);

  if (hasFAQContent && !hasFAQSchema) {
    issues.push({
      code: 'missing_faq_schema',
      severity: 'P2',
      category: 'SEO',
      title: 'FAQ content detected without FAQPage schema',
      whyItMatters:
        'FAQ schema can enable rich results in Google Search, increasing click-through rates and visibility.',
      howToFix:
        'Add FAQPage structured data with Question and Answer items for each FAQ on the page.',
      evidence: { url, contentType: 'FAQ' },
      impact: 4,
      effort: 2,
    });
  }

  // Check for how-to content without HowTo schema
  const hasHowToContent =
    /how[\s-]?to/i.test($('h1, h2').text()) ||
    $('[class*="step"], [class*="instruction"], ol.steps').length > 0;
  const hasHowToSchema = /HowTo/i.test(html);

  if (hasHowToContent && !hasHowToSchema) {
    issues.push({
      code: 'missing_howto_schema',
      severity: 'P3',
      category: 'SEO',
      title: 'How-to content detected without HowTo schema',
      whyItMatters:
        'HowTo schema can enable step-by-step rich results in Google Search, improving visibility for instructional content.',
      howToFix:
        'Add HowTo structured data with step-by-step instructions.',
      evidence: { url, contentType: 'HowTo' },
      impact: 3,
      effort: 2,
    });
  }

  // Check for review content without Review schema
  const hasReviewContent = $('[class*="review"], [class*="rating"], .stars').length > 0;
  const hasReviewSchema = /Review|AggregateRating/i.test(html);

  if (hasReviewContent && !hasReviewSchema && !/$\/(product|shop)\//i.test(url)) {
    issues.push({
      code: 'missing_review_schema',
      severity: 'P3',
      category: 'SEO',
      title: 'Review content detected without Review schema',
      whyItMatters:
        'Review schema can enable star ratings in search results, increasing click-through rates.',
      howToFix:
        'Add Review or AggregateRating schema with rating values.',
      evidence: { url, contentType: 'Review' },
      impact: 3,
      effort: 2,
    });
  }

  // Check for breadcrumbs without BreadcrumbList schema
  const hasBreadcrumbs = $('nav.breadcrumb, .breadcrumbs, [class*="breadcrumb"], [aria-label="breadcrumb"]').length > 0;
  const hasBreadcrumbSchema = /BreadcrumbList/i.test(html);

  if (hasBreadcrumbs && !hasBreadcrumbSchema) {
    issues.push({
      code: 'missing_breadcrumb_schema',
      severity: 'P3',
      category: 'SEO',
      title: 'Breadcrumb navigation without BreadcrumbList schema',
      whyItMatters:
        'BreadcrumbList schema enables breadcrumb display in search results, improving site understanding and click-through.',
      howToFix:
        'Add BreadcrumbList structured data with ListItem entries for each breadcrumb link.',
      evidence: { url },
      impact: 2,
      effort: 2,
    });
  }

  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main E-E-A-T Checker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check for E-E-A-T signals and advanced SEO improvements
 */
export function checkEEAT(result: CrawlResult): EEATIssue[] {
  const $ = cheerio.load(result.html);

  return [
    ...checkAuthorInfo(result.url, result.html, $),
    ...checkPublicationDate(result.url, $),
    ...checkTrustSignals(result.url, $),
    ...checkOrganizationSchema(result.url, result.html),
    ...checkDOMComplexity(result.url, $),
    ...checkInfrastructure(result),
    ...checkSchemaSuggestions(result.url, result.html, $),
  ];
}
