import type { CrawlResult } from '../crawler';
import type { SEOIssue } from './types';

/**
 * Check for structured data (JSON-LD) in the page HTML.
 */
export function checkStructuredData(result: CrawlResult): SEOIssue[] {
  const issues: SEOIssue[] = [];
  if (!result.html) return issues;

  // Find all JSON-LD script blocks
  const jsonLdPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const matches = [...result.html.matchAll(jsonLdPattern)];
  const isHomepage = (() => { try { return ['/', ''].includes(new URL(result.url).pathname); } catch { return false; } })();

  if (matches.length === 0 && isHomepage) {
    issues.push({
      code: 'missing_structured_data',
      severity: 'P3',
      category: 'SEO',
      title: 'No structured data (JSON-LD) found',
      whyItMatters: 'Structured data helps search engines understand your content and can enable rich results (stars, FAQs, breadcrumbs) in search listings.',
      howToFix: 'Add JSON-LD structured data to describe your page content. Start with Organization, WebSite, or Article schema as appropriate.',
      evidence: { url: result.url },
      impact: 3,
      effort: 2,
    });
  } else {
    for (const match of matches) {
      const content = match[1];
      try {
        JSON.parse(content);
      } catch {
        issues.push({
          code: 'invalid_json_ld',
          severity: 'P2',
          category: 'SEO',
          title: 'Invalid JSON-LD structured data',
          whyItMatters: 'Malformed JSON-LD will be ignored by search engines, meaning you lose the benefits of structured data entirely.',
          howToFix: 'Validate your JSON-LD using Google\'s Rich Results Test or Schema.org validator and fix any syntax errors.',
          evidence: { url: result.url, snippet: content.slice(0, 200) },
          impact: 4,
          effort: 1,
        });
      }
    }
  }

  return issues;
}
