import type { CrawlResult } from '../crawler';
import type { SEOIssue } from './types';

/**
 * Detect duplicate titles and descriptions across all crawled pages.
 */
export function checkDuplicates(results: CrawlResult[]): SEOIssue[] {
  const issues: SEOIssue[] = [];
  const successfulResults = results.filter(r => !r.error && r.statusCode >= 200 && r.statusCode < 400);

  // Check duplicate titles
  const titleMap = new Map<string, string[]>();
  for (const r of successfulResults) {
    if (r.title) {
      const key = r.title.toLowerCase().trim();
      if (!titleMap.has(key)) titleMap.set(key, []);
      titleMap.get(key)!.push(r.url);
    }
  }

  for (const [title, urls] of titleMap) {
    if (urls.length > 1) {
      issues.push({
        code: 'duplicate_title',
        severity: 'P2',
        category: 'SEO',
        title: `Duplicate title across ${urls.length} pages`,
        whyItMatters: 'Duplicate titles make it hard for search engines to differentiate pages, reducing the chance each page ranks for unique keywords.',
        howToFix: 'Give each page a unique, descriptive title that reflects its specific content.',
        evidence: {
          url: urls[0],
          actual: title,
          snippet: urls.join(', '),
        },
        impact: 3,
        effort: 2,
      });
    }
  }

  // Check duplicate descriptions
  const descMap = new Map<string, string[]>();
  for (const r of successfulResults) {
    if (r.metaDescription) {
      const key = r.metaDescription.toLowerCase().trim();
      if (!descMap.has(key)) descMap.set(key, []);
      descMap.get(key)!.push(r.url);
    }
  }

  for (const [desc, urls] of descMap) {
    if (urls.length > 1) {
      issues.push({
        code: 'duplicate_meta_description',
        severity: 'P2',
        category: 'SEO',
        title: `Duplicate meta description across ${urls.length} pages`,
        whyItMatters: 'Duplicate descriptions reduce the effectiveness of search result snippets and suggest poor content differentiation.',
        howToFix: 'Write a unique meta description for each page that summarizes its specific content.',
        evidence: {
          url: urls[0],
          actual: desc.slice(0, 100),
          snippet: urls.join(', '),
        },
        impact: 2,
        effort: 2,
      });
    }
  }

  return issues;
}
