import type { CrawlResult } from '../crawler';
import type { SEOIssue } from './types';

/**
 * Check canonical URL issues for a single page.
 */
export function checkCanonical(result: CrawlResult): SEOIssue[] {
  const issues: SEOIssue[] = [];

  if (!result.canonical) {
    issues.push({
      code: 'missing_canonical',
      severity: 'P2',
      category: 'SEO',
      title: 'Missing canonical URL',
      whyItMatters: 'Canonical tags prevent duplicate content issues by telling search engines which URL is the "official" version.',
      howToFix: 'Add <link rel="canonical" href="..."> pointing to the preferred URL for this page.',
      evidence: { url: result.url },
      impact: 3,
      effort: 1,
    });
  } else if (!result.canonical.startsWith('http')) {
    issues.push({
      code: 'relative_canonical',
      severity: 'P2',
      category: 'SEO',
      title: 'Canonical URL is relative',
      whyItMatters: 'Relative canonical URLs can be misinterpreted by search engines, potentially causing indexing issues.',
      howToFix: 'Use an absolute URL for the canonical tag. Change to the full URL including protocol and domain.',
      evidence: { url: result.url, actual: result.canonical },
      impact: 3,
      effort: 1,
    });
  } else {
    try {
      const canonicalDomain = new URL(result.canonical).hostname;
      const pageDomain = new URL(result.url).hostname;
      // Exempt www. <-> non-www. difference (intentional canonical preference, not a misconfiguration)
      const normalizeWww = (h: string) => h.replace(/^www\./, '');
      if (canonicalDomain !== pageDomain && normalizeWww(canonicalDomain) !== normalizeWww(pageDomain)) {
        issues.push({
          code: 'cross_domain_canonical',
          severity: 'P1',
          category: 'SEO',
          title: 'Canonical URL points to a different domain',
          whyItMatters: 'A canonical tag pointing to a different domain tells search engines to index that domain\'s version instead. This is usually a misconfiguration.',
          howToFix: 'Update the canonical tag to point to the correct domain, or remove it if cross-domain canonicalization is not intended.',
          evidence: { url: result.url, actual: result.canonical, expected: pageDomain },
          impact: 5,
          effort: 1,
        });
      }
    } catch {
      // Invalid URL format — skip cross-domain check
    }
  }

  return issues;
}

/**
 * Validate that canonical URLs actually resolve and point to the correct domain.
 * This is a cross-page check that deduplicates canonical URLs before checking.
 */
export async function validateCanonicals(results: CrawlResult[]): Promise<SEOIssue[]> {
  const issues: SEOIssue[] = [];

  // Collect unique canonical URLs and track which pages reference them
  const canonicalToPages = new Map<string, string[]>();
  for (const result of results) {
    if (result.error) continue;
    if (result.canonical?.startsWith('http')) {
      if (!canonicalToPages.has(result.canonical)) canonicalToPages.set(result.canonical, []);
      canonicalToPages.get(result.canonical)!.push(result.url);
    }
  }

  for (const [canonicalUrl, pages] of canonicalToPages) {
    const pageUrl = pages[0];

    // Cross-domain canonical is already checked per-page in checkCanonical().
    // Only validate URL resolution here to avoid duplicate issues.

    // Verify canonical URL resolves
    try {
      let response: Response | null = null;
      let errorMessage: string | null = null;

      for (const method of ['HEAD', 'GET'] as const) {
        try {
          response = await fetch(canonicalUrl, {
            method,
            signal: AbortSignal.timeout(5000),
            headers: { 'User-Agent': 'SiteSheriffBot/1.0' },
            redirect: 'follow',
          });
          break;
        } catch (err) {
          errorMessage = err instanceof Error ? err.message : String(err);
          if (method === 'HEAD') continue;
        }
      }

      if (!response) {
        issues.push({
          code: 'canonical_url_broken',
          severity: 'P1',
          category: 'SEO',
          title: 'Canonical URL returns error',
          whyItMatters:
            'A broken canonical URL tells search engines to index a page that doesn\'t exist, wasting crawl budget and confusing indexing.',
          howToFix:
            'Fix the canonical URL to point to a valid, accessible page, or remove it to let search engines determine the canonical.',
          evidence: { url: pageUrl, actual: canonicalUrl, expected: 'HTTP 200', snippet: errorMessage ?? 'Connection error' },
          impact: 5,
          effort: 1,
        });
      } else if (response.status >= 400) {
        issues.push({
          code: 'canonical_url_broken',
          severity: 'P1',
          category: 'SEO',
          title: `Canonical URL returns ${response.status}`,
          whyItMatters:
            'A broken canonical URL tells search engines to index a page that doesn\'t exist, wasting crawl budget and confusing indexing.',
          howToFix:
            'Fix the canonical URL to point to a valid, accessible page, or remove it to let search engines determine the canonical.',
          evidence: { url: pageUrl, actual: canonicalUrl, expected: 'HTTP 200', snippet: `HTTP ${response.status}` },
          impact: 5,
          effort: 1,
        });
      }
    } catch {
      // Network error — skip silently
    }
  }

  return issues;
}
