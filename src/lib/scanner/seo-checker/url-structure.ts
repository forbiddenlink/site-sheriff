import type { CrawlResult } from '../crawler';
import type { SEOIssue } from './types';

/**
 * Check URL structure issues (uppercase, length, underscores).
 */
export function checkUrlStructure(result: CrawlResult): SEOIssue[] {
  const issues: SEOIssue[] = [];

  try {
    const urlPath = new URL(result.url).pathname + new URL(result.url).search;

    // Check for uppercase characters in URL
    // Exempt BCP 47 locale code segments (e.g. en-US, zh-CN, hi-IN, es-419)
    const urlSegments = urlPath.split('/');
    const hasUppercaseOutsideLocale = urlSegments.some(seg => {
      if (/^[a-z]{2,3}[-_][A-Z]{2,4}$/.test(seg)) return false; // locale code — skip
      return /[A-Z]/.test(seg);
    });
    if (hasUppercaseOutsideLocale) {
      issues.push({
        code: 'url_uppercase',
        severity: 'P3',
        category: 'SEO',
        title: 'URL contains uppercase characters',
        whyItMatters: 'URLs are case-sensitive on most servers. Uppercase URLs can cause duplicate content issues if the same page is accessible via different cases, and they look less clean.',
        howToFix: 'Use lowercase URLs consistently. Set up 301 redirects from uppercase variants to lowercase versions.',
        evidence: { url: result.url, actual: urlPath },
        impact: 1,
        effort: 2,
      });
    }

    // Check for URL length (path + query string)
    if (urlPath.length > 115) {
      issues.push({
        code: 'url_too_long',
        severity: 'P3',
        category: 'SEO',
        title: 'URL is too long',
        whyItMatters: 'Long URLs are harder to share, may get truncated in some contexts, and can indicate poor URL structure. Search engines may also give less weight to keywords far into the URL.',
        howToFix: 'Shorten the URL by removing unnecessary words, using shorter slugs, or restructuring your URL hierarchy.',
        evidence: { url: result.url, actual: `${urlPath.length} characters`, expected: 'Under 115 characters' },
        impact: 1,
        effort: 2,
      });
    }

    // Check for underscores instead of hyphens
    if (urlPath.includes('_')) {
      issues.push({
        code: 'url_underscores',
        severity: 'P3',
        category: 'SEO',
        title: 'URL uses underscores instead of hyphens',
        whyItMatters: 'Google treats hyphens as word separators but not underscores. Using underscores means search engines see "my_page" as one word rather than "my page".',
        howToFix: 'Replace underscores with hyphens in URLs. Set up 301 redirects from old underscore URLs to new hyphenated versions.',
        evidence: { url: result.url, actual: urlPath },
        impact: 1,
        effort: 2,
      });
    }
  } catch {
    // Invalid URL - skip URL structure checks
  }

  return issues;
}
