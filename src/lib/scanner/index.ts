import { supabaseAdmin } from '../supabase-server';
import { Crawler, type CrawlResult } from './crawler';
import { checkLinks, findBrokenLinks, findRedirectChains } from './link-checker';
import { checkAccessibility, mapImpactToSeverity } from './a11y-checker';
import { checkSEO } from './seo-checker';
import { checkPerformance } from './perf-checker';
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
    const { data: scanRun, error: updateError } = await supabaseAdmin
      .from('ScanRun')
      .update({ status: 'RUNNING', updatedAt: new Date().toISOString() })
      .eq('id', scanRunId)
      .select()
      .single();
    if (updateError) throw updateError;

    const normalizedUrl = scanRun.normalizedUrl;

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 1: Crawl pages
    // ─────────────────────────────────────────────────────────────────────────
    const crawler = new Crawler({
      maxPages: settings.maxPages,
      maxDepth: settings.maxDepth,
      screenshotMode: settings.screenshotMode ?? 'above-fold',
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
      const { error: pageError } = await supabaseAdmin
        .from('PageResult')
        .insert({
          id: crypto.randomUUID(),
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
          links: result.links,
          screenshotPath: result.screenshotBase64
            ? `data:image/jpeg;base64,${result.screenshotBase64}`
            : null,
        });
      if (pageError) throw pageError;
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

    // Detect redirect chains
    const redirectChains = findRedirectChains(linkResults);
    for (const chain of redirectChains) {
      allIssues.push({
        code: 'redirect_chain',
        severity: 'P2',
        category: 'LINKS',
        title: `Redirect chain (${chain.redirectChain!.length - 1} hops)`,
        whyItMatters: 'Long redirect chains slow page load and waste crawl budget. Each hop adds latency and search engines may stop following after a few redirects.',
        howToFix: 'Update the link to point directly to the final destination URL, removing intermediate redirects.',
        evidence: {
          url: chain.href,
          finalUrl: chain.redirectChain![chain.redirectChain!.length - 1],
          chain: chain.redirectChain,
          hops: chain.redirectChain!.length - 1,
          linkText: chain.text,
        },
        impact: 3,
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
      await supabaseAdmin
        .from('PageResult')
        .update({ axeFindings: a11yResult.violations })
        .eq('scanRunId', scanRunId)
        .eq('url', page.url);

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
    // Phase 5: Performance checks
    // ─────────────────────────────────────────────────────────────────────────
    if (settings.includePerformance) {
      await updateProgress(scanRunId, {
        pagesDiscovered: crawlResults.length,
        pagesScanned: crawlResults.length,
        checksCompleted: allIssues.length,
        stage: 'performance',
      });

      // Check performance on homepage + up to 2 more pages
      const pagesToCheckPerf = crawlResults.slice(0, 3).filter((r) => !r.error);

      for (const pageResult of pagesToCheckPerf) {
        const perfResult = await checkPerformance(pageResult.url);

        // Update the page result with performance data
        await supabaseAdmin
          .from('PageResult')
          .update({ lighthouseData: perfResult.metrics })
          .eq('scanRunId', scanRunId)
          .eq('url', pageResult.url);

        const m = perfResult.metrics;

        // FCP issues
        if (m.firstContentfulPaint !== null && m.firstContentfulPaint > 3000) {
          allIssues.push({
            code: 'slow_fcp',
            severity: 'P1',
            category: 'PERFORMANCE',
            title: `Slow First Contentful Paint (${m.firstContentfulPaint}ms)`,
            whyItMatters: 'First Contentful Paint measures when the first text or image is painted. Users perceive pages as slow when FCP exceeds 3 seconds.',
            howToFix: 'Reduce server response time, eliminate render-blocking resources, and optimize critical rendering path. Consider using a CDN.',
            evidence: { url: pageResult.url, fcp: m.firstContentfulPaint },
            impact: 4,
            effort: 3,
          });
        } else if (m.firstContentfulPaint !== null && m.firstContentfulPaint > 1800) {
          allIssues.push({
            code: 'needs_improvement_fcp',
            severity: 'P2',
            category: 'PERFORMANCE',
            title: `First Contentful Paint needs improvement (${m.firstContentfulPaint}ms)`,
            whyItMatters: 'First Contentful Paint between 1.8s and 3s indicates the page could load faster. Users expect pages to load within 2 seconds.',
            howToFix: 'Optimize images, defer non-critical CSS/JS, and consider preloading key resources.',
            evidence: { url: pageResult.url, fcp: m.firstContentfulPaint },
            impact: 3,
            effort: 2,
          });
        }

        // LCP issues
        if (m.largestContentfulPaint !== null && m.largestContentfulPaint > 4000) {
          allIssues.push({
            code: 'slow_lcp',
            severity: 'P1',
            category: 'PERFORMANCE',
            title: `Slow Largest Contentful Paint (${m.largestContentfulPaint}ms)`,
            whyItMatters: 'Largest Contentful Paint measures when the largest content element becomes visible. LCP above 4s is rated poor by Core Web Vitals.',
            howToFix: 'Optimize the largest image or text block on the page. Use responsive images, preload hero images, and reduce server response time.',
            evidence: { url: pageResult.url, lcp: m.largestContentfulPaint },
            impact: 5,
            effort: 3,
          });
        } else if (m.largestContentfulPaint !== null && m.largestContentfulPaint > 2500) {
          allIssues.push({
            code: 'needs_improvement_lcp',
            severity: 'P2',
            category: 'PERFORMANCE',
            title: `Largest Contentful Paint needs improvement (${m.largestContentfulPaint}ms)`,
            whyItMatters: 'LCP between 2.5s and 4s means the main content is loading slower than ideal. This is a Core Web Vital metric that affects search ranking.',
            howToFix: 'Preload the LCP element, optimize images with modern formats (WebP/AVIF), and use a CDN for static assets.',
            evidence: { url: pageResult.url, lcp: m.largestContentfulPaint },
            impact: 4,
            effort: 2,
          });
        }

        // CLS issues
        if (m.cumulativeLayoutShift !== null && m.cumulativeLayoutShift > 0.25) {
          allIssues.push({
            code: 'poor_cls',
            severity: 'P1',
            category: 'PERFORMANCE',
            title: `Poor Cumulative Layout Shift (${m.cumulativeLayoutShift})`,
            whyItMatters: 'CLS above 0.25 means page elements shift significantly during loading, causing a frustrating user experience and misclicks.',
            howToFix: 'Set explicit width and height on images/videos, avoid inserting content above existing content, and use CSS contain where possible.',
            evidence: { url: pageResult.url, cls: m.cumulativeLayoutShift },
            impact: 4,
            effort: 2,
          });
        } else if (m.cumulativeLayoutShift !== null && m.cumulativeLayoutShift > 0.1) {
          allIssues.push({
            code: 'needs_improvement_cls',
            severity: 'P2',
            category: 'PERFORMANCE',
            title: `Cumulative Layout Shift needs improvement (${m.cumulativeLayoutShift})`,
            whyItMatters: 'CLS between 0.1 and 0.25 indicates some layout instability. This is a Core Web Vital that affects user experience and SEO.',
            howToFix: 'Add size attributes to images and embeds, avoid dynamically injected content, and use font-display: swap for web fonts.',
            evidence: { url: pageResult.url, cls: m.cumulativeLayoutShift },
            impact: 3,
            effort: 2,
          });
        }

        // Load time issue
        if (m.loadTime !== null && m.loadTime > 5000) {
          allIssues.push({
            code: 'slow_load',
            severity: 'P2',
            category: 'PERFORMANCE',
            title: `Slow page load (${m.loadTime}ms)`,
            whyItMatters: 'Pages that take more than 5 seconds to fully load have significantly higher bounce rates. Each additional second of load time reduces conversions.',
            howToFix: 'Audit and reduce page weight, enable compression, minimize HTTP requests, and consider lazy loading below-fold content.',
            evidence: { url: pageResult.url, loadTime: m.loadTime },
            impact: 3,
            effort: 3,
          });
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 6: Save issues and compute summary
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
      const { error: issueError } = await supabaseAdmin
        .from('Issue')
        .insert({
          id: crypto.randomUUID(),
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
        });
      if (issueError) throw issueError;
    }

    // Compute summary
    const summary = computeSummary(uniqueIssues, crawlResults, Date.now() - startTime);

    // Update scan run with success
    await supabaseAdmin
      .from('ScanRun')
      .update({
        status: 'SUCCEEDED',
        summary: summary,
        progress: {
          pagesDiscovered: crawlResults.length,
          pagesScanned: crawlResults.length,
          checksCompleted: uniqueIssues.length,
          stage: 'done',
        },
        updatedAt: new Date().toISOString(),
      })
      .eq('id', scanRunId);
  } catch (error) {
    console.error('Scan failed:', error);
    await supabaseAdmin
      .from('ScanRun')
      .update({
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: new Date().toISOString(),
      })
      .eq('id', scanRunId);
  }
}

async function updateProgress(scanRunId: string, progress: ScanProgress) {
  await supabaseAdmin
    .from('ScanRun')
    .update({ progress, updatedAt: new Date().toISOString() })
    .eq('id', scanRunId);
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
