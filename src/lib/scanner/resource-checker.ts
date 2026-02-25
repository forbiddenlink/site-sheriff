import * as cheerio from 'cheerio';
import type { CrawlResult } from './crawler';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ResourceIssue {
  code: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  category: 'SEO' | 'ACCESSIBILITY' | 'PERFORMANCE' | 'LINKS' | 'CONTENT' | 'SECURITY';
  title: string;
  whyItMatters: string;
  howToFix: string;
  evidence: {
    url: string;
    details: string;
  };
  impact: number;
  effort: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Threshold for flagging render-blocking stylesheets. */
const MAX_RENDER_BLOCKING_CSS = 3;

/** Threshold for total external resources (scripts + stylesheets + images). */
const MAX_HTTP_REQUESTS = 40;

/** Minimum char count for inline code to be evaluated for minification. */
const MIN_INLINE_CHARS = 500;

/** If average line length falls below this, inline code is likely unminified. */
const MIN_AVG_LINE_LENGTH = 40;

/** Regex to detect Google Fonts URLs. */
const GOOGLE_FONTS_RE = /fonts\.googleapis\.com/i;

// ─────────────────────────────────────────────────────────────────────────────
// Sub-checks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect render-blocking `<link rel="stylesheet">` tags in `<head>`.
 *
 * A stylesheet is considered render-blocking when it appears in the `<head>`
 * without a specific `media` attribute (e.g. `media="print"`) and is not
 * loaded via `rel="preload"`. Pages with more than 3 such stylesheets are
 * flagged.
 */
function checkRenderBlockingCss($: cheerio.CheerioAPI, url: string): ResourceIssue[] {
  const blocking: string[] = [];

  $('head link[rel="stylesheet"]').each((_i, el) => {
    const media = $(el).attr('media')?.trim().toLowerCase() ?? '';
    // media="" or media="all" are render-blocking; specific values like "print" are not
    const isGenericMedia = !media || media === 'all';
    if (isGenericMedia) {
      const href = $(el).attr('href') ?? '<unknown>';
      blocking.push(href);
    }
  });

  if (blocking.length <= MAX_RENDER_BLOCKING_CSS) return [];

  return [{
    code: 'render_blocking_css',
    severity: 'P2' as const,
    category: 'PERFORMANCE' as const,
    title: 'Too many render-blocking stylesheets',
    whyItMatters:
      'Render-blocking CSS delays First Contentful Paint because the browser must download and parse every blocking stylesheet before painting.',
    howToFix:
      'Inline critical CSS and load remaining stylesheets asynchronously via media="print" onload trick, rel="preload", or deferred loading.',
    evidence: {
      url,
      details: `${blocking.length} render-blocking stylesheet(s) in <head>: ${blocking.slice(0, 5).join(', ')}`,
    },
    impact: 4,
    effort: 3,
  }];
}

/**
 * Detect render-blocking `<script src="...">` tags in `<head>` that lack
 * `async` or `defer`.
 *
 * Synchronous scripts in the `<head>` block HTML parsing until they are
 * downloaded and executed.
 */
function checkRenderBlockingJs($: cheerio.CheerioAPI, url: string): ResourceIssue[] {
  const blocking: string[] = [];

  $('head script[src]').each((_i, el) => {
    const hasAsync = $(el).attr('async') !== undefined;
    const hasDefer = $(el).attr('defer') !== undefined;
    if (!hasAsync && !hasDefer) {
      const src = $(el).attr('src') ?? '<unknown>';
      // Skip framework scripts that must be synchronous (React hydration, etc.)
      if (/\/_next\/|__next|__NEXT|__nuxt|nuxt\.js|chunks\/framework|chunks\/webpack/i.test(src)) return;
      blocking.push(src);
    }
  });

  if (blocking.length === 0) return [];

  return [{
    code: 'render_blocking_js',
    severity: 'P2' as const,
    category: 'PERFORMANCE' as const,
    title: 'Render-blocking JavaScript in <head>',
    whyItMatters:
      'Synchronous scripts in the <head> block HTML parsing, delaying First Contentful Paint and time-to-interactive.',
    howToFix:
      'Add async or defer to <script> tags, or move them to the end of the <body>.',
    evidence: {
      url,
      details: `${blocking.length} synchronous script(s) in <head>: ${blocking.slice(0, 5).join(', ')}`,
    },
    impact: 4,
    effort: 2,
  }];
}

/**
 * Detect the absence of resource hints (`<link rel="preload">` or
 * `<link rel="preconnect">`).
 *
 * Resource hints allow the browser to begin fetching critical assets or
 * establishing connections earlier, improving perceived performance.
 */
function checkPreloadHints($: cheerio.CheerioAPI, url: string): ResourceIssue[] {
  const hasPreload = $('link[rel="preload"]').length > 0;
  const hasPreconnect = $('link[rel="preconnect"]').length > 0;

  if (hasPreload || hasPreconnect) return [];

  return [{
    code: 'no_preload_hints',
    severity: 'P3' as const,
    category: 'PERFORMANCE' as const,
    title: 'No resource preloading or preconnect hints',
    whyItMatters:
      'Without rel="preload" or rel="preconnect" the browser cannot begin fetching critical resources until it discovers them during parsing, adding latency.',
    howToFix:
      'Add <link rel="preload"> for critical fonts, hero images, or key scripts. Add <link rel="preconnect"> for important third-party origins.',
    evidence: {
      url,
      details: 'No <link rel="preload"> or <link rel="preconnect"> found in the document',
    },
    impact: 2,
    effort: 1,
  }];
}

/**
 * Count total external resources (`<script src>`, `<link rel="stylesheet">`,
 * `<img src>`) and flag pages that exceed the threshold.
 *
 * A high number of HTTP requests increases connection overhead and contention,
 * particularly on slower networks.
 */
function checkExcessiveRequests($: cheerio.CheerioAPI, url: string): ResourceIssue[] {
  const scripts = $('script[src]').length;
  const stylesheets = $('link[rel="stylesheet"][href]').length;
  const images = $('img[src]').length;
  const total = scripts + stylesheets + images;

  if (total <= MAX_HTTP_REQUESTS) return [];

  return [{
    code: 'excessive_http_requests',
    severity: 'P2' as const,
    category: 'PERFORMANCE' as const,
    title: 'Too many HTTP requests',
    whyItMatters:
      'Each external resource requires a separate HTTP round-trip. Excessive requests increase total page load time, especially on high-latency connections.',
    howToFix:
      'Bundle or lazy-load scripts, combine stylesheets, use image sprites or inline small assets. Aim for fewer than 40 external resources per page.',
    evidence: {
      url,
      details: `${total} external resources detected (${scripts} scripts, ${stylesheets} stylesheets, ${images} images)`,
    },
    impact: 3,
    effort: 3,
  }];
}

/**
 * Detect missing `font-display` strategy in `@font-face` declarations and
 * Google Fonts URLs.
 *
 * Without `font-display: swap` (or `optional` / `fallback`) the browser may
 * show invisible text (FOIT) until fonts finish loading, hurting perceived
 * performance and CLS.
 */
function checkFontDisplay($: cheerio.CheerioAPI, url: string): ResourceIssue[] {
  const problems: string[] = [];

  // Check inline <style> blocks for @font-face without font-display
  $('style').each((_i, el) => {
    const css = $(el).text();
    const fontFaceBlocks = css.match(/@font-face\s*\{[^}]*\}/gi);
    if (!fontFaceBlocks) return;

    for (const block of fontFaceBlocks) {
      const hasFontDisplay = /font-display\s*:\s*(swap|optional|fallback)/i.test(block);
      if (!hasFontDisplay) {
        // Extract font-family if possible for evidence
        const familyMatch = /font-family\s*:\s*['"]?([^'";}\n]+)/i.exec(block);
        const family = familyMatch?.[1]?.trim() ?? 'unknown';
        problems.push(`@font-face "${family}" in inline <style> missing font-display`);
      }
    }
  });

  // Check Google Fonts URLs without &display=swap
  $('link[href]').each((_i, el) => {
    const href = $(el).attr('href') ?? '';
    if (GOOGLE_FONTS_RE.test(href) && !/[&?]display=swap/i.test(href)) {
      problems.push(`Google Fonts link without display=swap: ${href.slice(0, 120)}`);
    }
  });

  if (problems.length === 0) return [];

  return [{
    code: 'missing_font_display',
    severity: 'P3' as const,
    category: 'PERFORMANCE' as const,
    title: 'Missing font-display strategy',
    whyItMatters:
      'Without font-display: swap (or optional/fallback) the browser may render invisible text (FOIT) while fonts load, harming perceived performance and Cumulative Layout Shift.',
    howToFix:
      'Add font-display: swap to all @font-face declarations. For Google Fonts, append &display=swap to the URL.',
    evidence: {
      url,
      details: problems.slice(0, 5).join('; '),
    },
    impact: 3,
    effort: 1,
  }];
}

/** Minimum dimensions to consider an image as potential LCP candidate. */
const LCP_MIN_WIDTH = 200;
const LCP_MIN_HEIGHT = 200;

/**
 * Detect when the likely LCP image is not preloaded.
 *
 * The first large image on the page is typically the LCP element.
 * Preloading it allows the browser to fetch it earlier, improving LCP scores.
 */
function checkLcpImagePreload($: cheerio.CheerioAPI, url: string): ResourceIssue[] {
  // Find all images with dimensions
  const images = $('img[src]').toArray();
  if (images.length === 0) return [];

  // Find the first "large" image (likely LCP candidate)
  let lcpCandidate: { src: string; width: number; height: number } | null = null;

  for (const img of images) {
    const src = $(img).attr('src') ?? '';
    const width = Number.parseInt($(img).attr('width') ?? '0', 10);
    const height = Number.parseInt($(img).attr('height') ?? '0', 10);

    // Skip small images, data URIs, and SVGs
    if (src.startsWith('data:') || src.endsWith('.svg')) continue;
    if (width < LCP_MIN_WIDTH && height < LCP_MIN_HEIGHT) continue;

    // Found a large image - this is our LCP candidate
    lcpCandidate = { src, width, height };
    break;
  }

  if (!lcpCandidate) return [];

  // Check if this image has a preload hint
  const preloads = $('link[rel="preload"][as="image"]').toArray();
  const isPreloaded = preloads.some((link) => {
    const href = $(link).attr('href') ?? '';
    const imagesrcset = $(link).attr('imagesrcset') ?? '';
    // Check if preload matches the LCP image src
    return href === lcpCandidate.src || imagesrcset.includes(lcpCandidate.src);
  });

  if (isPreloaded) return [];

  return [{
    code: 'lcp_image_not_preloaded',
    severity: 'P2' as const,
    category: 'PERFORMANCE' as const,
    title: 'LCP image candidate is not preloaded',
    whyItMatters:
      'The Largest Contentful Paint (LCP) image is discovered late during HTML parsing. Preloading it allows the browser to fetch it earlier, improving LCP scores.',
    howToFix:
      'Add <link rel="preload" as="image" href="..."> in the <head> for your hero/LCP image. For responsive images, use imagesrcset and imagesizes attributes.',
    evidence: {
      url,
      details: `Hero image "${lcpCandidate.src}" (${lcpCandidate.width}×${lcpCandidate.height}) lacks preload hint`,
    },
    impact: 4,
    effort: 1,
  }];
}

/**
 * Detect unminified inline `<script>` and `<style>` blocks.
 *
 * Uses a simple heuristic: if an inline block has more than 500 characters
 * and an average line length below 40, it is likely unminified (minified code
 * is typically a single very long line).
 */
function checkUnminifiedInlineCode($: cheerio.CheerioAPI, url: string): ResourceIssue[] {
  const unminified: string[] = [];

  // Check inline scripts (no src attribute = inline)
  $('script:not([src])').each((_i, el) => {
    // Skip framework data scripts (e.g., Next.js __NEXT_DATA__, JSON-LD)
    const scriptId = $(el).attr('id') ?? '';
    const scriptType = $(el).attr('type') ?? '';
    if (scriptId === '__NEXT_DATA__' || scriptType === 'application/json' || scriptType === 'application/ld+json') return;

    const content = $(el).text().trim();
    if (content.length < MIN_INLINE_CHARS) return;

    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return;

    const avgLineLength = content.length / lines.length;
    if (avgLineLength < MIN_AVG_LINE_LENGTH) {
      unminified.push(`<script> (${content.length} chars, avg line ${Math.round(avgLineLength)} chars)`);
    }
  });

  // Check inline styles
  $('style').each((_i, el) => {
    const content = $(el).text().trim();
    if (content.length < MIN_INLINE_CHARS) return;

    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return;

    const avgLineLength = content.length / lines.length;
    if (avgLineLength < MIN_AVG_LINE_LENGTH) {
      unminified.push(`<style> (${content.length} chars, avg line ${Math.round(avgLineLength)} chars)`);
    }
  });

  if (unminified.length === 0) return [];

  return [{
    code: 'unminified_inline_code',
    severity: 'P3' as const,
    category: 'PERFORMANCE' as const,
    title: 'Unminified inline JavaScript or CSS detected',
    whyItMatters:
      'Unminified inline code increases HTML document size, slowing down download and parse time.',
    howToFix:
      'Minify inline <script> and <style> blocks during the build step, or extract them into external bundled files.',
    evidence: {
      url,
      details: `${unminified.length} unminified inline block(s): ${unminified.slice(0, 5).join('; ')}`,
    },
    impact: 2,
    effort: 2,
  }];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyze a crawled page for CSS, JavaScript, and font resource optimization
 * issues.
 *
 * Checks performed:
 * 1. **render_blocking_css** – more than 3 render-blocking stylesheets in `<head>`
 * 2. **render_blocking_js** – synchronous `<script src>` in `<head>` without async/defer
 * 3. **no_preload_hints** – absence of `<link rel="preload">` or `<link rel="preconnect">`
 * 4. **excessive_http_requests** – combined script/style/image count exceeds 40
 * 5. **missing_font_display** – `@font-face` without `font-display: swap` or Google Fonts without `&display=swap`
 * 6. **unminified_inline_code** – inline `<script>` / `<style>` blocks that appear unminified
 *
 * @param result - The crawl result for a single page.
 * @returns An array of issues found (empty if the page is well-optimized).
 */
export function checkResourceOptimization(result: CrawlResult): ResourceIssue[] {
  if (!result.html) return [];
  const $ = cheerio.load(result.html);

  return [
    ...checkRenderBlockingCss($, result.url),
    ...checkRenderBlockingJs($, result.url),
    ...checkPreloadHints($, result.url),
    ...checkLcpImagePreload($, result.url),
    ...checkExcessiveRequests($, result.url),
    ...checkFontDisplay($, result.url),
    ...checkUnminifiedInlineCode($, result.url),
  ];
}
