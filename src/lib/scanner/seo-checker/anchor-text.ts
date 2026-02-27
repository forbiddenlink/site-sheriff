import type { CrawlResult } from '../crawler';
import type { SEOIssue } from './types';

/**
 * Common non-descriptive anchor text patterns to flag.
 */
const NON_DESCRIPTIVE_ANCHOR_PATTERNS = [
  /^click\s*here$/i,
  /^here$/i,
  /^read\s*more$/i,
  /^learn\s*more$/i,
  /^more$/i,
  /^link$/i,
  /^this$/i,
  /^this\s*link$/i,
  /^go$/i,
  /^see\s*more$/i,
  /^continue$/i,
  /^continue\s*reading$/i,
  /^details$/i,
  /^info$/i,
  /^view$/i,
  /^view\s*more$/i,
];

/**
 * Check anchor text quality for all links on a page.
 */
export function checkAnchorText(result: CrawlResult): SEOIssue[] {
  const issues: SEOIssue[] = [];

  for (const link of result.links) {
    const anchorText = link.text.trim();

    // Check for empty anchor text (P2 - more important)
    if (!anchorText) {
      issues.push({
        code: 'empty_anchor_text',
        severity: 'P2',
        category: 'SEO',
        title: 'Link has empty anchor text',
        whyItMatters: 'Empty anchor text provides no context to users or search engines about where the link leads. Screen readers will only announce "link" without describing the destination.',
        howToFix: 'Add descriptive text to the link that explains where it leads. For image links, ensure the image has alt text.',
        evidence: { url: result.url, snippet: `Link to: ${link.href}` },
        impact: 3,
        effort: 1,
      });
      continue;
    }

    // Check for non-descriptive anchor text (P3 - minor issue)
    for (const pattern of NON_DESCRIPTIVE_ANCHOR_PATTERNS) {
      if (pattern.test(anchorText)) {
        issues.push({
          code: 'non_descriptive_anchor',
          severity: 'P3',
          category: 'SEO',
          title: 'Link uses non-descriptive anchor text',
          whyItMatters: 'Generic anchor text like "click here" or "read more" provides no SEO value and poor accessibility. Search engines use anchor text to understand linked content.',
          howToFix: 'Replace generic text with descriptive anchor text that indicates the link destination. For example, change "click here" to "view our pricing plans".',
          evidence: { url: result.url, actual: anchorText, snippet: `Link to: ${link.href}` },
          impact: 2,
          effort: 1,
        });
        break; // Only report once per link
      }
    }
  }

  return issues;
}
