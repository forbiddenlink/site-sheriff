/**
 * SEO Checker - Re-exports from modular seo-checker/ directory
 *
 * This file maintains backward compatibility with existing imports.
 * The actual implementation has been refactored into:
 * - seo-checker/types.ts
 * - seo-checker/meta-tags.ts
 * - seo-checker/open-graph.ts
 * - seo-checker/canonical.ts
 * - seo-checker/hreflang.ts
 * - seo-checker/structured-data.ts
 * - seo-checker/anchor-text.ts
 * - seo-checker/duplicates.ts
 * - seo-checker/spa-detection.ts
 * - seo-checker/url-structure.ts
 * - seo-checker/mobile-checks.ts
 * - seo-checker/pagination.ts
 * - seo-checker/index.ts (orchestrator)
 */

export type { SEOIssue, SPAIssue } from './seo-checker/types';

export {
  checkSEO,
  checkAnchorText,
  checkStructuredData,
  checkDuplicates,
  checkSPARendering,
  validateOgImages,
  validateCanonicals,
  validateHreflangBidirectional,
} from './seo-checker/index';
