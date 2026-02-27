import type { CrawlResult } from '../crawler';
import type { SEOIssue } from './types';

/**
 * Check pagination rel=prev/next links.
 */
export function checkPagination(result: CrawlResult): SEOIssue[] {
  const issues: SEOIssue[] = [];
  if (!result.html) return issues;

  const prevMatch = result.html.match(/<link[^>]*\brel\s*=\s*["']prev["'][^>]*>/i);
  const nextMatch = result.html.match(/<link[^>]*\brel\s*=\s*["']next["'][^>]*>/i);

  // Extract href from prev/next links
  const prevHrefMatch = prevMatch ? prevMatch[0].match(/\bhref\s*=\s*["']([^"']+)["']/i) : null;
  const nextHrefMatch = nextMatch ? nextMatch[0].match(/\bhref\s*=\s*["']([^"']+)["']/i) : null;

  const prevHref = prevHrefMatch?.[1];
  const nextHref = nextHrefMatch?.[1];

  // Detect pagination pattern in URL (e.g., ?page=2, /page/2, /p/2, etc.)
  const paginationPatterns = [
    /[?&]page=\d+/i,
    /\/page\/\d+/i,
    /\/p\/\d+/i,
    /[?&]p=\d+/i,
    /[?&]offset=\d+/i,
    /\/\d+\/?$/,
  ];
  const urlLooksPaginated = paginationPatterns.some(p => p.test(result.url));

  // If page looks paginated but has no prev/next links
  if (urlLooksPaginated && !prevMatch && !nextMatch) {
    issues.push({
      code: 'pagination_missing_rel_links',
      severity: 'P2',
      category: 'SEO',
      title: 'Paginated page missing rel=prev/next links',
      whyItMatters: 'Search engines use rel=prev and rel=next to understand pagination sequences. Without them, search engines may not discover all paginated content or may treat each page as standalone.',
      howToFix: 'Add <link rel="prev" href="..."> and <link rel="next" href="..."> tags to paginated pages pointing to adjacent pages in the sequence.',
      evidence: { url: result.url, snippet: 'URL appears paginated but no rel=prev/next found' },
      impact: 3,
      effort: 1,
    });
  }

  // Validate prev/next href values if present
  if (prevHref && !prevHref.startsWith('http') && !prevHref.startsWith('/')) {
    issues.push({
      code: 'pagination_prev_relative',
      severity: 'P3',
      category: 'SEO',
      title: 'rel=prev uses non-standard URL format',
      whyItMatters: 'Relative URLs in rel=prev may not be resolved correctly by all search engines.',
      howToFix: 'Use absolute URLs for rel=prev (starting with https:// or /).',
      evidence: { url: result.url, actual: prevHref },
      impact: 2,
      effort: 1,
    });
  }

  if (nextHref && !nextHref.startsWith('http') && !nextHref.startsWith('/')) {
    issues.push({
      code: 'pagination_next_relative',
      severity: 'P3',
      category: 'SEO',
      title: 'rel=next uses non-standard URL format',
      whyItMatters: 'Relative URLs in rel=next may not be resolved correctly by all search engines.',
      howToFix: 'Use absolute URLs for rel=next (starting with https:// or /).',
      evidence: { url: result.url, actual: nextHref },
      impact: 2,
      effort: 1,
    });
  }

  return issues;
}
