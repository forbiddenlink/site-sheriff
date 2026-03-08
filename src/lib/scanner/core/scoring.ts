import type { CrawlResult } from '../crawler';
import type { ScanSummary } from '../../types';

/**
 * Severity-weighted penalty points per unique issue type.
 */
export const SEVERITY_PENALTY: Record<string, number> = { P0: 20, P1: 8, P2: 3, P3: 1 };

/**
 * Map axe impact level to a numeric impact score (1-5).
 */
export function impactToScore(impact: string | null | undefined): number {
  switch (impact) {
    case 'critical': return 5;
    case 'serious':  return 4;
    case 'moderate': return 3;
    default:         return 2;
  }
}

/**
 * Compute the score for a single category.
 *
 * Penalties are applied per UNIQUE issue code (not per page instance) so that
 * the same template-level problem found on many pages doesn't crush the score.
 * Additional page occurrences add a small logarithmic penalty (capped at +3).
 *
 * An exponential diminishing-returns curve is then applied to the raw total so
 * that many low-severity issues cannot sink the score the way a few critical
 * ones can. This produces realistic ranges:
 *   • rawPenalty ≈ 10  →  score ~88   (minor issues)
 *   • rawPenalty ≈ 30  →  score ~69   (moderate)
 *   • rawPenalty ≈ 60  →  score ~53   (significant)
 *   • rawPenalty ≈ 100 →  score ~71→29 (severe)
 */
export function computeCategoryScore(
  issues: Array<{ severity: string; category: string; code: string }>,
  category: string,
): number {
  const catIssues = issues.filter((i) => i.category === category);
  if (catIssues.length === 0) return 100;

  // Group by issue code to avoid penalising the same problem on every page
  const grouped = new Map<string, { severity: string; count: number }>();
  for (const issue of catIssues) {
    const existing = grouped.get(issue.code);
    if (existing) {
      existing.count++;
    } else {
      grouped.set(issue.code, { severity: issue.severity, count: 1 });
    }
  }

  let rawPenalty = 0;
  for (const { severity, count } of grouped.values()) {
    const base = SEVERITY_PENALTY[severity] ?? 3;
    // Additional instances add logarithmic penalty, capped at +3
    const extra = count > 1 ? Math.min(Math.ceil(Math.log2(count)), 3) : 0;
    rawPenalty += base + extra;
  }

  // Exponential diminishing returns so many small issues can't crater the score
  // Maps rawPenalty → effective penalty on a 0-100 curve
  const effectivePenalty = Math.round(100 * (1 - Math.exp(-rawPenalty / 80)));

  return Math.max(0, 100 - effectivePenalty);
}

/**
 * Compute the full scan summary from issues and crawl results.
 */
export function computeSummary(
  issues: Array<{ severity: string; category: string; code: string; title: string }>,
  crawlResults: CrawlResult[],
  scanDurationMs: number,
  technologies: Array<{ name: string; category: string; confidence: string; evidence: string }> = []
): ScanSummary {
  // Count issues by severity
  const issueCount = {
    P0: issues.filter((i) => i.severity === 'P0').length,
    P1: issues.filter((i) => i.severity === 'P1').length,
    P2: issues.filter((i) => i.severity === 'P2').length,
    P3: issues.filter((i) => i.severity === 'P3').length,
  };

  // Compute category scores using severity-weighted penalties
  const categoryScores = {
    seo: computeCategoryScore(issues, 'SEO'),
    accessibility: computeCategoryScore(issues, 'ACCESSIBILITY'),
    performance: computeCategoryScore(issues, 'PERFORMANCE'),
    links: computeCategoryScore(issues, 'LINKS'),
    content: computeCategoryScore(issues, 'CONTENT'),
    security: computeCategoryScore(issues, 'SECURITY'),
  };

  // Overall score (weighted average — 6 categories)
  const overallScore = Math.round(
    categoryScores.seo * 0.25 +
    categoryScores.accessibility * 0.2 +
    categoryScores.performance * 0.15 +
    categoryScores.links * 0.1 +
    categoryScores.content * 0.1 +
    categoryScores.security * 0.2
  );

  // Top issues (group by code)
  const issueCounts = new Map<string, { code: string; title: string; severity: string; category: string; count: number }>();
  for (const issue of issues) {
    const existing = issueCounts.get(issue.code);
    if (existing) {
      existing.count++;
    } else {
      issueCounts.set(issue.code, {
        code: issue.code,
        title: issue.title,
        severity: issue.severity,
        category: issue.category,
        count: 1,
      });
    }
  }

  const topIssues = Array.from(issueCounts.values())
    .sort((a, b) => {
      // Sort by severity first, then by count
      const severityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
      const aOrder = severityOrder[a.severity] ?? 4;
      const bOrder = severityOrder[b.severity] ?? 4;
      const severityDiff = aOrder - bOrder;
      if (severityDiff !== 0) return severityDiff;
      return b.count - a.count;
    })
    .slice(0, 10);

  // Extract social preview data from homepage
  const homepage = crawlResults[0];
  const socialPreview = homepage ? {
    ogTitle: homepage.ogTags['og:title'] ?? null,
    ogDescription: homepage.ogTags['og:description'] ?? null,
    ogImage: homepage.ogTags['og:image'] ?? null,
    ogSiteName: homepage.ogTags['og:site_name'] ?? null,
    twitterCard: homepage.ogTags['twitter:card'] ?? null,
    twitterTitle: homepage.ogTags['twitter:title'] ?? null,
    twitterDescription: homepage.ogTags['twitter:description'] ?? null,
    twitterImage: homepage.ogTags['twitter:image'] ?? null,
    favicon: homepage.favicon ?? null,
  } : undefined;

  return {
    overallScore,
    categoryScores,
    issueCount,
    topIssues,
    pagesCrawled: crawlResults.length,
    scanDurationMs,
    technologies,
    socialPreview,
  };
}
