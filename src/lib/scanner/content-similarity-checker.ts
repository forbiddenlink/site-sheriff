import * as cheerio from 'cheerio';
import type { CrawlResult } from './crawler';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ContentSimilarityIssue {
  code: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  category: 'SEO' | 'CONTENT';
  title: string;
  whyItMatters: string;
  howToFix: string;
  evidence: {
    url: string;
    similarUrl?: string;
    similarity?: number;
    sharedContent?: string;
  };
  impact: number;
  effort: number;
}

interface PageContent {
  url: string;
  text: string;
  shingles: Set<string>;
  wordCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Text extraction and normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract and normalize text content from HTML.
 * Removes scripts, styles, nav, footer, and other boilerplate elements.
 */
function extractTextContent(html: string): string {
  const $ = cheerio.load(html);

  // Remove elements that typically contain boilerplate/non-content
  $('script, style, noscript, nav, footer, header, aside, [role="navigation"], [role="banner"], [role="contentinfo"]').remove();

  // Also remove common boilerplate selectors
  $('.nav, .navigation, .header, .footer, .sidebar, .menu, .cookie-banner, .cookie-notice').remove();

  // Get text from main content areas first, fall back to body
  let text = '';
  const mainContent = $('main, article, [role="main"], .content, .post, .entry');
  if (mainContent.length > 0) {
    text = mainContent.text();
  } else {
    text = $('body').text();
  }

  // Normalize: lowercase, collapse whitespace, remove punctuation
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Create shingles (word n-grams) from text.
 * Shingles are used for similarity comparison - overlapping sequences of words.
 */
function createShingles(text: string, shingleSize: number = 3): Set<string> {
  const words = text.split(' ').filter(w => w.length > 2); // Skip tiny words
  const shingles = new Set<string>();

  if (words.length < shingleSize) {
    // For very short content, use individual words
    words.forEach(w => shingles.add(w));
    return shingles;
  }

  for (let i = 0; i <= words.length - shingleSize; i++) {
    const shingle = words.slice(i, i + shingleSize).join(' ');
    shingles.add(shingle);
  }

  return shingles;
}

/**
 * Compute Jaccard similarity between two sets.
 * Returns a value between 0 (no overlap) and 1 (identical).
 */
function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 && set2.size === 0) return 0;
  if (set1.size === 0 || set2.size === 0) return 0;

  let intersection = 0;
  const smaller = set1.size <= set2.size ? set1 : set2;
  const larger = set1.size > set2.size ? set1 : set2;

  for (const item of smaller) {
    if (larger.has(item)) {
      intersection++;
    }
  }

  const union = set1.size + set2.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Find shared content snippet for evidence.
 */
function findSharedSnippet(text1: string, text2: string, maxLength: number = 100): string {
  const words1 = text1.split(' ');
  const words2 = new Set(text2.split(' '));

  // Find longest sequence of shared words
  let longestMatch = '';
  let currentMatch = '';

  for (const word of words1) {
    if (words2.has(word)) {
      currentMatch += (currentMatch ? ' ' : '') + word;
      if (currentMatch.length > longestMatch.length) {
        longestMatch = currentMatch;
      }
    } else {
      currentMatch = '';
    }
  }

  if (longestMatch.length > maxLength) {
    return longestMatch.substring(0, maxLength) + '...';
  }
  return longestMatch || '(similar structure detected)';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyze content similarity across multiple pages.
 *
 * This cross-page check identifies:
 * 1. **duplicate_content** (P2) – Pages with >90% similar content
 * 2. **high_content_similarity** (P3) – Pages with >70% similar content
 *
 * Uses shingle-based Jaccard similarity for efficient comparison without
 * external dependencies.
 *
 * @param results - Array of crawl results to compare
 * @returns Array of issues found
 */
export function checkContentSimilarity(results: CrawlResult[]): ContentSimilarityIssue[] {
  // Filter to valid HTML pages with sufficient content
  const validPages = results.filter(r =>
    r.html &&
    !r.error &&
    r.wordCount &&
    r.wordCount > 50 // Skip very thin pages
  );

  if (validPages.length < 2) return [];

  // Extract and process content from each page
  const pageContents: PageContent[] = validPages.map(result => {
    const text = extractTextContent(result.html);
    return {
      url: result.url,
      text,
      shingles: createShingles(text),
      wordCount: text.split(' ').filter(w => w.length > 0).length,
    };
  });

  // Skip pages with too little content after extraction
  const substantialPages = pageContents.filter(p => p.wordCount > 30);
  if (substantialPages.length < 2) return [];

  const issues: ContentSimilarityIssue[] = [];
  const reportedPairs = new Set<string>(); // Avoid duplicate pair reports

  // Compare all pairs
  for (let i = 0; i < substantialPages.length; i++) {
    for (let j = i + 1; j < substantialPages.length; j++) {
      const page1 = substantialPages[i];
      const page2 = substantialPages[j];

      // Skip if URLs are very similar (pagination, query params)
      const url1Base = page1.url.split('?')[0].replace(/\/page\/\d+/, '').replace(/\/\d+$/, '');
      const url2Base = page2.url.split('?')[0].replace(/\/page\/\d+/, '').replace(/\/\d+$/, '');
      if (url1Base === url2Base) continue;

      const similarity = jaccardSimilarity(page1.shingles, page2.shingles);
      const pairKey = [page1.url, page2.url].sort().join('|');

      if (similarity >= 0.9 && !reportedPairs.has(pairKey)) {
        reportedPairs.add(pairKey);
        issues.push({
          code: 'duplicate_content',
          severity: 'P2' as const,
          category: 'SEO' as const,
          title: 'Duplicate content detected',
          whyItMatters:
            'Search engines may penalize sites with duplicate content, as it provides poor user experience and wastes crawl budget. Only one version will typically rank.',
          howToFix:
            'Consolidate duplicate pages into one canonical version using rel="canonical", 301 redirects, or by removing duplicate content. If both pages are needed, differentiate their content significantly.',
          evidence: {
            url: page1.url,
            similarUrl: page2.url,
            similarity: Math.round(similarity * 100),
            sharedContent: findSharedSnippet(page1.text, page2.text),
          },
          impact: 4,
          effort: 2,
        });
      } else if (similarity >= 0.7 && similarity < 0.9 && !reportedPairs.has(pairKey)) {
        reportedPairs.add(pairKey);
        issues.push({
          code: 'high_content_similarity',
          severity: 'P3' as const,
          category: 'SEO' as const,
          title: 'High content similarity detected',
          whyItMatters:
            'Pages with highly similar content may compete with each other in search results and dilute your ranking potential. Search engines prefer unique, valuable content on each page.',
          howToFix:
            'Differentiate the content on these pages to serve distinct user intents, or consolidate them if they serve the same purpose. Consider using rel="canonical" if one is the preferred version.',
          evidence: {
            url: page1.url,
            similarUrl: page2.url,
            similarity: Math.round(similarity * 100),
            sharedContent: findSharedSnippet(page1.text, page2.text),
          },
          impact: 2,
          effort: 2,
        });
      }
    }
  }

  return issues;
}
