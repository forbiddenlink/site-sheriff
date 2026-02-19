import { chromium, Browser, Page } from 'playwright';
import * as cheerio from 'cheerio';
import { normalizeUrl, isInternalUrl, shouldExcludeUrl, resolveUrl, getHostname } from '../url-utils';
import type { LinkData } from '../types';

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
  error?: string;
}

export interface CrawlerOptions {
  maxPages: number;
  maxDepth: number;
  timeout: number;
}

const DEFAULT_OPTIONS: CrawlerOptions = {
  maxPages: 25,
  maxDepth: 3,
  timeout: 30000,
};

/**
 * Crawls a website starting from a URL, extracting SEO data and links
 */
export class Crawler {
  private browser: Browser | null = null;
  private visited = new Set<string>();
  private queue: Array<{ url: string; depth: number }> = [];
  private baseHostname: string = '';
  private options: CrawlerOptions;
  private onProgress?: (discovered: number, scanned: number, current: string) => void;

  constructor(options: Partial<CrawlerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  setProgressCallback(cb: (discovered: number, scanned: number, current: string) => void) {
    this.onProgress = cb;
  }

  async crawl(startUrl: string): Promise<CrawlResult[]> {
    const results: CrawlResult[] = [];

    try {
      // Launch browser
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

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
      const $ = cheerio.load(html);

      // Extract SEO data
      const title = $('title').first().text().trim() || null;
      const metaDescription = $('meta[name="description"]').attr('content')?.trim() || null;
      const h1 = $('h1').first().text().trim() || null;
      const canonical = $('link[rel="canonical"]').attr('href') || null;
      const robotsMeta = $('meta[name="robots"]').attr('content') || null;

      // Count words in body text
      const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
      const wordCount = bodyText.split(' ').filter(Boolean).length;

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
      };
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
      };
    } finally {
      await page.close();
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
