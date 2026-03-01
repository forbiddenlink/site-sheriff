import * as cheerio from 'cheerio';
import { normalizeUrl, isInternalUrl, shouldExcludeUrl, resolveUrl, getHostname } from '../url-utils';
import type { LinkData } from '../types';

type Browser = import('playwright').Browser;

/**
 * Common tracking/marketing URL parameters to strip before crawling.
 * This prevents duplicate crawls of the same page with different tracking params.
 */
const TRACKING_PARAMS_TO_STRIP = [
  // UTM parameters
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  // Facebook
  'fbclid',
  'fb_action_ids',
  'fb_action_types',
  'fb_source',
  // Google
  'gclid',
  'gclsrc',
  'dclid',
  // Microsoft/Bing
  'msclkid',
  // Mailchimp
  'mc_cid',
  'mc_eid',
  // HubSpot
  '_hsenc',
  '_hsmi',
  '__hstc',
  '__hsfp',
  '__hssc',
  // Other common tracking
  'ref',
  'referer',
  'referrer',
  '_ga',
  '_gl',
  'trk',
  'trkInfo',
  'si',
  'igshid',
  'share_source',
];

/**
 * Strip common tracking parameters from a URL to avoid duplicate crawls.
 * Preserves other query parameters that may be necessary for the page.
 */
function stripTrackingParams(url: string): string {
  try {
    const parsed = new URL(url);
    for (const param of TRACKING_PARAMS_TO_STRIP) {
      parsed.searchParams.delete(param);
    }
    return parsed.toString();
  } catch {
    // Invalid URL, return as-is
    return url;
  }
}

export interface ImageData {
  src: string;
  alt: string | null;
  width: string | null;
  height: string | null;
}

export interface HeadingData {
  level: number;
  text: string;
}

export interface CrawlResult {
  url: string;
  statusCode: number;
  loadTimeMs: number;
  html: string;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  wordCount: number;
  links: LinkData[];
  screenshotBase64?: string;
  error?: string;
  // Extended fields
  responseHeaders: Record<string, string>;
  cookies: string[];
  images: ImageData[];
  headings: HeadingData[];
  ogTags: Record<string, string | null>;
  viewport: string | null;
  scriptCount: number;
  stylesheetCount: number;
  lang: string | null;
  contentType: string | null;
  consoleErrors: string[];
  ttfbMs: number | null;
  httpVersion: string | null;
  favicon: string | null;
}

export interface CrawlerOptions {
  maxPages: number;
  maxDepth: number;
  timeout: number;
  screenshotMode: 'none' | 'above-fold' | 'full-page';
}

const DEFAULT_OPTIONS: CrawlerOptions = {
  maxPages: 50,
  maxDepth: 5,
  timeout: 30000,
  screenshotMode: 'above-fold',
};

/**
 * Crawls a website starting from a URL, extracting SEO data and links
 */
export class Crawler {
  private browser: Browser | null = null;
  private useFetchFallback = false;
  private readonly visited = new Set<string>();
  private readonly queue: Array<{ url: string; depth: number }> = [];
  private baseHostname: string = '';
  private readonly options: CrawlerOptions;
  private onProgress?: (discovered: number, scanned: number, current: string) => void;

  /** Whether this crawler fell back to fetch mode (no browser available). */
  get isFetchMode(): boolean {
    return this.useFetchFallback;
  }

  constructor(options: Partial<CrawlerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  setProgressCallback(cb: (discovered: number, scanned: number, current: string) => void) {
    this.onProgress = cb;
  }

  async crawl(startUrl: string): Promise<CrawlResult[]> {
    const results: CrawlResult[] = [];

    try {
      // Try to launch browser; fall back to fetch if Playwright is unavailable
      try {
        const { chromium } = await import('playwright');
        this.browser = await chromium.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
      } catch {
        console.warn('Playwright unavailable — falling back to fetch-based crawling');
        this.useFetchFallback = true;
      }

      // Normalize start URL, strip tracking params, and extract hostname
      const normalizedStart = stripTrackingParams(normalizeUrl(startUrl));
      this.baseHostname = getHostname(normalizedStart);
      this.queue.push({ url: normalizedStart, depth: 0 });

      // Crawl loop with iteration safeguard to prevent infinite loops
      const maxIterations = this.options.maxPages * 3;
      let iterations = 0;

      while (this.queue.length > 0 && this.visited.size < this.options.maxPages && iterations < maxIterations) {
        iterations++;
        const item = this.queue.shift();
        if (!item) break;

        const { url, depth } = item;

        // Skip if already visited or exceeds depth
        if (this.visited.has(url) || depth > this.options.maxDepth) {
          continue;
        }

        // Mark as visited BEFORE crawling to prevent race conditions
        // where the same URL could be crawled multiple times
        this.visited.add(url);

        // Report progress
        this.onProgress?.(this.queue.length + this.visited.size, this.visited.size, url);

        // Crawl the page with retry logic (max 2 retries for network errors)
        let result: CrawlResult;
        let retries = 2;
        while (retries >= 0) {
          result = await this.crawlPage(url);
          // Retry on network errors (status 0) but not on HTTP errors
          if (result.error && result.statusCode === 0 && retries > 0) {
            retries--;
            await new Promise(r => setTimeout(r, 1000)); // 1s backoff
            continue;
          }
          break;
        }
        results.push(result!);

        // Add internal links to queue (strip tracking params to avoid duplicates)
        if (!result!.error) {
          for (const link of result!.links) {
            const cleanHref = stripTrackingParams(link.href);
            if (
              link.isInternal &&
              !this.visited.has(cleanHref) &&
              !shouldExcludeUrl(cleanHref) &&
              !this.queue.some((q) => q.url === cleanHref)
            ) {
              this.queue.push({ url: cleanHref, depth: depth + 1 });
            }
          }
        }
      }

      if (iterations >= maxIterations) {
        console.warn(`Crawler reached maximum iterations (${maxIterations}). Stopping to prevent infinite loop.`);
      }
    } finally {
      await this.close();
    }

    return results;
  }

  private async crawlPage(url: string): Promise<CrawlResult> {
    if (this.useFetchFallback) {
      return this.crawlPageWithFetch(url);
    }
    return this.crawlPageWithBrowser(url);
  }

  // ── Fetch-based fallback (serverless) ──────────────────────────────────

  private async crawlPageWithFetch(url: string): Promise<CrawlResult> {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

      const fetchStart = Date.now();
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'SiteSheriffBot/1.0 (+https://site-sheriff.vercel.app)',
          Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
      });
      const ttfbMs = Date.now() - fetchStart;

      clearTimeout(timeoutId);

      const loadTimeMs = Date.now() - startTime;
      const statusCode = response.status;

      // Check content-length to prevent memory exhaustion from huge responses
      const MAX_HTML_SIZE = 10 * 1024 * 1024; // 10MB limit
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_HTML_SIZE) {
        throw new Error(`Response too large: ${contentLength} bytes`);
      }

      const html = await response.text();
      if (html.length > MAX_HTML_SIZE) {
        throw new Error(`HTML content too large: ${html.length} bytes`);
      }

      // Capture response headers
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key.toLowerCase()] = value;
      });

      // Capture cookies from Set-Cookie header
      const cookies: string[] = [];
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        cookies.push(...setCookie.split(/,(?=\s*\w+=)/));
      }

      const result = this.parseHtml(url, statusCode, loadTimeMs, html, responseHeaders, cookies);
      result.contentType = responseHeaders['content-type'] || null;
      result.ttfbMs = ttfbMs;
      return result;
    } catch (error) {
      return {
        url,
        statusCode: 0,
        loadTimeMs: Date.now() - startTime,
        html: '',
        title: null,
        metaDescription: null,
        h1: null,
        canonical: null,
        robotsMeta: null,
        wordCount: 0,
        links: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        responseHeaders: {},
        cookies: [],
        images: [],
        headings: [],
        ogTags: {},
        viewport: null,
        scriptCount: 0,
        stylesheetCount: 0,
        lang: null,
        contentType: null,
        consoleErrors: [],
        ttfbMs: null,
        httpVersion: null,
        favicon: null,
      };
    }
  }

  // ── Browser-based crawl (Playwright) ───────────────────────────────────

  private async crawlPageWithBrowser(url: string): Promise<CrawlResult> {
    const page = await this.browser!.newPage();
    const startTime = Date.now();

    // Collect JS console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text().slice(0, 200));
      }
    });

    try {
      // Navigate to page
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: this.options.timeout,
      });

      const loadTimeMs = Date.now() - startTime;
      const statusCode = response?.status() ?? 0;

      // Measure TTFB and HTTP version via Navigation Timing API
      const navTiming = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (!nav) return null;
        return {
          ttfb: Math.round(nav.responseStart - nav.startTime),
          // nextHopProtocol: "h2" = HTTP/2, "h3" = HTTP/3, "http/1.1" = HTTP/1.1
          protocol: nav.nextHopProtocol || null,
        };
      }).catch(() => null);
      const ttfbMs = navTiming?.ttfb ?? null;
      const httpVersion = navTiming?.protocol
        ? navTiming.protocol === 'h2' ? 'HTTP/2'
          : navTiming.protocol === 'h3' ? 'HTTP/3'
          : navTiming.protocol.toUpperCase()
        : null;

      // Get HTML content with size limit
      const MAX_HTML_SIZE = 10 * 1024 * 1024; // 10MB limit
      const html = await page.content();
      if (html.length > MAX_HTML_SIZE) {
        throw new Error(`HTML content too large: ${html.length} bytes`);
      }

      // Capture response headers
      const responseHeaders: Record<string, string> = {};
      const allHeaders = response?.headers() ?? {};
      for (const [key, value] of Object.entries(allHeaders)) {
        responseHeaders[key.toLowerCase()] = value;
      }

      // Capture cookies
      const browserCookies = await page.context().cookies();
      const cookies = browserCookies.map(c => `${c.name}=${c.value}; ${c.secure ? 'Secure; ' : ''}${c.httpOnly ? 'HttpOnly; ' : ''}SameSite=${c.sameSite}`);

      const result = this.parseHtml(url, statusCode, loadTimeMs, html, responseHeaders, cookies);
      result.contentType = responseHeaders['content-type'] || null;
      result.consoleErrors = consoleErrors.slice(0, 10);
      result.ttfbMs = ttfbMs;
      result.httpVersion = httpVersion;

      // Take screenshot if enabled
      if (this.options.screenshotMode !== 'none') {
        try {
          const screenshotBuffer = await page.screenshot({
            type: 'jpeg',
            quality: 70,
            fullPage: this.options.screenshotMode === 'full-page',
          });
          result.screenshotBase64 = screenshotBuffer.toString('base64');
        } catch {
          // Screenshot failed, continue without it
        }
      }

      return result;
    } catch (error) {
      return {
        url,
        statusCode: 0,
        loadTimeMs: Date.now() - startTime,
        html: '',
        title: null,
        metaDescription: null,
        h1: null,
        canonical: null,
        robotsMeta: null,
        wordCount: 0,
        links: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        responseHeaders: {},
        cookies: [],
        images: [],
        headings: [],
        ogTags: {},
        viewport: null,
        scriptCount: 0,
        stylesheetCount: 0,
        lang: null,
        contentType: null,
        consoleErrors: [],
        ttfbMs: null,
        httpVersion: null,
        favicon: null,
      };
    } finally {
      await page.close();
    }
  }

  // ── Shared HTML parsing ────────────────────────────────────────────────

  private parseHtml(url: string, statusCode: number, loadTimeMs: number, html: string, responseHeaders: Record<string, string> = {}, cookies: string[] = []): CrawlResult {
    const $ = cheerio.load(html);

    // Extract SEO data
    const title = $('title').first().text().trim() || null;
    const metaDescription = $('meta[name="description"]').attr('content')?.trim() || null;
    const h1 = $('h1').first().text().trim() || null;
    const canonical = $('link[rel="canonical"]').attr('href') || null;
    const robotsMeta = $('meta[name="robots"]').attr('content') || null;

    // Count words in body text
    const bodyText = $('body').text().replaceAll(/\s+/g, ' ').trim();
    const wordCount = bodyText.split(' ').filter(Boolean).length;

    // Extract all headings (h1-h6)
    const headings: HeadingData[] = [];
    $('h1, h2, h3, h4, h5, h6').each((_, el) => {
      const tag = $(el).prop('tagName')?.toLowerCase() ?? '';
      const level = Number.parseInt(tag.replace('h', ''), 10);
      if (!Number.isNaN(level)) {
        headings.push({ level, text: $(el).text().trim().slice(0, 200) });
      }
    });

    // Extract images with alt text
    const images: ImageData[] = [];
    $('img').each((_, el) => {
      const src = $(el).attr('src');
      if (src) {
        images.push({
          src,
          alt: $(el).attr('alt') ?? null,
          width: $(el).attr('width') ?? null,
          height: $(el).attr('height') ?? null,
        });
      }
    });

    // Extract Open Graph and Twitter meta tags
    const ogTags: Record<string, string | null> = {};
    $('meta[property^="og:"], meta[name^="twitter:"]').each((_, el) => {
      const property = $(el).attr('property') || $(el).attr('name');
      const content = $(el).attr('content') || null;
      if (property) {
        ogTags[property] = content;
      }
    });

    // Viewport meta
    const viewport = $('meta[name="viewport"]').attr('content') || null;

    // Count scripts and stylesheets
    const scriptCount = $('script[src]').length;
    const stylesheetCount = $('link[rel="stylesheet"]').length;

    // Language
    const lang = $('html').attr('lang') || null;

    // Extract favicon - check various link rel types
    let favicon: string | null = null;
    const faviconEl = $('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').first();
    const faviconHref = faviconEl.attr('href');
    if (faviconHref) {
      favicon = resolveUrl(faviconHref, url);
    }

    // Extract links
    const links: LinkData[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return;
      }

      const resolved = resolveUrl(href, url);
      if (!resolved) return;

      const isInternal = isInternalUrl(resolved, this.baseHostname);

      links.push({
        href: resolved,
        text: $(el).text().trim().slice(0, 100),
        isInternal,
        sourceUrl: url,
      });
    });

    // Dedupe links
    const uniqueLinks = Array.from(
      new Map(links.map((l) => [l.href, l])).values()
    );

    return {
      url,
      statusCode,
      loadTimeMs,
      html,
      title,
      metaDescription,
      h1,
      canonical,
      robotsMeta,
      wordCount,
      links: uniqueLinks,
      responseHeaders,
      cookies,
      images,
      headings,
      ogTags,
      viewport,
      scriptCount,
      stylesheetCount,
      lang,
      contentType: null,
      consoleErrors: [],
      ttfbMs: null,
      httpVersion: null,
      favicon,
    };
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
