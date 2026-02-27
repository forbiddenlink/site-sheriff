/**
 * SEO Checker Module
 *
 * This module provides comprehensive SEO analysis for crawled pages.
 * It has been refactored into modular components for maintainability:
 *
 * - types.ts - Shared type definitions
 * - auth-page.ts - Auth/dashboard page detection
 * - meta-tags.ts - Title, description, viewport, H1, robots meta
 * - open-graph.ts - OG tags, Twitter cards, image validation
 * - canonical.ts - Canonical URL checks
 * - hreflang.ts - International targeting validation
 * - structured-data.ts - JSON-LD validation
 * - anchor-text.ts - Link text quality
 * - duplicates.ts - Duplicate content detection
 * - spa-detection.ts - SPA/framework detection
 * - url-structure.ts - URL format checks
 * - mobile-checks.ts - Mobile usability
 * - pagination.ts - rel=prev/next validation
 */

import type { CrawlResult } from '../crawler';
import type { SEOIssue } from './types';

// Import functions used in checkSEO
import { checkTitle, checkMetaDescription, checkH1, checkRobotsMeta, checkViewport, checkLangAttribute, checkFavicon } from './meta-tags';
import { checkOpenGraph, checkTwitterCard } from './open-graph';
import { checkCanonical } from './canonical';
import { checkHreflang } from './hreflang';
import { checkUrlStructure } from './url-structure';
import { checkMobileUsability } from './mobile-checks';
import { checkPagination } from './pagination';

// Re-export types
export type { SEOIssue, SPAIssue } from './types';

// Re-export individual check functions for direct use by scanner/index.ts
export { checkAnchorText } from './anchor-text';
export { checkStructuredData } from './structured-data';
export { checkDuplicates } from './duplicates';
export { checkSPARendering } from './spa-detection';
export { validateOgImages } from './open-graph';
export { validateCanonicals } from './canonical';
export { validateHreflangBidirectional } from './hreflang';

/**
 * Analyze a crawl result for SEO issues.
 * This is the main entry point that combines all SEO checks.
 *
 * @param result - The crawl result for a single page
 * @param disallowPatterns - Optional robots.txt Disallow patterns for auth page detection
 */
export function checkSEO(result: CrawlResult, disallowPatterns: string[] = []): SEOIssue[] {
  const issues: SEOIssue[] = [];

  // Title checks
  issues.push(...checkTitle(result, disallowPatterns));

  // Meta description checks
  issues.push(...checkMetaDescription(result));

  // H1 heading checks
  issues.push(...checkH1(result, disallowPatterns));

  // Canonical URL checks
  issues.push(...checkCanonical(result));

  // Robots meta (noindex) checks
  issues.push(...checkRobotsMeta(result));

  // Open Graph checks
  issues.push(...checkOpenGraph(result));

  // Twitter Card checks
  issues.push(...checkTwitterCard(result));

  // Viewport checks
  issues.push(...checkViewport(result));

  // Mobile usability checks (zoom restrictions, font sizes, tap targets, interstitials)
  issues.push(...checkMobileUsability(result));

  // Language attribute check
  issues.push(...checkLangAttribute(result));

  // Favicon check (homepage only)
  issues.push(...checkFavicon(result));

  // Hreflang validation
  issues.push(...checkHreflang(result));

  // URL structure checks
  issues.push(...checkUrlStructure(result));

  // Pagination rel=prev/next checks
  issues.push(...checkPagination(result));

  return issues;
}
