import { supabaseAdmin } from '../supabase-server';
import { Crawler, type CrawlResult } from './crawler';
import { checkLinks, findBrokenLinks, findRedirectChains } from './link-checker';
import { checkAccessibility, mapImpactToSeverity } from './a11y-checker';
import { checkSEO, checkDuplicates, checkStructuredData, checkSPARendering, validateOgImages, validateCanonicals, validateHreflangBidirectional, checkAnchorText } from './seo-checker';
import { checkPerformance } from './perf-checker';
import { checkSecurity, checkSecurityTxt, checkHttpsRedirect } from './security-checker';
import { checkCompression } from './compression-checker';
import { checkRobotsSitemap, parseDisallowPatterns } from './robots-checker';
import { detectTechnologies } from './tech-detector';
import { generateEmailDraft } from './email-draft';
import { checkContentQuality } from './content-checker';
import { checkImageOptimization } from './image-checker';
import { checkResourceOptimization } from './resource-checker';
import { analyzeInternalLinking } from './linking-analyzer';
import { checkEEAT } from './eeat-checker';
import { checkAIReadiness, checkLlmsTxt, checkAICrawlerAccess } from './ai-readiness-checker';
import { checkContentSimilarity } from './content-similarity-checker';
import type { ScanSettings, ScanProgress, ScanSummary, LinkData } from '../types';

export { Crawler } from './crawler';
export { checkLinks } from './link-checker';
export { checkAccessibility } from './a11y-checker';
export { checkSEO, checkStructuredData, checkAnchorText } from './seo-checker';
export { checkCompression } from './compression-checker';
export { checkContentQuality } from './content-checker';
export { checkImageOptimization } from './image-checker';
export { checkResourceOptimization } from './resource-checker';
export { analyzeInternalLinking } from './linking-analyzer';

/**
 * Map axe impact level to a numeric impact score (1-5).
 */
function impactToScore(impact: string | null | undefined): number {
  switch (impact) {
    case 'critical': return 5;
    case 'serious':  return 4;
    case 'moderate': return 3;
    default:         return 2;
  }
}

export interface ScanContext {
  scanRunId: string;
  settings: ScanSettings;
  /** Maximum wall-clock time for the entire scan in ms. Default 540 000 (9 min). */
  maxScanTimeMs?: number;
}

/**
 * Run a complete website scan
 */
export async function runScan(ctx: ScanContext): Promise<void> {
  const { scanRunId, settings } = ctx;
  const startTime = Date.now();

  // ── Timeout handling ───────────────────────────────────────────────────
  // Default 9 minutes (540 s), giving a 1-minute safety margin under
  // Vercel's 10-minute serverless function limit.
  const scanDeadline = startTime + (ctx.maxScanTimeMs ?? 540_000);
  const SAFETY_MARGIN_MS = 30_000; // 30 s buffer before hard deadline
  const completedPhases: string[] = [];

  /** Returns true when we should stop adding new phases. */
  function isNearDeadline(): boolean {
    return Date.now() > scanDeadline - SAFETY_MARGIN_MS;
  }

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

    // Helper: determine if a crawl result is an HTML page (not JSON API, redirect, etc.)
    const isHtmlPage = (r: CrawlResult): boolean => {
      if (r.error) return false;
      const ct = r.contentType?.toLowerCase() ?? '';
      // Must have text/html content type (or be empty, which typically means HTML)
      const isHtmlContentType = !ct || ct.includes('text/html') || ct.includes('application/xhtml+xml');
      if (!isHtmlContentType) return false;
      // Skip pages with very low word count that look like JSON/API responses
      return !(r.wordCount === 0 && r.html.trim().startsWith('{'));
    };

    const htmlPages = crawlResults.filter(isHtmlPage);

    // Save page results (batch insert)
    const pageRows = crawlResults.map((result) => ({
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
    }));

    if (pageRows.length > 0) {
      const { error: pageError } = await supabaseAdmin
        .from('PageResult')
        .insert(pageRows);
      if (pageError) throw pageError;
    }

    completedPhases.push('crawl');

    // ─────────────────────────────────────────────────────────────────────────
    // Early robots.txt fetch for Disallow patterns (used in SEO downgrade)
    // ─────────────────────────────────────────────────────────────────────────
    let disallowPatterns: string[] = [];
    try {
      const robotsUrl = `${new URL(normalizedUrl).origin}/robots.txt`;
      const robotsRes = await fetch(robotsUrl, {
        headers: { 'User-Agent': 'SiteSheriffBot/1.0' },
        signal: AbortSignal.timeout(3000),
      });
      if (robotsRes.ok) {
        const robotsContent = await robotsRes.text();
        disallowPatterns = parseDisallowPatterns(robotsContent);
      }
    } catch {
      // robots.txt unavailable - proceed without disallow patterns
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
      category: 'SEO' | 'ACCESSIBILITY' | 'PERFORMANCE' | 'LINKS' | 'CONTENT' | 'SECURITY';
      title: string;
      whyItMatters: string | null;
      howToFix: string | null;
      evidence: object;
      impact: number | null;
      effort: number | null;
    }> = [];

    for (const result of htmlPages) {
      if (!result.error) {
        const seoIssues = checkSEO(result, disallowPatterns);
        allIssues.push(...seoIssues);

        const structuredDataIssues = checkStructuredData(result);
        allIssues.push(...structuredDataIssues);

        const anchorTextIssues = checkAnchorText(result);
        allIssues.push(...anchorTextIssues);
      }
    }

    // SPA detection on homepage (first crawl result)
    if (htmlPages.length > 0 && !htmlPages[0].error) {
      const spaIssues = checkSPARendering(htmlPages[0]);
      allIssues.push(...spaIssues);
    }

    completedPhases.push('seo');

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 2a-content: Content quality checks
    // ─────────────────────────────────────────────────────────────────────────
    if (!isNearDeadline()) {
      for (const result of htmlPages) {
        if (!result.error) {
          const contentIssues = checkContentQuality(result);
          allIssues.push(...contentIssues);
        }
      }
      completedPhases.push('content');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 2a-eeat: E-E-A-T and advanced SEO checks
    // ─────────────────────────────────────────────────────────────────────────
    if (!isNearDeadline()) {
      for (const result of htmlPages) {
        if (!result.error) {
          const eeatIssues = checkEEAT(result);
          allIssues.push(...eeatIssues);
        }
      }
      completedPhases.push('eeat');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 2a-ai: AI readiness checks (SearchGPT, Perplexity, Claude)
    // ─────────────────────────────────────────────────────────────────────────
    if (!isNearDeadline()) {
      for (const result of htmlPages) {
        if (!result.error) {
          const aiIssues = checkAIReadiness(result);
          allIssues.push(...aiIssues);
        }
      }

      // Site-level: check for llms.txt (AI crawler instructions)
      try {
        const llmsTxtIssues = await checkLlmsTxt(normalizedUrl);
        allIssues.push(...llmsTxtIssues);
      } catch {
        console.warn('llms.txt check failed');
      }

      // Site-level: check if AI crawlers are blocked in robots.txt
      try {
        const aiCrawlerIssues = await checkAICrawlerAccess(normalizedUrl);
        allIssues.push(...aiCrawlerIssues);
      } catch {
        console.warn('AI crawler access check failed');
      }

      completedPhases.push('ai-readiness');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 2a-images: Image optimization checks
    // ─────────────────────────────────────────────────────────────────────────
    if (!isNearDeadline()) {
      for (const result of htmlPages) {
        if (!result.error) {
          const imageIssues = checkImageOptimization(result);
          allIssues.push(...imageIssues);
        }
      }
      completedPhases.push('images');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 2a-resources: Resource optimization checks
    // ─────────────────────────────────────────────────────────────────────────
    if (!isNearDeadline()) {
      for (const result of htmlPages) {
        if (!result.error) {
          const resourceIssues = checkResourceOptimization(result);
          allIssues.push(...resourceIssues);
        }
      }
      completedPhases.push('resources');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 2b: Security checks
    //   Security headers are typically site-wide — check homepage only to avoid duplicate issues
    // ─────────────────────────────────────────────────────────────────────────
    const firstGoodResult = htmlPages.find((r) => !r.error);
    if (!isNearDeadline()) {
      if (firstGoodResult) {
        const securityIssues = checkSecurity(firstGoodResult);
        allIssues.push(...securityIssues);
      }

      // Check security.txt (once per scan)
      try {
        const secTxtIssues = await checkSecurityTxt(normalizedUrl);
        allIssues.push(...secTxtIssues);
      } catch {
        console.warn('security.txt check failed');
      }

      // HTTPS redirect check
      if (normalizedUrl.startsWith('https://')) {
        try {
          const httpsIssues = await checkHttpsRedirect(normalizedUrl);
          allIssues.push(...httpsIssues);
        } catch {
          console.warn('HTTPS redirect check failed');
        }
      }
      completedPhases.push('security');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 2c: Robots.txt and sitemap checks
    // ─────────────────────────────────────────────────────────────────────────
    let sitemapUrls: string[] = [];
    if (!isNearDeadline()) {
      try {
        const robotsResult = await checkRobotsSitemap(normalizedUrl);
        allIssues.push(...robotsResult.issues);
        sitemapUrls = robotsResult.sitemapUrls;
      } catch {
        console.warn('Robots/sitemap check failed');
      }
      completedPhases.push('robots-sitemap');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 2d: Tech detection + duplicate content detection
    // ─────────────────────────────────────────────────────────────────────────
    let technologies: Array<{ name: string; category: string; confidence: string; evidence: string }> = [];
    if (!isNearDeadline()) {
      if (crawlResults.length > 0 && !crawlResults[0].error) {
        technologies = detectTechnologies(crawlResults[0]);
      }

      // Duplicate title/description detection (cross-page)
      if (htmlPages.length > 1) {
        const dupeIssues = checkDuplicates(htmlPages);
        allIssues.push(...dupeIssues);

        // Content similarity detection (cross-page)
        const similarityIssues = checkContentSimilarity(htmlPages);
        allIssues.push(...similarityIssues);
      }

      // Validate OG image URLs actually resolve
      try {
        const ogImageIssues = await validateOgImages(htmlPages);
        allIssues.push(...ogImageIssues);
      } catch {
        console.warn('OG image validation failed');
      }

      // Validate canonical URLs actually resolve
      try {
        const canonicalIssues = await validateCanonicals(htmlPages);
        allIssues.push(...canonicalIssues);
      } catch {
        console.warn('Canonical URL validation failed');
      }

      // Validate hreflang bidirectional links (cross-page)
      try {
        const hreflangIssues = validateHreflangBidirectional(htmlPages);
        allIssues.push(...hreflangIssues);
      } catch {
        console.warn('Hreflang bidirectional validation failed');
      }
      completedPhases.push('tech-duplicates');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 2d-links: Internal linking analysis (cross-page)
    // ─────────────────────────────────────────────────────────────────────────
    if (!isNearDeadline() && htmlPages.length > 1) {
      try {
        const linkingIssues = analyzeInternalLinking(htmlPages, normalizedUrl);
        allIssues.push(...linkingIssues);
      } catch {
        console.warn('Internal linking analysis failed');
      }
      completedPhases.push('internal-linking');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 2e: Compression check
    // ─────────────────────────────────────────────────────────────────────────
    if (!isNearDeadline()) {
      try {
        const compressionIssues = await checkCompression(normalizedUrl);
        allIssues.push(...compressionIssues);
      } catch {
        console.warn('Compression check failed');
      }
      completedPhases.push('compression');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 2f: Sitemap ↔ crawl cross-reference
    // ─────────────────────────────────────────────────────────────────────────
    if (!isNearDeadline()) try {
      if (sitemapUrls.length > 0) {
        // Helper to normalize URLs for comparison
        const normalizeForCompare = (u: string): string => {
          try {
            const parsed = new URL(u);
            return (parsed.origin + parsed.pathname).replace(/\/+$/, '').toLowerCase();
          } catch {
            return u.replace(/\/+$/, '').toLowerCase();
          }
        };

        const sitemapNormalized = new Set(sitemapUrls.map(normalizeForCompare));
        const crawledMap = new Map<string, { url: string; statusCode: number; error?: string }>();
        for (const r of crawlResults) {
          crawledMap.set(normalizeForCompare(r.url), {
            url: r.url,
            statusCode: r.statusCode,
            error: r.error,
          });
        }

        // (a) Sitemap URLs that were crawled and returned error status
        for (const smUrl of sitemapUrls) {
          const norm = normalizeForCompare(smUrl);
          const crawled = crawledMap.get(norm);
          if (crawled && crawled.statusCode >= 400) {
            allIssues.push({
              code: 'sitemap_url_broken',
              severity: 'P1',
              category: 'SEO',
              title: `Sitemap URL returns ${crawled.statusCode}`,
              whyItMatters:
                'URLs in your sitemap should be valid, indexable pages. Broken URLs waste search engine crawl budget and signal a poorly maintained site.',
              howToFix:
                'Remove the broken URL from your sitemap.xml, or fix the page so it returns a 200 status.',
              evidence: {
                url: crawled.url,
                httpStatus: crawled.statusCode,
                sitemapUrl: smUrl,
              },
              impact: 4,
              effort: 1,
            });
          }
        }

        // (b) Sitemap URLs not reached by crawler
        for (const smUrl of sitemapUrls) {
          const norm = normalizeForCompare(smUrl);
          if (!crawledMap.has(norm)) {
            allIssues.push({
              code: 'sitemap_url_not_crawled',
              severity: 'P2',
              category: 'SEO',
              title: 'Sitemap URL was not reached by crawler',
              whyItMatters:
                'This URL is listed in your sitemap but was not reachable from any page during the crawl. It may be an orphan page with no internal links pointing to it.',
              howToFix:
                'Add internal links to this page from other pages on your site, or remove it from the sitemap if it is no longer relevant.',
              evidence: { url: smUrl },
              impact: 3,
              effort: 1,
            });
          }
        }

        // (c) Crawled pages missing from sitemap (status 200-399, not the homepage)
        const homepageNormalized = normalizeForCompare(normalizedUrl);
        for (const result of crawlResults) {
          if (result.error || result.statusCode < 200 || result.statusCode >= 400) continue;
          const norm = normalizeForCompare(result.url);
          if (norm === homepageNormalized) continue;
          if (!sitemapNormalized.has(norm)) {
            allIssues.push({
              code: 'page_not_in_sitemap',
              severity: 'P3',
              category: 'SEO',
              title: 'Crawled page not found in sitemap',
              whyItMatters:
                'Pages accessible on your site but missing from the sitemap may be discovered more slowly by search engines.',
              howToFix:
                'Add this page to your sitemap.xml if it should be indexed.',
              evidence: { url: result.url },
              impact: 2,
              effort: 1,
            });
          }
        }
      }
      completedPhases.push('sitemap-xref');
    } catch {
      console.warn('Sitemap cross-reference check failed');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 2g: Server response time (TTFB) check
    // ─────────────────────────────────────────────────────────────────────────
    if (!isNearDeadline()) {
      for (const result of htmlPages) {
        if (result.ttfbMs !== null && result.ttfbMs !== undefined) {
          if (result.ttfbMs > 2000) {
            allIssues.push({
              code: 'slow_server_response',
              severity: 'P1',
              category: 'PERFORMANCE',
              title: 'Slow server response time (TTFB)',
              whyItMatters: `Server took ${result.ttfbMs}ms to respond. Google recommends a TTFB under 800ms for good user experience.`,
              howToFix: 'Optimize server-side processing, use caching (Redis, CDN edge caching), enable streaming, or upgrade hosting.',
              evidence: { url: result.url, ttfbMs: result.ttfbMs },
              impact: 4,
              effort: 3,
            });
          } else if (result.ttfbMs > 800) {
            allIssues.push({
              code: 'moderate_server_response',
              severity: 'P2',
              category: 'PERFORMANCE',
              title: 'Moderate server response time (TTFB)',
              whyItMatters: `Server took ${result.ttfbMs}ms to respond. Aim for under 800ms TTFB for optimal Core Web Vitals.`,
              howToFix: 'Consider server-side caching, a CDN, or reducing backend processing time.',
              evidence: { url: result.url, ttfbMs: result.ttfbMs },
              impact: 3,
              effort: 3,
            });
          }
        }
      }
      completedPhases.push('ttfb');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 2h: JavaScript console error detection
    // ─────────────────────────────────────────────────────────────────────────
    if (!isNearDeadline()) {
      for (const result of htmlPages) {
        if (result.consoleErrors && result.consoleErrors.length > 0) {
          allIssues.push({
            code: 'js_console_errors',
            severity: result.consoleErrors.length >= 5 ? 'P1' : 'P2',
            category: 'PERFORMANCE',
            title: 'JavaScript console errors detected',
            whyItMatters: `${result.consoleErrors.length} JavaScript error(s) found. Console errors indicate broken functionality, failed API calls, or missing resources that degrade user experience.`,
            howToFix: 'Open the browser developer console, reproduce the errors, and fix the underlying issues in your JavaScript code.',
            evidence: { url: result.url, errorCount: result.consoleErrors.length, errors: result.consoleErrors.slice(0, 5) },
            impact: 4,
            effort: 3,
          });
        }
      }
      completedPhases.push('console-errors');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 3: Check broken links
    // ─────────────────────────────────────────────────────────────────────────

    // Collect all links with source attribution
    const allLinks: LinkData[] = crawlResults.flatMap((r) => r.links);

    // Build a map: target URL → source pages that link to it
    const linkSourceMap = new Map<string, Set<string>>();
    for (const link of allLinks) {
      if (!linkSourceMap.has(link.href)) {
        linkSourceMap.set(link.href, new Set());
      }
      if (link.sourceUrl) {
        linkSourceMap.get(link.href)!.add(link.sourceUrl);
      }
    }

    if (!isNearDeadline()) {
      // Dedupe links by href for HTTP checking
      const uniqueByHref = Array.from(new Map(allLinks.map((l) => [l.href, l])).values());
      const internalLinks = uniqueByHref.filter((l) => l.isInternal);
      const externalLinks = uniqueByHref.filter((l) => !l.isInternal);

      // Check internal links + a sample of external links
      const linksToCheck = [
        ...internalLinks.slice(0, 100),
        ...externalLinks.slice(0, 20),
      ];
      const linkResults = await checkLinks(linksToCheck);
      const brokenLinks = findBrokenLinks(linkResults);

      for (const broken of brokenLinks) {
        const foundOnPages = [...(linkSourceMap.get(broken.href) ?? [])];
        // Downgrade external links that return 403 or connection error to P3 (info)
        // These are often false positives from bot-blocking WAFs
        const isExternal = !broken.isInternal;
        const isSoftFailure = broken.statusCode === 403 || broken.statusCode === 0;
        let severity: 'P0' | 'P1' | 'P2' | 'P3';
        if (isExternal && isSoftFailure) {
          severity = 'P3';
        } else if (broken.statusCode === 404) {
          severity = 'P1';
        } else {
          severity = 'P2';
        }
        let howToFixMsg: string;
        if (broken.statusCode === 404) {
          howToFixMsg = 'Remove the link or update it to point to a valid page.';
        } else if (isExternal && isSoftFailure) {
          howToFixMsg = 'This external link may be blocking bots. Verify manually in a browser.';
        } else {
          howToFixMsg = 'Check the target server status and fix any connectivity issues.';
        }
        allIssues.push({
          code: 'broken_link',
          severity,
          category: 'LINKS',
          title: `Broken link (${broken.statusCode || 'connection error'})`,
          whyItMatters: 'Broken links frustrate users and can hurt SEO. Search engines may penalize sites with many broken links.',
          howToFix: howToFixMsg,
          evidence: {
            url: broken.href,
            httpStatus: broken.statusCode,
            error: broken.error,
            linkText: broken.text,
            foundOnPages: foundOnPages.length > 0 ? foundOnPages : undefined,
          },
          impact: isExternal && isSoftFailure ? 2 : 4,
          effort: 1,
        });
      }

      // Detect redirect chains
      const redirectChains = findRedirectChains(linkResults);
      for (const chain of redirectChains) {
        const foundOnPages = [...(linkSourceMap.get(chain.href) ?? [])];
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
            foundOnPages: foundOnPages.length > 0 ? foundOnPages : undefined,
          },
          impact: 3,
          effort: 1,
        });
      }
      completedPhases.push('broken-links');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 3b: Detect internal links to crawled error pages
    //   Cross-reference: pages crawled with 4xx/5xx and which pages link to them
    // ─────────────────────────────────────────────────────────────────────────
    if (!isNearDeadline()) {
      const crawledErrorPages = crawlResults.filter(
        (r) => r.statusCode >= 400 || (r.statusCode === 0 && r.error)
      );
      for (const errorPage of crawledErrorPages) {
        const sourcePages = [...(linkSourceMap.get(errorPage.url) ?? [])];
        if (sourcePages.length > 0) {
          allIssues.push({
            code: 'internal_link_to_error_page',
            severity: errorPage.statusCode === 404 ? 'P1' : 'P2',
            category: 'LINKS',
            title: `Internal link to ${errorPage.statusCode || 'error'} page`,
            whyItMatters: 'Your site has internal links pointing to pages that return error status codes. This creates a poor user experience and wastes search engine crawl budget.',
            howToFix: 'Update or remove the internal links on the source pages listed below, or restore the target page.',
            evidence: {
              url: errorPage.url,
              httpStatus: errorPage.statusCode,
              error: errorPage.error,
              linkedFromPages: sourcePages,
            },
            impact: 4,
            effort: 1,
          });
        }
      }
      completedPhases.push('error-page-links');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 4: Accessibility checks (on first 5 pages to save time)
    //   Requires Playwright + @axe-core/playwright — skip in fetch mode
    // ─────────────────────────────────────────────────────────────────────────
    if (isNearDeadline()) {
      // Skip a11y phase — approaching deadline
    } else if (crawler.isFetchMode) {
      console.info('Skipping accessibility checks (Playwright unavailable)');
      completedPhases.push('accessibility');
    } else {
      const pagesToCheckA11y = crawlResults.slice(0, 5).filter((r) => !r.error);

      for (const page of pagesToCheckA11y) {
        try {
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
              impact: impactToScore(violation.impact),
              effort: 2,
            });
          }
        } catch (error_) {
          console.warn(`Accessibility check failed for ${page.url}:`, error_);
        }
      }

      // Mobile viewport a11y check (homepage only)
      const homepageA11y = crawlResults[0];
      if (homepageA11y && !homepageA11y.error) {
        try {
          const mobileA11y = await checkAccessibility(homepageA11y.url, {
            viewport: { width: 375, height: 812 },
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          });

          // Only report violations that are NEW in mobile (not already found in desktop)
          const desktopCodes = new Set(allIssues.filter(i => i.category === 'ACCESSIBILITY').map(i => i.code));
          for (const violation of mobileA11y.violations) {
            const code = `a11y_mobile_${violation.id}`;
            if (!desktopCodes.has(`a11y_${violation.id}`)) {
              allIssues.push({
                code,
                severity: mapImpactToSeverity(violation.impact),
                category: 'ACCESSIBILITY',
                title: `[Mobile] ${violation.help}`,
                whyItMatters: `This accessibility issue appears only at mobile viewport sizes. ${violation.description}`,
                howToFix: `See ${violation.helpUrl} for guidance. Ensure responsive layouts maintain accessibility.`,
                evidence: {
                  url: homepageA11y.url,
                  viewport: '375x812 (mobile)',
                  nodes: violation.nodes.slice(0, 3),
                },
                impact: impactToScore(violation.impact),
                effort: 2,
              });
            }
          }
        } catch (error_) {
          console.warn('Mobile accessibility check failed:', error_);
        }
      }
      completedPhases.push('accessibility');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 5: Performance checks
    //   Requires Playwright CDP — skip in fetch mode
    // ─────────────────────────────────────────────────────────────────────────
    if (isNearDeadline()) {
      // Skip performance phase — approaching deadline
    } else if (settings.includePerformance && !crawler.isFetchMode) {
      await updateProgress(scanRunId, {
        pagesDiscovered: crawlResults.length,
        pagesScanned: crawlResults.length,
        checksCompleted: allIssues.length,
        stage: 'performance',
      });

      // Check performance on homepage + up to 2 more pages
      const pagesToCheckPerf = crawlResults.slice(0, 3).filter((r) => !r.error);

      for (const pageResult of pagesToCheckPerf) {
        let perfResult;
        try {
          perfResult = await checkPerformance(pageResult.url);
        } catch (error_) {
          console.warn(`Performance check failed for ${pageResult.url}:`, error_);
          continue;
        }

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
        const lcpElementDesc = m.lcpElement
          ? ` The LCP element is <${m.lcpElement.tagName}>${m.lcpElement.id ? ` #${m.lcpElement.id}` : ''}${m.lcpElement.src ? ` (${m.lcpElement.src.slice(0, 80)})` : ''}`
          : '';
        if (m.largestContentfulPaint !== null && m.largestContentfulPaint > 4000) {
          allIssues.push({
            code: 'slow_lcp',
            severity: 'P1',
            category: 'PERFORMANCE',
            title: `Slow Largest Contentful Paint (${m.largestContentfulPaint}ms)`,
            whyItMatters: 'Largest Contentful Paint measures when the largest content element becomes visible. LCP above 4s is rated poor by Core Web Vitals.',
            howToFix: `Optimize the largest image or text block on the page.${lcpElementDesc} Use responsive images, preload hero images, and reduce server response time.`,
            evidence: { url: pageResult.url, lcp: m.largestContentfulPaint, lcpElement: m.lcpElement },
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
            howToFix: `Preload the LCP element and optimize images with modern formats (WebP/AVIF).${lcpElementDesc} Use a CDN for static assets.`,
            evidence: { url: pageResult.url, lcp: m.largestContentfulPaint, lcpElement: m.lcpElement },
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

        // INP (Interaction to Next Paint) issues
        // Good: <200ms, Needs Improvement: 200-500ms, Poor: >500ms
        if (m.interactionToNextPaint !== null && m.interactionToNextPaint > 500) {
          allIssues.push({
            code: 'slow_inp',
            severity: 'P1',
            category: 'PERFORMANCE',
            title: `Slow Interaction to Next Paint (${m.interactionToNextPaint}ms)`,
            whyItMatters: 'INP above 500ms means the page is unresponsive to user interactions. This is a Core Web Vital that directly impacts user experience and SEO rankings.',
            howToFix: 'Reduce JavaScript execution time, break up long tasks, optimize event handlers, and consider using web workers for heavy computations.',
            evidence: { url: pageResult.url, inp: m.interactionToNextPaint },
            impact: 4,
            effort: 3,
          });
        } else if (m.interactionToNextPaint !== null && m.interactionToNextPaint > 200) {
          allIssues.push({
            code: 'moderate_inp',
            severity: 'P2',
            category: 'PERFORMANCE',
            title: `Interaction to Next Paint needs improvement (${m.interactionToNextPaint}ms)`,
            whyItMatters: 'INP between 200-500ms indicates the page could be more responsive. This is a Core Web Vital metric that affects search ranking and user satisfaction.',
            howToFix: 'Optimize event handlers, reduce main thread blocking, use requestIdleCallback for non-critical work, and consider code splitting.',
            evidence: { url: pageResult.url, inp: m.interactionToNextPaint },
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

      // Mobile viewport perf check (homepage only)
      const homepagePerf = crawlResults[0];
      if (homepagePerf && !homepagePerf.error) {
        try {
          const mobilePerf = await checkPerformance(homepagePerf.url, {
            viewport: { width: 375, height: 812 },
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          });
          const mm = mobilePerf.metrics;

          if (mm.firstContentfulPaint !== null && mm.firstContentfulPaint > 3000) {
            allIssues.push({
              code: 'mobile_slow_fcp',
              severity: 'P1',
              category: 'PERFORMANCE',
              title: `[Mobile] Slow First Contentful Paint (${mm.firstContentfulPaint}ms)`,
              whyItMatters: 'Mobile devices typically have slower processors and network connections. A slow FCP on mobile means most of your users see a blank screen for too long.',
              howToFix: 'Optimize critical rendering path for mobile. Reduce CSS/JS payloads, use responsive images, and consider AMP or lighter mobile alternatives.',
              evidence: { url: homepagePerf.url, fcp: mm.firstContentfulPaint, viewport: '375x812 (mobile)' },
              impact: 4,
              effort: 3,
            });
          }

          if (mm.largestContentfulPaint !== null && mm.largestContentfulPaint > 4000) {
            const mobileLcpDesc = mm.lcpElement
              ? ` The LCP element is <${mm.lcpElement.tagName}>${mm.lcpElement.id ? ` #${mm.lcpElement.id}` : ''}${mm.lcpElement.src ? ` (${mm.lcpElement.src.slice(0, 80)})` : ''}`
              : '';
            allIssues.push({
              code: 'mobile_slow_lcp',
              severity: 'P1',
              category: 'PERFORMANCE',
              title: `[Mobile] Slow Largest Contentful Paint (${mm.largestContentfulPaint}ms)`,
              whyItMatters: 'Mobile LCP above 4s is rated poor by Core Web Vitals. Over 60% of web traffic is mobile — this directly impacts your largest audience.',
              howToFix: `Serve appropriately sized images for mobile, use srcset/sizes attributes, preload hero images, and reduce server response time.${mobileLcpDesc}`,
              evidence: { url: homepagePerf.url, lcp: mm.largestContentfulPaint, lcpElement: mm.lcpElement, viewport: '375x812 (mobile)' },
              impact: 5,
              effort: 3,
            });
          }

          if (mm.cumulativeLayoutShift !== null && mm.cumulativeLayoutShift > 0.25) {
            allIssues.push({
              code: 'mobile_poor_cls',
              severity: 'P1',
              category: 'PERFORMANCE',
              title: `[Mobile] Poor Cumulative Layout Shift (${mm.cumulativeLayoutShift})`,
              whyItMatters: 'Layout shifts are especially disruptive on mobile where the viewport is small. Elements jumping around causes accidental taps and frustration.',
              howToFix: 'Set explicit dimensions on images/ads, avoid dynamically inserted content above the fold, and use CSS contain on mobile layouts.',
              evidence: { url: homepagePerf.url, cls: mm.cumulativeLayoutShift, viewport: '375x812 (mobile)' },
              impact: 4,
              effort: 2,
            });
          }

          // Mobile INP check
          if (mm.interactionToNextPaint !== null && mm.interactionToNextPaint > 500) {
            allIssues.push({
              code: 'mobile_slow_inp',
              severity: 'P1',
              category: 'PERFORMANCE',
              title: `[Mobile] Slow Interaction to Next Paint (${mm.interactionToNextPaint}ms)`,
              whyItMatters: 'Mobile devices have slower processors, making responsiveness even more critical. INP above 500ms on mobile means users experience significant lag when interacting.',
              howToFix: 'Reduce JavaScript execution time on mobile, defer non-critical scripts, optimize touch event handlers, and minimize main thread blocking.',
              evidence: { url: homepagePerf.url, inp: mm.interactionToNextPaint, viewport: '375x812 (mobile)' },
              impact: 4,
              effort: 3,
            });
          }

          if (mm.loadTime !== null && mm.loadTime > 8000) {
            allIssues.push({
              code: 'mobile_slow_load',
              severity: 'P2',
              category: 'PERFORMANCE',
              title: `[Mobile] Very slow page load (${mm.loadTime}ms)`,
              whyItMatters: 'Mobile pages that take over 8 seconds to load have extremely high bounce rates. Google uses mobile page speed as a ranking factor.',
              howToFix: 'Reduce total page weight for mobile, enable compression, lazy load below-fold content, and consider a mobile-specific optimization strategy.',
              evidence: { url: homepagePerf.url, loadTime: mm.loadTime, viewport: '375x812 (mobile)' },
              impact: 3,
              effort: 3,
            });
          }
        } catch (error_) {
          console.warn('Mobile performance check failed:', error_);
        }
      }
      completedPhases.push('performance');
    } else if (settings.includePerformance && crawler.isFetchMode) {
      console.info('Skipping performance checks (Playwright unavailable)');
      completedPhases.push('performance');
    } else {
      // Performance disabled by user — still mark complete (not timed out)
      completedPhases.push('performance');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Timeout partial results: add info issue if phases were skipped
    // ─────────────────────────────────────────────────────────────────────────
    const allPhaseNames = [
      'crawl', 'seo', 'content', 'eeat', 'ai-readiness', 'images', 'resources', 'security',
      'robots-sitemap', 'tech-duplicates', 'internal-linking', 'compression',
      'sitemap-xref', 'ttfb', 'console-errors', 'broken-links',
      'error-page-links', 'accessibility', 'performance',
    ];
    const skippedPhases = allPhaseNames.filter((p) => !completedPhases.includes(p));
    if (skippedPhases.length > 0) {
      allIssues.push({
        code: 'scan_timeout_partial',
        severity: 'P3',
        category: 'PERFORMANCE',
        title: 'Scan completed with partial results',
        whyItMatters:
          'The scan was approaching its time limit and some checks were skipped to ensure results were saved.',
        howToFix:
          'Try scanning fewer pages or reducing the scan depth.',
        evidence: {
          completedPhases,
          skippedPhases,
          elapsedMs: Date.now() - startTime,
          deadlineMs: ctx.maxScanTimeMs ?? 540_000,
        },
        impact: 1,
        effort: 1,
      });
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

    // Save issues to database (batch insert)
    const issueRows = uniqueIssues.map((issue) => ({
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
    }));

    if (issueRows.length > 0) {
      const { error: issueError } = await supabaseAdmin
        .from('Issue')
        .insert(issueRows);
      if (issueError) throw issueError;
    }

    // Compute summary
    const summary = computeSummary(uniqueIssues, crawlResults, Date.now() - startTime, technologies);

    // Generate client email draft
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'https://site-sheriff.vercel.app';
    const reportUrl = `${siteUrl}/scan/${scanRunId}`;
    const clientEmailDraft = generateEmailDraft(
      scanRun.inputUrl,
      summary,
      uniqueIssues,
      reportUrl
    );

    // Update scan run with success
    await supabaseAdmin
      .from('ScanRun')
      .update({
        status: 'SUCCEEDED',
        summary: summary,
        clientEmailDraft: clientEmailDraft,
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

// Severity-weighted penalty points per unique issue type
const SEVERITY_PENALTY: Record<string, number> = { P0: 20, P1: 8, P2: 3, P3: 1 };

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
function computeCategoryScore(
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

function computeSummary(
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
      const severityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
      const severityDiff = (severityOrder[a.severity as keyof typeof severityOrder] || 4) -
        (severityOrder[b.severity as keyof typeof severityOrder] || 4);
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
    favicon: null as string | null,
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
