import { prisma } from '../db';
import { Crawler, type CrawlResult } from './crawler';
import { checkLinks, findBrokenLinks, type LinkCheckResult } from './link-checker';
import { checkAccessibility, mapImpactToSeverity, type A11yResult } from './a11y-checker';
import { checkSEO, type SEOIssue } from './seo-checker';
import type { ScanSettings, ScanProgress, ScanSummary, LinkData } from '../types';

export interface ScanContext {
  scanRunId: string;
  settings: ScanSettings;
}

/**
 * Run a complete website scan
 */
export async function runScan(ctx: ScanContext): Promise<void> {
  const { scanRunId, settings } = ctx;
  const startTime = Date.now();

  try {
    // Update status to running
    const scanRun = await prisma.scanRun.update({
      where: { id: scanRunId },
      data: { status: 'RUNNING' },
    });

    const normalizedUrl = scanRun.normalizedUrl;

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 1: Crawl pages
    // ─────────────────────────────────────────────────────────────────────────
    const crawler = new Crawler({
      maxPages: settings.maxPages,
      maxDepth: settings.maxDepth,
    });

    crawler.setProgressCallback(async (discovered, scanned, current) => {
      await updateProgress(scanRunId, {
        pagesDiscovered: discovered,
        pagesScanned: scanned,
        checksCompleted: 0,
        stage: 'crawling',
        currentPage: current,
      });
    });

    const crawlResults = await crawler.crawl(normalizedUrl);

    // Save page results
    for (const result of crawlResults) {
      await prisma.pageResult.create({
        data: {
          scanRunId,
          url: result.url,
          statusCode: result.statusCode,
          loadTimeMs: result.loadTimeMs,
          title: result.title,
          metaDescription: result.metaDescription,
          h1: result.h1,
          canonical: result.canonical,
          robotsMeta: result.robotsMeta,
          wordCount: result.wordCount,
          links: result.links as unknown as object,
        },
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 2: Check SEO issues
    // ─────────────────────────────────────────────────────────────────────────
    await updateProgress(scanRunId, {
      pagesDiscovered: crawlResults.length,
      pagesScanned: crawlResults.length,
      checksCompleted: 0,
      stage: 'analyzing',
    });

    const allIssues: Array<{
      code: string;
      severity: 'P0' | 'P1' | 'P2' | 'P3';
      category: 'SEO' | 'ACCESSIBILITY' | 'PERFORMANCE' | 'LINKS' | 'CONTENT';
      title: string;
      whyItMatters: string | null;
      howToFix: string | null;
      evidence: object;
      impact: number | null;
      effort: number | null;
    }> = [];

    for (const result of crawlResults) {
      if (!result.error) {
        const seoIssues = checkSEO(result);
        allIssues.push(...seoIssues);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 3: Check broken links
    // ─────────────────────────────────────────────────────────────────────────
    const allLinks: LinkData[] = crawlResults.flatMap((r) => r.links);
    const internalLinks = allLinks.filter((l) => l.isInternal);

    // Only check a reasonable number of links
    const linksToCheck = internalLinks.slice(0, 100);
    const linkResults = await checkLinks(linksToCheck);
    const brokenLinks = findBrokenLinks(linkResults);

    for (const broken of brokenLinks) {
      allIssues.push({
        code: 'broken_link',
        severity: broken.statusCode === 404 ? 'P1' : 'P2',
        category: 'LINKS',
        title: `Broken link (${broken.statusCode || 'connection error'})`,
        whyItMatters: 'Broken links frustrate users and can hurt SEO. Search engines may penalize sites with many broken links.',
        howToFix: broken.statusCode === 404
          ? 'Remove the link or update it to point to a valid page.'
          : 'Check the target server status and fix any connectivity issues.',
        evidence: {
          url: broken.href,
          httpStatus: broken.statusCode,
          error: broken.error,
          linkText: broken.text,
        },
        impact: 4,
        effort: 1,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 4: Accessibility checks (on first 5 pages to save time)
    // ─────────────────────────────────────────────────────────────────────────
    const pagesToCheckA11y = crawlResults.slice(0, 5).filter((r) => !r.error);

    for (const page of pagesToCheckA11y) {
      const a11yResult = await checkAccessibility(page.url);

      // Update page result with axe findings
      await prisma.pageResult.updateMany({
        where: { scanRunId, url: page.url },
        data: { axeFindings: a11yResult.violations as unknown as object },
      });

      // Create issues for violations
      for (const violation of a11yResult.violations) {
        allIssues.push({
          code: `a11y_${violation.id}`,
          severity: mapImpactToSeverity(violation.impact),
          category: 'ACCESSIBILITY',
          title: violation.help,
          whyItMatters: violation.description,
          howToFix: `See ${violation.helpUrl} for guidance on fixing this issue.`,
          evidence: {
            url: page.url,
            nodes: violation.nodes.slice(0, 3), // Limit to 3 examples
          },
          impact: violation.impact === 'critical' ? 5 : violation.impact === 'serious' ? 4 : 3,
          effort: 2,
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 5: Save issues and compute summary
    // ─────────────────────────────────────────────────────────────────────────
    await updateProgress(scanRunId, {
      pagesDiscovered: crawlResults.length,
      pagesScanned: crawlResults.length,
      checksCompleted: allIssues.length,
      stage: 'summarizing',
    });

    // Dedupe issues by code + url
    const uniqueIssues = dedupeIssues(allIssues);

    // Save issues to database
    for (const issue of uniqueIssues) {
      await prisma.issue.create({
        data: {
          scanRunId,
          code: issue.code,
          severity: issue.severity,
          category: issue.category,
          title: issue.title,
          whyItMatters: issue.whyItMatters,
          howToFix: issue.howToFix,
          evidence: issue.evidence,
          impact: issue.impact,
          effort: issue.effort,
        },
      });
    }

    // Compute summary
    const summary = computeSummary(uniqueIssues, crawlResults, Date.now() - startTime);

    // Update scan run with success
    await prisma.scanRun.update({
      where: { id: scanRunId },
      data: {
        status: 'SUCCEEDED',
        summary: summary as unknown as object,
        progress: {
          pagesDiscovered: crawlResults.length,
          pagesScanned: crawlResults.length,
          checksCompleted: uniqueIssues.length,
          stage: 'done',
        },
      },
    });
  } catch (error) {
    console.error('Scan failed:', error);
    await prisma.scanRun.update({
      where: { id: scanRunId },
      data: {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}

async function updateProgress(scanRunId: string, progress: ScanProgress) {
  await prisma.scanRun.update({
    where: { id: scanRunId },
    data: { progress: progress as unknown as object },
  });
}

function dedupeIssues<T extends { code: string; evidence: { url?: string } }>(issues: T[]): T[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${(issue.evidence as { url?: string }).url || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function computeSummary(
  issues: Array<{ severity: string; category: string; code: string; title: string }>,
  crawlResults: CrawlResult[],
  scanDurationMs: number
): ScanSummary {
  // Count issues by severity
  const issueCount = {
    P0: issues.filter((i) => i.severity === 'P0').length,
    P1: issues.filter((i) => i.severity === 'P1').length,
    P2: issues.filter((i) => i.severity === 'P2').length,
    P3: issues.filter((i) => i.severity === 'P3').length,
  };

  // Count issues by category
  const categoryIssues = {
    seo: issues.filter((i) => i.category === 'SEO').length,
    accessibility: issues.filter((i) => i.category === 'ACCESSIBILITY').length,
    performance: issues.filter((i) => i.category === 'PERFORMANCE').length,
    links: issues.filter((i) => i.category === 'LINKS').length,
    content: issues.filter((i) => i.category === 'CONTENT').length,
  };

  // Compute category scores (100 - penalty)
  const maxPenalty = 50; // Cap penalty at 50 points per category
  const categoryScores = {
    seo: Math.max(0, 100 - Math.min(categoryIssues.seo * 10, maxPenalty)),
    accessibility: Math.max(0, 100 - Math.min(categoryIssues.accessibility * 8, maxPenalty)),
    performance: Math.max(0, 100 - Math.min(categoryIssues.performance * 10, maxPenalty)),
    links: Math.max(0, 100 - Math.min(categoryIssues.links * 5, maxPenalty)),
    content: Math.max(0, 100 - Math.min(categoryIssues.content * 10, maxPenalty)),
  };

  // Overall score (weighted average)
  const overallScore = Math.round(
    categoryScores.seo * 0.25 +
    categoryScores.accessibility * 0.25 +
    categoryScores.performance * 0.2 +
    categoryScores.links * 0.15 +
    categoryScores.content * 0.15
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
      const severityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
      const severityDiff = (severityOrder[a.severity as keyof typeof severityOrder] || 4) -
        (severityOrder[b.severity as keyof typeof severityOrder] || 4);
      if (severityDiff !== 0) return severityDiff;
      return b.count - a.count;
    })
    .slice(0, 10);

  return {
    overallScore,
    categoryScores,
    issueCount,
    topIssues,
    pagesCrawled: crawlResults.length,
    scanDurationMs,
  };
}

export { Crawler, checkLinks, checkAccessibility, checkSEO };
