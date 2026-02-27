import type { CrawlResult } from '../crawler';
import type { SEOIssue } from './types';

/**
 * Extract hreflang tags from HTML content.
 * Returns array of { lang, href } for all valid hreflang alternate links.
 */
export function extractHreflangTags(html: string): Array<{ lang: string; href: string }> {
  const hreflangMatches = [...html.matchAll(/<link[^>]*\bhreflang\s*=\s*["']([^"']+)["'][^>]*>/gi)];
  const hreflangTags: Array<{ lang: string; href: string }> = [];
  for (const match of hreflangMatches) {
    const tag = match[0];
    if (!/\brel\s*=\s*["']alternate["']/i.test(tag)) continue;
    const lang = match[1];
    const hrefMatch = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag);
    const href = hrefMatch?.[1] ?? '';
    if (href) {
      hreflangTags.push({ lang, href });
    }
  }
  return hreflangTags;
}

/**
 * Normalize URL for hreflang comparison (remove trailing slash, lowercase).
 */
export function normalizeHreflangUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return (parsed.origin + parsed.pathname).replace(/\/+$/, '').toLowerCase();
  } catch {
    return url.replace(/\/+$/, '').toLowerCase();
  }
}

/**
 * Check hreflang validation for a single page.
 */
export function checkHreflang(result: CrawlResult): SEOIssue[] {
  const issues: SEOIssue[] = [];
  if (!result.html) return issues;

  const hreflangMatches = [...result.html.matchAll(/<link[^>]*\bhreflang\s*=\s*["']([^"']+)["'][^>]*>/gi)];
  const hreflangTags: Array<{ lang: string; href: string }> = [];
  for (const match of hreflangMatches) {
    const tag = match[0];
    if (!/\brel\s*=\s*["']alternate["']/i.test(tag)) continue;
    const lang = match[1];
    const hrefMatch = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag);
    const href = hrefMatch?.[1] ?? '';
    hreflangTags.push({ lang, href });
  }

  if (hreflangTags.length > 0) {
    // Self-referencing check
    const normalizedPageUrl = result.url.replace(/\/$/, '').toLowerCase();
    const hasSelfReference = hreflangTags.some(t => {
      try { return t.href.replace(/\/$/, '').toLowerCase() === normalizedPageUrl; }
      catch { return false; }
    });
    if (!hasSelfReference) {
      issues.push({
        code: 'hreflang_missing_self_reference',
        severity: 'P2',
        category: 'SEO',
        title: 'Hreflang missing self-referencing tag',
        whyItMatters: 'Each page with hreflang tags should include a self-referencing entry. Without it, search engines may not correctly associate the page with its language/region.',
        howToFix: 'Add a <link rel="alternate" hreflang="..." href="..."> tag that points to the current page URL.',
        evidence: { url: result.url, snippet: `Found ${hreflangTags.length} hreflang tag(s) but none point to this page` },
        impact: 3,
        effort: 1,
      });
    }

    // Invalid language code check
    const validLangRegex = /^[a-z]{2}(-[A-Z]{2})?$|^x-default$/;
    for (const tag of hreflangTags) {
      if (!validLangRegex.test(tag.lang)) {
        issues.push({
          code: 'hreflang_invalid_language',
          severity: 'P2',
          category: 'SEO',
          title: 'Invalid hreflang language code',
          whyItMatters: 'Invalid language codes in hreflang tags are ignored by search engines, defeating the purpose of international targeting.',
          howToFix: 'Use valid ISO 639-1 language codes (e.g., "en", "fr") optionally followed by ISO 3166-1 region codes (e.g., "en-US", "fr-CA"), or "x-default".',
          evidence: { url: result.url, actual: tag.lang, expected: 'Valid language code like "en", "en-US", or "x-default"' },
          impact: 3,
          effort: 1,
        });
      }
    }
  }

  return issues;
}

/**
 * Validate hreflang bidirectional links across all crawled pages.
 * For each page with hreflang tags pointing to other language versions,
 * verify that those target pages link back.
 */
export function validateHreflangBidirectional(results: CrawlResult[]): SEOIssue[] {
  const issues: SEOIssue[] = [];

  // Build a map of normalized URL -> page data (URL, hreflang tags)
  const pageHreflangMap = new Map<string, { url: string; hreflangTags: Array<{ lang: string; href: string }> }>();

  for (const result of results) {
    if (result.error || !result.html) continue;

    const hreflangTags = extractHreflangTags(result.html);
    if (hreflangTags.length === 0) continue;

    const normalizedUrl = normalizeHreflangUrl(result.url);
    pageHreflangMap.set(normalizedUrl, {
      url: result.url,
      hreflangTags,
    });
  }

  // For each page with hreflang tags, check bidirectional linking
  for (const [normalizedPageUrl, pageData] of pageHreflangMap) {
    const { url: pageUrl, hreflangTags } = pageData;

    // Check for self-referencing hreflang (page should include hreflang pointing to itself)
    const hasSelfReference = hreflangTags.some(tag => {
      const normalizedHref = normalizeHreflangUrl(tag.href);
      return normalizedHref === normalizedPageUrl;
    });

    if (!hasSelfReference) {
      issues.push({
        code: 'hreflang_missing_self',
        severity: 'P2',
        category: 'SEO',
        title: 'Page missing self-referencing hreflang',
        whyItMatters: 'Each page with hreflang tags should include a self-referencing entry pointing to itself. Without this, search engines may not correctly identify the page\'s language/region.',
        howToFix: 'Add a <link rel="alternate" hreflang="xx" href="..."> tag where href points to this page\'s own URL.',
        evidence: {
          url: pageUrl,
          snippet: `Found ${hreflangTags.length} hreflang tag(s) but none reference this page`,
        },
        impact: 3,
        effort: 1,
      });
    }

    // Check each hreflang link for bidirectional reference
    for (const tag of hreflangTags) {
      const normalizedTargetUrl = normalizeHreflangUrl(tag.href);

      // Skip self-references
      if (normalizedTargetUrl === normalizedPageUrl) continue;

      // Check if the target page was crawled and has hreflang tags
      const targetPageData = pageHreflangMap.get(normalizedTargetUrl);

      if (!targetPageData) {
        // Target page wasn't crawled or doesn't have hreflang tags
        // This could be because the page is external or wasn't reached
        // We'll only flag this if the target is in the same domain
        try {
          const pageHostname = new URL(pageUrl).hostname;
          const targetHostname = new URL(tag.href).hostname;

          if (pageHostname === targetHostname) {
            // Same domain but target page not found with hreflang
            issues.push({
              code: 'hreflang_not_bidirectional',
              severity: 'P2',
              category: 'SEO',
              title: 'Hreflang link is not bidirectional',
              whyItMatters: 'Hreflang annotations must be reciprocal. If page A links to page B with hreflang, page B must link back to page A. Non-reciprocal hreflang may be ignored by search engines.',
              howToFix: `Add a hreflang tag on the target page (${tag.href}) pointing back to this page (${pageUrl}).`,
              evidence: {
                url: pageUrl,
                actual: `hreflang="${tag.lang}" points to ${tag.href}`,
                snippet: 'Target page does not have hreflang tags or was not crawled',
              },
              impact: 3,
              effort: 2,
            });
          }
        } catch {
          // Invalid URL, skip
        }
        continue;
      }

      // Target page was crawled - check if it links back to this page
      const targetLinksBack = targetPageData.hreflangTags.some(targetTag => {
        const normalizedBackRef = normalizeHreflangUrl(targetTag.href);
        return normalizedBackRef === normalizedPageUrl;
      });

      if (!targetLinksBack) {
        issues.push({
          code: 'hreflang_not_bidirectional',
          severity: 'P2',
          category: 'SEO',
          title: 'Hreflang link is not bidirectional',
          whyItMatters: 'Hreflang annotations must be reciprocal. If page A links to page B with hreflang, page B must link back to page A. Non-reciprocal hreflang may be ignored by search engines.',
          howToFix: `Add a hreflang tag on the target page (${tag.href}) pointing back to this page (${pageUrl}).`,
          evidence: {
            url: pageUrl,
            actual: `hreflang="${tag.lang}" points to ${tag.href}`,
            snippet: 'Target page has hreflang tags but none point back to this page',
          },
          impact: 3,
          effort: 2,
        });
      }
    }
  }

  return issues;
}
