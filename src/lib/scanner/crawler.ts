import * as cheerio from 'cheerio';
import { normalizeUrl, isInternalUrl, shouldExcludeUrl, resolveUrl, getHostname } from '../url-utils';
import type { LinkData } from '../types';

type Browser = import('playwright').Browser;

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
}

export interface CrawlerOptions {
  maxPages: number;
  maxDepth: number;
  timeout: number;
  screenshotMode: 'none' | 'above-fold' | 'full-page';
}

const DEFAULT_OPTIONS: CrawlerOptions = {
  maxPages: 25,
  maxDepth: 3,
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

      // Normalize start URL and extract hostname
      const normalizedStart = normalizeUrl(startUrl);
      this.baseHostname = getHostname(normalizedStart);
      this.queue.push({ url: normalizedStart, depth: 0 });

      // Crawl loop
      while (this.queue.length > 0 && this.visited.size < this.options.maxPages) {
        const item = this.queue.shift();
        if (!item) break;

        const { url, depth } = item;

        // Skip if already visited or exceeds depth
        if (this.visited.has(url) || depth > this.options.maxDepth) {
          continue;
        }

        // Report progress
        this.onProgress?.(this.queue.length + this.visited.size + 1, this.visited.size, url);

        // Crawl the page
        const result = await this.crawlPage(url);
        this.visited.add(url);
        results.push(result);

        // Add internal links to queue
        if (!result.error) {
          for (const link of result.links) {
            if (
              link.isInternal &&
              !this.visited.has(link.href) &&
              !shouldExcludeUrl(link.href) &&
              !this.queue.some((q) => q.url === link.href)
            ) {
              this.queue.push({ url: link.href, depth: depth + 1 });
            }
          }
        }
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

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'SiteSheriffBot/1.0 (+https://site-sheriff.vercel.app)',
          Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      const loadTimeMs = Date.now() - startTime;
      const statusCode = response.status;
      const html = await response.text();

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

      return this.parseHtml(url, statusCode, loadTimeMs, html, responseHeaders, cookies);
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
      };
    }
  }

  // ── Browser-based crawl (Playwright) ───────────────────────────────────

  private async crawlPageWithBrowser(url: string): Promise<CrawlResult> {
    const page = await this.browser!.newPage();
    const startTime = Date.now();

    try {
      // Navigate to page
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: this.options.timeout,
      });

      const loadTimeMs = Date.now() - startTime;
      const statusCode = response?.status() ?? 0;

      // Get HTML content
      const html = await page.content();

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
    };
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
