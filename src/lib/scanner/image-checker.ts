import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { CrawlResult } from './crawler';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ImageIssue {
  code: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  category: 'SEO' | 'ACCESSIBILITY' | 'PERFORMANCE' | 'LINKS' | 'CONTENT' | 'SECURITY';
  title: string;
  whyItMatters: string;
  howToFix: string;
  evidence: {
    url: string;
    actual?: string | null;
    expected?: string;
    snippet?: string;
    src?: string;
    width?: number;
    height?: number;
    count?: number;
    totalBytes?: number;
    webpCount?: number;
  };
  impact: number;
  effort: number;
}

interface ParsedDims {
  w: number;
  h: number;
  hasWidth: boolean;
  hasHeight: boolean;
}

interface FormatState {
  legacy: number;
  total: number;
  samples: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MODERN_FORMATS = /\.(webp|avif)(\?|$)/i;
const LEGACY_FORMATS = /\.(jpe?g|png|gif|bmp|tiff?)(\?|$)/i;
const MAX_DIMENSION = 2000;
const MAX_INLINE_SVG_BYTES = 50_000;
const ABOVE_FOLD_COUNT = 2;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns true when a `<source>` element references a modern format. */
function isModernSource($: cheerio.CheerioAPI, sourceEl: AnyNode): boolean {
  const type = $(sourceEl).attr('type') ?? '';
  const srcset = $(sourceEl).attr('srcset') ?? '';
  return /webp|avif/i.test(type) || MODERN_FORMATS.test(srcset);
}

/** Returns true when the closest `<picture>` wrapper has a modern `<source>`. */
function pictureHasModern($: cheerio.CheerioAPI, el: AnyNode): boolean {
  const picture = $(el).closest('picture');
  if (picture.length === 0) return false;
  return picture.find('source').toArray().some((s) => isModernSource($, s));
}

/** Parse width/height from an element's attributes. */
function parseDimensions($: cheerio.CheerioAPI, el: AnyNode): ParsedDims {
  const w = Number.parseInt($(el).attr('width') ?? '', 10);
  const h = Number.parseInt($(el).attr('height') ?? '', 10);
  return { w, h, hasWidth: !Number.isNaN(w), hasHeight: !Number.isNaN(h) };
}

/** True when at least one dimension exceeds the threshold. */
function isOversized(dims: ParsedDims): boolean {
  if (dims.hasWidth && dims.w > MAX_DIMENSION) return true;
  return dims.hasHeight && dims.h > MAX_DIMENSION;
}

/** Human-readable dimension label for evidence. */
function formatDimLabel(src: string, dims: ParsedDims): string {
  const wl = dims.hasWidth ? String(dims.w) : '?';
  const hl = dims.hasHeight ? String(dims.h) : '?';
  return `${src} (${wl}×${hl})`;
}

/** UTF-8 byte length of a string. */
function byteLength(str: string): number {
  if (typeof Buffer !== 'undefined') return Buffer.byteLength(str, 'utf8');
  return new TextEncoder().encode(str).length;
}

/** Classify a single `<img>` for legacy-format detection. */
function classifyImg($: cheerio.CheerioAPI, el: AnyNode, s: FormatState): void {
  const src = $(el).attr('src') ?? '';
  if (!LEGACY_FORMATS.test(src) && !MODERN_FORMATS.test(src)) return;
  s.total++;
  if (pictureHasModern($, el)) return;
  if (!LEGACY_FORMATS.test(src)) return;
  s.legacy++;
  if (s.samples.length < 3) s.samples.push(src);
}

/** Classify a `<source>` inside `<picture>` for legacy-format detection. */
function classifySource($: cheerio.CheerioAPI, el: AnyNode, s: FormatState): void {
  const srcset = $(el).attr('srcset') ?? '';
  if (!LEGACY_FORMATS.test(srcset)) return;
  if (pictureHasModern($, el)) return;
  s.total++;
  s.legacy++;
  if (s.samples.length < 3) s.samples.push(srcset.split(',')[0]?.trim() ?? srcset);
}

/** Classify a single `<img>` for dimension issues. */
function classifyDims(
  $: cheerio.CheerioAPI, el: AnyNode, oversized: string[], missingRef: { count: number },
): void {
  const src = $(el).attr('src') ?? $(el).attr('data-src') ?? '';
  const dims = parseDimensions($, el);
  if (isOversized(dims) && oversized.length < 3) oversized.push(formatDimLabel(src, dims));
  if (!dims.hasWidth && !dims.hasHeight && src && !src.startsWith('data:')) missingRef.count++;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-checks
// ─────────────────────────────────────────────────────────────────────────────

/** Detect if >50 % of images use only legacy JPEG/PNG/GIF instead of WebP/AVIF. */
function checkModernFormats($: cheerio.CheerioAPI, url: string): ImageIssue[] {
  const s: FormatState = { legacy: 0, total: 0, samples: [] };
  $('img[src]').each((_i, el) => classifyImg($, el, s));
  $('picture source').each((_i, el) => classifySource($, el, s));

  if (s.total === 0 || s.legacy / s.total <= 0.5) return [];

  return [{
    code: 'no_modern_image_format',
    severity: 'P2' as const,
    category: 'PERFORMANCE' as const,
    title: 'Images not using modern formats (WebP / AVIF)',
    whyItMatters:
      'WebP and AVIF are 25-50 % smaller than JPEG/PNG at comparable quality, reducing page weight and load time.',
    howToFix:
      'Serve images in WebP or AVIF via <picture> with a legacy fallback. Most CDNs and build tools automate this.',
    evidence: {
      url,
      actual: `${s.legacy} of ${s.total} images use legacy formats`,
      expected: 'Majority of images in WebP or AVIF',
      snippet: s.samples.join(', '),
    },
    impact: 4,
    effort: 2,
  }];
}

/** Check that below-fold images use `loading="lazy"`. */
function checkLazyLoading($: cheerio.CheerioAPI, url: string): ImageIssue[] {
  const imgs = $('img').toArray();
  if (imgs.length <= ABOVE_FOLD_COUNT) return [];

  const missing = imgs.slice(ABOVE_FOLD_COUNT).filter((el) => {
    const val = $(el).attr('loading');
    return !val || val.toLowerCase() === 'eager';
  });
  if (missing.length === 0) return [];

  const snippet = missing
    .slice(0, 3)
    .map((el) => $(el).attr('src') ?? $(el).attr('data-src') ?? '<unknown>')
    .join(', ');

  return [{
    code: 'missing_lazy_loading',
    severity: 'P2' as const,
    category: 'PERFORMANCE' as const,
    title: 'Images below the fold missing lazy loading',
    whyItMatters:
      'Without lazy loading the browser downloads every image up-front, increasing initial page weight and time-to-interactive.',
    howToFix:
      'Add loading="lazy" to <img> elements not above the fold. Keep the first 1-2 hero images eager for LCP.',
    evidence: {
      url,
      actual: `${missing.length} image(s) below the fold without lazy loading`,
      expected: 'loading="lazy" on below-fold images',
      snippet,
      count: missing.length,
    },
    impact: 4,
    effort: 1,
  }];
}

/** Build an oversized-image issue. */
function buildOversizedIssue(url: string, oversized: string[]): ImageIssue {
  return {
    code: 'oversized_image',
    severity: 'P3' as const,
    category: 'PERFORMANCE' as const,
    title: 'Oversized image dimensions detected',
    whyItMatters:
      'Images larger than 2 000 px waste bandwidth and force the browser to down-scale, increasing decode time.',
    howToFix:
      'Resize images to the maximum display size and use srcset for different viewports.',
    evidence: {
      url,
      actual: oversized.join('; '),
      expected: 'Images ≤ 2 000 px in either dimension',
      count: oversized.length,
    },
    impact: 3,
    effort: 2,
  };
}

/** Build a missing-dimensions issue. */
function buildMissingDimsIssue(url: string, count: number): ImageIssue {
  return {
    code: 'missing_image_dimensions',
    severity: 'P3' as const,
    category: 'SEO' as const,
    title: 'Images missing width and height attributes',
    whyItMatters:
      'Without explicit dimensions the browser cannot reserve layout space, causing Cumulative Layout Shift (CLS).',
    howToFix:
      'Add width and height attributes (or CSS aspect-ratio) to every <img>.',
    evidence: {
      url,
      actual: `${count} image(s) without width/height`,
      expected: 'All images specify dimensions',
      count,
    },
    impact: 4,
    effort: 2,
  };
}

/** Detect oversized images and images missing width/height. */
function checkImageDimensions($: cheerio.CheerioAPI, url: string): ImageIssue[] {
  const oversized: string[] = [];
  const missingRef = { count: 0 };
  $('img').each((_i, el) => classifyDims($, el, oversized, missingRef));

  const issues: ImageIssue[] = [];
  if (oversized.length > 0) issues.push(buildOversizedIssue(url, oversized));
  if (missingRef.count > 0) issues.push(buildMissingDimsIssue(url, missingRef.count));
  return issues;
}

/** Detect when WebP is used but AVIF is not - recommend AVIF upgrade. */
function checkAvifAdoption($: cheerio.CheerioAPI, url: string): ImageIssue[] {
  let webpCount = 0;
  let avifCount = 0;
  const webpSamples: string[] = [];

  // Check <source> elements in <picture>
  $('picture source').each((_i, el) => {
    const type = $(el).attr('type') ?? '';
    const srcset = $(el).attr('srcset') ?? '';

    if (/avif/i.test(type) || /\.avif(\?|$)/i.test(srcset)) {
      avifCount++;
    } else if (/webp/i.test(type) || /\.webp(\?|$)/i.test(srcset)) {
      webpCount++;
      if (webpSamples.length < 3) {
        webpSamples.push(srcset.split(',')[0]?.trim() ?? srcset);
      }
    }
  });

  // Check standalone <img> elements with .webp src
  $('img[src]').each((_i, el) => {
    const src = $(el).attr('src') ?? '';
    if (/\.avif(\?|$)/i.test(src)) {
      avifCount++;
    } else if (/\.webp(\?|$)/i.test(src)) {
      // Only count if not inside a <picture> that already has sources
      const inPicture = $(el).closest('picture').length > 0;
      if (!inPicture) {
        webpCount++;
        if (webpSamples.length < 3) {
          webpSamples.push(src);
        }
      }
    }
  });

  // Only flag if WebP is used but AVIF is not
  if (webpCount === 0 || avifCount > 0) return [];

  return [{
    code: 'avif_not_used',
    severity: 'P3' as const,
    category: 'PERFORMANCE' as const,
    title: 'Images use WebP but not AVIF',
    whyItMatters:
      'AVIF offers 20-30% better compression than WebP at similar quality. Adding AVIF sources can further reduce page weight for supported browsers.',
    howToFix:
      'Add <source type="image/avif" srcset="image.avif"> before your WebP sources in <picture> elements. Most image CDNs and build tools can auto-generate AVIF.',
    evidence: {
      url,
      actual: `${webpCount} WebP image(s) without AVIF alternative`,
      expected: 'AVIF sources alongside WebP for maximum compression',
      snippet: webpSamples.join(', '),
      webpCount,
    },
    impact: 2,
    effort: 2,
  }];
}

/** Flag pages with images but no `<picture>` or `srcset` usage. */
function checkResponsiveImages($: cheerio.CheerioAPI, url: string): ImageIssue[] {
  const imgCount = $('img').length;
  if (imgCount === 0 || $('picture').length > 0 || $('[srcset]').length > 0) return [];

  return [{
    code: 'no_responsive_images',
    severity: 'P3' as const,
    category: 'PERFORMANCE' as const,
    title: 'No responsive images detected',
    whyItMatters:
      'Without <picture> or srcset every device downloads the same image, wasting bandwidth on mobile.',
    howToFix:
      'Use <picture> or srcset to serve appropriately sized images for different viewports.',
    evidence: {
      url,
      actual: `${imgCount} image(s), none using <picture> or srcset`,
      expected: 'Responsive image markup for varying viewports',
      count: imgCount,
    },
    impact: 3,
    effort: 3,
  }];
}

/** Flag pages where inline SVGs total more than 50 KB. */
function checkInlineSvgWeight($: cheerio.CheerioAPI, url: string): ImageIssue[] {
  let totalBytes = 0;
  let svgCount = 0;
  $('svg').each((_i, el) => {
    totalBytes += byteLength($.html(el));
    svgCount++;
  });

  if (totalBytes <= MAX_INLINE_SVG_BYTES) return [];

  return [{
    code: 'inline_svg_heavy',
    severity: 'P3' as const,
    category: 'PERFORMANCE' as const,
    title: 'Heavy inline SVG content',
    whyItMatters:
      'Inline SVGs exceeding 50 KB inflate the HTML document, increasing TTFB and blocking rendering.',
    howToFix:
      'Move large SVGs to external .svg files, use <img> / CSS background, or optimise with SVGO.',
    evidence: {
      url,
      actual: `${svgCount} inline SVG(s) totalling ${(totalBytes / 1024).toFixed(1)} KB`,
      expected: 'Inline SVGs ≤ 50 KB total',
      totalBytes,
    },
    impact: 3,
    effort: 2,
  }];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyze a crawled page for image-optimization issues.
 *
 * Checks performed:
 * 1. **no_modern_image_format** – majority of images in legacy JPEG/PNG/GIF
 * 2. **missing_lazy_loading** – below-fold images without `loading="lazy"`
 * 3. **oversized_image** – images with dimensions > 2 000 px
 * 4. **missing_image_dimensions** – `<img>` without width/height attributes
 * 5. **no_responsive_images** – no `<picture>` or `srcset` usage
 * 6. **inline_svg_heavy** – inline SVGs totalling > 50 KB
 *
 * @param result - The crawl result for a single page.
 * @returns An array of issues found (empty if the page is well-optimized).
 */
export function checkImageOptimization(result: CrawlResult): ImageIssue[] {
  if (!result.html) return [];
  const $ = cheerio.load(result.html);

  return [
    ...checkModernFormats($, result.url),
    ...checkAvifAdoption($, result.url),
    ...checkLazyLoading($, result.url),
    ...checkImageDimensions($, result.url),
    ...checkResponsiveImages($, result.url),
    ...checkInlineSvgWeight($, result.url),
  ];
}
