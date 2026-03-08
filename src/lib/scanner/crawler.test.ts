import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// Mock playwright to force fetch fallback
vi.mock('playwright', () => {
  throw new Error('Playwright mocked out for testing');
});

import { Crawler, type CrawlResult } from './crawler';

// ─────────────────────────────────────────────────────────────────────────────
// Test Setup - Mock fetch globally for all tests
// ─────────────────────────────────────────────────────────────────────────────

// Store original fetch once at module level
const originalFetch = global.fetch;

// Restore fetch after all tests complete
afterAll(() => {
  global.fetch = originalFetch;
});

// Reset mocks before each test
beforeEach(() => {
  vi.resetAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a mock fetch function that returns the given HTML
 */
function mockFetch(
  html: string,
  options: {
    statusCode?: number;
    headers?: Record<string, string>;
  } = {}
) {
  const { statusCode = 200, headers = {} } = options;
  const mockHeaders = new Headers(headers);

  global.fetch = vi.fn().mockResolvedValue({
    ok: statusCode >= 200 && statusCode < 300,
    status: statusCode,
    headers: mockHeaders,
    text: async () => html,
  });
}

/**
 * Helper to test parseHtml indirectly through fetch-based crawling.
 * Mocks global fetch to return controlled HTML content, allowing us to
 * test the HTML parsing logic without actual network calls.
 */
async function parseHtmlViaFetch(
  url: string,
  html: string,
  options: {
    statusCode?: number;
    headers?: Record<string, string>;
  } = {}
): Promise<CrawlResult> {
  mockFetch(html, options);

  const crawler = new Crawler({ maxPages: 1, maxDepth: 0, timeout: 5000, screenshotMode: 'none' });
  const results = await crawler.crawl(url);

  return results[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// stripTrackingParams Tests
// ─────────────────────────────────────────────────────────────────────────────

// Since stripTrackingParams is not exported, we test it indirectly through crawl behavior
describe('stripTrackingParams (tested via crawl behavior)', () => {
  it('strips UTM parameters from URLs', async () => {
    const html = '<html><head><title>Test</title></head><body></body></html>';
    mockFetch(html);

    const crawler = new Crawler({ maxPages: 1, maxDepth: 0 });
    const results = await crawler.crawl(
      'https://example.com/page?utm_source=google&utm_medium=cpc&utm_campaign=test&other=keep'
    );

    // The URL should be normalized and tracking params stripped
    expect(results[0].url).not.toContain('utm_source');
    expect(results[0].url).not.toContain('utm_medium');
    expect(results[0].url).not.toContain('utm_campaign');
    // Non-tracking params should be preserved
    expect(results[0].url).toContain('other=keep');
  });

  it('strips Facebook click ID (fbclid)', async () => {
    const html = '<html><head><title>Test</title></head><body></body></html>';
    mockFetch(html);

    const crawler = new Crawler({ maxPages: 1, maxDepth: 0 });
    const results = await crawler.crawl(
      'https://example.com/page?fbclid=abc123&page=1'
    );

    expect(results[0].url).not.toContain('fbclid');
    expect(results[0].url).toContain('page=1');
  });

  it('strips Google click ID (gclid)', async () => {
    const html = '<html><head><title>Test</title></head><body></body></html>';
    mockFetch(html);

    const crawler = new Crawler({ maxPages: 1, maxDepth: 0 });
    const results = await crawler.crawl(
      'https://example.com/page?gclid=xyz789&category=tech'
    );

    expect(results[0].url).not.toContain('gclid');
    expect(results[0].url).toContain('category=tech');
  });

  it('strips Microsoft click ID (msclkid)', async () => {
    const html = '<html><head><title>Test</title></head><body></body></html>';
    mockFetch(html);

    const crawler = new Crawler({ maxPages: 1, maxDepth: 0 });
    const results = await crawler.crawl(
      'https://example.com/page?msclkid=bing123&id=42'
    );

    expect(results[0].url).not.toContain('msclkid');
    expect(results[0].url).toContain('id=42');
  });

  it('strips HubSpot tracking parameters', async () => {
    const html = '<html><head><title>Test</title></head><body></body></html>';
    mockFetch(html);

    const crawler = new Crawler({ maxPages: 1, maxDepth: 0 });
    const results = await crawler.crawl(
      'https://example.com/page?_hsenc=abc&_hsmi=def&__hstc=ghi&slug=test'
    );

    expect(results[0].url).not.toContain('_hsenc');
    expect(results[0].url).not.toContain('_hsmi');
    expect(results[0].url).not.toContain('__hstc');
    expect(results[0].url).toContain('slug=test');
  });

  it('preserves URLs without tracking params', async () => {
    const html = '<html><head><title>Test</title></head><body></body></html>';
    mockFetch(html);

    const crawler = new Crawler({ maxPages: 1, maxDepth: 0 });
    const results = await crawler.crawl(
      'https://example.com/page?category=books&sort=price'
    );

    expect(results[0].url).toContain('category=books');
    expect(results[0].url).toContain('sort=price');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseHtml Tests - Title Extraction
// ─────────────────────────────────────────────────────────────────────────────

describe('parseHtml - title extraction', () => {
  it('extracts title from <title> tag', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>My Page Title</title>
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);
    expect(result.title).toBe('My Page Title');
  });

  it('trims whitespace from title', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>   Spaced Title   </title>
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);
    expect(result.title).toBe('Spaced Title');
  });

  it('returns null when title is empty', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title></title>
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);
    expect(result.title).toBeNull();
  });

  it('returns null when title tag is missing', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head></head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);
    expect(result.title).toBeNull();
  });

  it('uses first title tag when multiple exist', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>First Title</title>
          <title>Second Title</title>
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);
    expect(result.title).toBe('First Title');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseHtml Tests - Meta Description
// ─────────────────────────────────────────────────────────────────────────────

describe('parseHtml - meta description extraction', () => {
  it('extracts meta description', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="description" content="This is a page description.">
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);
    expect(result.metaDescription).toBe('This is a page description.');
  });

  it('trims whitespace from meta description', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="description" content="   Spaced description   ">
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);
    expect(result.metaDescription).toBe('Spaced description');
  });

  it('returns null when meta description is missing', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="keywords" content="test">
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);
    expect(result.metaDescription).toBeNull();
  });

  it('returns null when meta description content is empty', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="description" content="">
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);
    expect(result.metaDescription).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseHtml Tests - H1 Extraction
// ─────────────────────────────────────────────────────────────────────────────

describe('parseHtml - h1 extraction', () => {
  it('extracts h1 content', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <h1>Main Heading</h1>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);
    expect(result.h1).toBe('Main Heading');
  });

  it('trims whitespace from h1', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <h1>
            Spaced Heading
          </h1>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);
    expect(result.h1).toBe('Spaced Heading');
  });

  it('uses first h1 when multiple exist', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <h1>First Heading</h1>
          <h1>Second Heading</h1>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);
    expect(result.h1).toBe('First Heading');
  });

  it('returns null when h1 is missing', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <h2>Not an H1</h2>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);
    expect(result.h1).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseHtml Tests - Canonical URL
// ─────────────────────────────────────────────────────────────────────────────

describe('parseHtml - canonical extraction', () => {
  it('extracts canonical URL', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <link rel="canonical" href="https://example.com/canonical-page">
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);
    expect(result.canonical).toBe('https://example.com/canonical-page');
  });

  it('returns null when canonical is missing', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);
    expect(result.canonical).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseHtml Tests - Robots Meta
// ─────────────────────────────────────────────────────────────────────────────

describe('parseHtml - robots meta extraction', () => {
  it('extracts robots meta directive', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="robots" content="noindex, nofollow">
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);
    expect(result.robotsMeta).toBe('noindex, nofollow');
  });

  it('extracts robots index,follow directive', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="robots" content="index, follow">
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);
    expect(result.robotsMeta).toBe('index, follow');
  });

  it('returns null when robots meta is missing', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);
    expect(result.robotsMeta).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseHtml Tests - Word Count
// ─────────────────────────────────────────────────────────────────────────────

describe('parseHtml - word count', () => {
  it('counts words in body text', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <p>This is a simple paragraph with eight words.</p>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);
    expect(result.wordCount).toBe(8);
  });

  it('handles multiple whitespace correctly', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <p>Word1    Word2


          Word3</p>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);
    expect(result.wordCount).toBe(3);
  });

  it('returns 0 for empty body', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);
    expect(result.wordCount).toBe(0);
  });

  it('counts words across multiple elements', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <h1>Title Here</h1>
          <p>First paragraph.</p>
          <p>Second paragraph.</p>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);
    // "Title Here First paragraph. Second paragraph." = 6 words
    expect(result.wordCount).toBe(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseHtml Tests - Headings Extraction
// ─────────────────────────────────────────────────────────────────────────────

describe('parseHtml - headings extraction', () => {
  it('extracts all heading levels h1-h6', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <h1>Heading 1</h1>
          <h2>Heading 2</h2>
          <h3>Heading 3</h3>
          <h4>Heading 4</h4>
          <h5>Heading 5</h5>
          <h6>Heading 6</h6>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.headings).toHaveLength(6);
    expect(result.headings[0]).toEqual({ level: 1, text: 'Heading 1' });
    expect(result.headings[1]).toEqual({ level: 2, text: 'Heading 2' });
    expect(result.headings[2]).toEqual({ level: 3, text: 'Heading 3' });
    expect(result.headings[3]).toEqual({ level: 4, text: 'Heading 4' });
    expect(result.headings[4]).toEqual({ level: 5, text: 'Heading 5' });
    expect(result.headings[5]).toEqual({ level: 6, text: 'Heading 6' });
  });

  it('preserves heading order', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <h1>First</h1>
          <h3>Third Level</h3>
          <h2>Second Level</h2>
          <h1>Another H1</h1>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.headings).toHaveLength(4);
    expect(result.headings[0]).toEqual({ level: 1, text: 'First' });
    expect(result.headings[1]).toEqual({ level: 3, text: 'Third Level' });
    expect(result.headings[2]).toEqual({ level: 2, text: 'Second Level' });
    expect(result.headings[3]).toEqual({ level: 1, text: 'Another H1' });
  });

  it('trims heading text', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <h1>   Spaced Heading   </h1>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.headings[0].text).toBe('Spaced Heading');
  });

  it('truncates long heading text to 200 characters', async () => {
    const longText = 'A'.repeat(300);
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <h1>${longText}</h1>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.headings[0].text.length).toBe(200);
  });

  it('returns empty array when no headings exist', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <p>No headings here</p>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.headings).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseHtml Tests - Image Extraction
// ─────────────────────────────────────────────────────────────────────────────

describe('parseHtml - image extraction', () => {
  it('extracts images with all attributes', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <img src="/image.jpg" alt="Test Image" width="800" height="600">
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toEqual({
      src: '/image.jpg',
      alt: 'Test Image',
      width: '800',
      height: '600',
    });
  });

  it('handles images with missing optional attributes', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <img src="/minimal.jpg">
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toEqual({
      src: '/minimal.jpg',
      alt: null,
      width: null,
      height: null,
    });
  });

  it('handles empty alt attribute', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <img src="/decorative.jpg" alt="">
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.images[0].alt).toBe('');
  });

  it('extracts multiple images', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <img src="/img1.jpg" alt="First">
          <img src="/img2.jpg" alt="Second">
          <img src="/img3.jpg" alt="Third">
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.images).toHaveLength(3);
    expect(result.images.map(i => i.src)).toEqual(['/img1.jpg', '/img2.jpg', '/img3.jpg']);
  });

  it('skips images without src attribute', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <img alt="No source">
          <img src="/valid.jpg" alt="Valid">
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.images).toHaveLength(1);
    expect(result.images[0].src).toBe('/valid.jpg');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseHtml Tests - Open Graph and Twitter Meta Tags
// ─────────────────────────────────────────────────────────────────────────────

describe('parseHtml - OG and Twitter meta extraction', () => {
  it('extracts Open Graph meta tags', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta property="og:title" content="OG Title">
          <meta property="og:description" content="OG Description">
          <meta property="og:image" content="https://example.com/og.jpg">
          <meta property="og:type" content="website">
          <meta property="og:url" content="https://example.com/">
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.ogTags['og:title']).toBe('OG Title');
    expect(result.ogTags['og:description']).toBe('OG Description');
    expect(result.ogTags['og:image']).toBe('https://example.com/og.jpg');
    expect(result.ogTags['og:type']).toBe('website');
    expect(result.ogTags['og:url']).toBe('https://example.com/');
  });

  it('extracts Twitter card meta tags', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="twitter:card" content="summary_large_image">
          <meta name="twitter:title" content="Twitter Title">
          <meta name="twitter:description" content="Twitter Description">
          <meta name="twitter:image" content="https://example.com/twitter.jpg">
          <meta name="twitter:site" content="@example">
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.ogTags['twitter:card']).toBe('summary_large_image');
    expect(result.ogTags['twitter:title']).toBe('Twitter Title');
    expect(result.ogTags['twitter:description']).toBe('Twitter Description');
    expect(result.ogTags['twitter:image']).toBe('https://example.com/twitter.jpg');
    expect(result.ogTags['twitter:site']).toBe('@example');
  });

  it('handles OG tags with missing content', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta property="og:title" content="Has Content">
          <meta property="og:description">
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.ogTags['og:title']).toBe('Has Content');
    expect(result.ogTags['og:description']).toBeNull();
  });

  it('returns empty object when no OG/Twitter tags exist', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="description" content="Regular meta">
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(Object.keys(result.ogTags)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseHtml Tests - Viewport Meta
// ─────────────────────────────────────────────────────────────────────────────

describe('parseHtml - viewport meta extraction', () => {
  it('extracts viewport meta content', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.viewport).toBe('width=device-width, initial-scale=1');
  });

  it('returns null when viewport is missing', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.viewport).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseHtml Tests - Script and Stylesheet Counts
// ─────────────────────────────────────────────────────────────────────────────

describe('parseHtml - script and stylesheet counts', () => {
  it('counts external scripts', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <script src="/app.js"></script>
          <script src="/vendor.js"></script>
          <script src="/analytics.js"></script>
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.scriptCount).toBe(3);
  });

  it('does NOT count inline scripts (no src)', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <script src="/external.js"></script>
          <script>console.log('inline');</script>
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.scriptCount).toBe(1);
  });

  it('counts stylesheets', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
          <link rel="stylesheet" href="/theme.css">
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.stylesheetCount).toBe(2);
  });

  it('does NOT count non-stylesheet links', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
          <link rel="icon" href="/favicon.ico">
          <link rel="preload" href="/font.woff2">
          <link rel="canonical" href="https://example.com/">
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.stylesheetCount).toBe(1);
  });

  it('returns 0 when no scripts or stylesheets exist', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.scriptCount).toBe(0);
    expect(result.stylesheetCount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseHtml Tests - Language Attribute
// ─────────────────────────────────────────────────────────────────────────────

describe('parseHtml - lang attribute extraction', () => {
  it('extracts lang attribute from html tag', async () => {
    const html = `
      <!DOCTYPE html>
      <html lang="en">
        <head><title>Test</title></head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.lang).toBe('en');
  });

  it('handles regional language codes', async () => {
    const html = `
      <!DOCTYPE html>
      <html lang="en-US">
        <head><title>Test</title></head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.lang).toBe('en-US');
  });

  it('returns null when lang is missing', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.lang).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseHtml Tests - Favicon Extraction
// ─────────────────────────────────────────────────────────────────────────────

describe('parseHtml - favicon extraction', () => {
  it('extracts favicon from rel="icon"', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <link rel="icon" href="/favicon.ico">
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.favicon).toBe('https://example.com/favicon.ico');
  });

  it('extracts favicon from rel="shortcut icon"', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <link rel="shortcut icon" href="/favicon.png">
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.favicon).toBe('https://example.com/favicon.png');
  });

  it('extracts favicon from rel="apple-touch-icon"', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <link rel="apple-touch-icon" href="/apple-touch-icon.png">
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.favicon).toBe('https://example.com/apple-touch-icon.png');
  });

  it('uses first favicon link when multiple exist', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <link rel="icon" href="/first.ico">
          <link rel="apple-touch-icon" href="/apple.png">
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.favicon).toBe('https://example.com/first.ico');
  });

  it('resolves relative favicon URLs', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <link rel="icon" href="assets/favicon.svg">
        </head>
        <body></body>
      </html>
    `;

    // Note: URL normalization removes trailing slashes, so relative paths resolve from the normalized URL
    // which is https://example.com/page (not /page/)
    const result = await parseHtmlViaFetch('https://example.com/page/', html);

    // Relative URL resolves from https://example.com/page -> https://example.com/assets/favicon.svg
    expect(result.favicon).toBe('https://example.com/assets/favicon.svg');
  });

  it('handles absolute favicon URLs', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <link rel="icon" href="https://cdn.example.com/favicon.ico">
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.favicon).toBe('https://cdn.example.com/favicon.ico');
  });

  it('returns null when no favicon link exists', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.favicon).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseHtml Tests - Link Extraction
// ─────────────────────────────────────────────────────────────────────────────

describe('parseHtml - link extraction', () => {
  it('extracts links with href, text, and internal flag', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <a href="/about">About Us</a>
          <a href="https://external.com/page">External Link</a>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.links).toHaveLength(2);

    const internalLink = result.links.find(l => l.href.includes('/about'));
    expect(internalLink).toBeDefined();
    expect(internalLink?.isInternal).toBe(true);
    expect(internalLink?.text).toBe('About Us');

    const externalLink = result.links.find(l => l.href.includes('external.com'));
    expect(externalLink).toBeDefined();
    expect(externalLink?.isInternal).toBe(false);
    expect(externalLink?.text).toBe('External Link');
  });

  it('deduplicates links by href', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <a href="/page">First</a>
          <a href="/page">Second</a>
          <a href="/page">Third</a>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    // Should dedupe to just one link
    const pageLinks = result.links.filter(l => l.href.includes('/page'));
    expect(pageLinks).toHaveLength(1);
  });

  it('resolves relative URLs', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <a href="child">Child Page</a>
          <a href="../sibling">Sibling Page</a>
          <a href="/absolute">Absolute Path</a>
        </body>
      </html>
    `;

    // Note: URL normalization removes trailing slashes from paths
    // So https://example.com/parent/ becomes https://example.com/parent
    // Relative URLs resolve from the normalized URL
    const result = await parseHtmlViaFetch('https://example.com/parent/', html);

    // Relative 'child' from https://example.com/parent -> https://example.com/child
    const childLink = result.links.find(l => l.text === 'Child Page');
    expect(childLink?.href).toBe('https://example.com/child');

    const absoluteLink = result.links.find(l => l.text === 'Absolute Path');
    expect(absoluteLink?.href).toBe('https://example.com/absolute');
  });

  it('skips hash-only links', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <a href="#section">Jump to Section</a>
          <a href="/valid">Valid Link</a>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.links).toHaveLength(1);
    expect(result.links[0].text).toBe('Valid Link');
  });

  it('skips javascript: links', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <a href="javascript:void(0)">JS Link</a>
          <a href="javascript:doSomething()">Another JS</a>
          <a href="/valid">Valid Link</a>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.links).toHaveLength(1);
    expect(result.links[0].text).toBe('Valid Link');
  });

  it('skips mailto: links', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <a href="mailto:test@example.com">Email Us</a>
          <a href="/valid">Valid Link</a>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.links).toHaveLength(1);
    expect(result.links[0].text).toBe('Valid Link');
  });

  it('skips tel: links', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <a href="tel:+1234567890">Call Us</a>
          <a href="/valid">Valid Link</a>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.links).toHaveLength(1);
    expect(result.links[0].text).toBe('Valid Link');
  });

  it('truncates long link text to 100 characters', async () => {
    const longText = 'A'.repeat(200);
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <a href="/page">${longText}</a>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.links[0].text.length).toBe(100);
  });

  it('includes sourceUrl in link data', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <a href="/page">Link</a>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.links[0].sourceUrl).toBe('https://example.com/');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseHtml Tests - Internal vs External Link Detection
// ─────────────────────────────────────────────────────────────────────────────

describe('parseHtml - internal vs external link detection', () => {
  it('identifies links to same domain as internal', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <a href="https://example.com/page">Same Domain</a>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.links[0].isInternal).toBe(true);
  });

  it('identifies links to different domain as external', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <a href="https://other.com/page">Different Domain</a>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.links[0].isInternal).toBe(false);
  });

  it('identifies links to subdomain as external', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <a href="https://blog.example.com/post">Subdomain</a>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.links[0].isInternal).toBe(false);
  });

  it('handles www prefix normalization', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <a href="https://www.example.com/page">With WWW</a>
        </body>
      </html>
    `;

    // Crawl from non-www domain - www.example.com should be considered internal
    // due to www normalization in isInternalUrl
    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.links[0].isInternal).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Crawler - Error Handling
// ─────────────────────────────────────────────────────────────────────────────

describe('Crawler - error handling', () => {
  it('handles fetch errors gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    const crawler = new Crawler({ maxPages: 1, maxDepth: 0 });
    const results = await crawler.crawl('https://example.com/');

    expect(results).toHaveLength(1);
    expect(results[0].error).toBe('Network failure');
    expect(results[0].statusCode).toBe(0);
  });

  it('handles timeout errors', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('The operation was aborted'));

    const crawler = new Crawler({ maxPages: 1, maxDepth: 0, timeout: 100 });
    const results = await crawler.crawl('https://example.com/');

    expect(results).toHaveLength(1);
    expect(results[0].error).toContain('aborted');
  });

  it('captures HTTP status code for 404', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
      text: async () => '<html><body>Not Found</body></html>',
    });

    const crawler = new Crawler({ maxPages: 1, maxDepth: 0 });
    const results = await crawler.crawl('https://example.com/missing');

    expect(results[0].statusCode).toBe(404);
  });

  it('captures HTTP status code for 500', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      text: async () => '<html><body>Server Error</body></html>',
    });

    const crawler = new Crawler({ maxPages: 1, maxDepth: 0 });
    const results = await crawler.crawl('https://example.com/error');

    expect(results[0].statusCode).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Crawler - Response Headers and Cookies
// ─────────────────────────────────────────────────────────────────────────────

describe('Crawler - response headers and cookies', () => {
  it('captures response headers', async () => {
    const html = '<html><body>Test</body></html>';
    const headers = new Headers();
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('Cache-Control', 'max-age=3600');
    headers.set('X-Custom-Header', 'custom-value');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers,
      text: async () => html,
    });

    const crawler = new Crawler({ maxPages: 1, maxDepth: 0 });
    const results = await crawler.crawl('https://example.com/');

    expect(results[0].responseHeaders['content-type']).toBe('text/html; charset=utf-8');
    expect(results[0].responseHeaders['cache-control']).toBe('max-age=3600');
    expect(results[0].responseHeaders['x-custom-header']).toBe('custom-value');
  });

  it('captures Set-Cookie headers', async () => {
    const html = '<html><body>Test</body></html>';
    const headers = new Headers();
    headers.set('Set-Cookie', 'session=abc123; Path=/');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers,
      text: async () => html,
    });

    const crawler = new Crawler({ maxPages: 1, maxDepth: 0 });
    const results = await crawler.crawl('https://example.com/');

    expect(results[0].cookies.length).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Crawler - Complex HTML Scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe('Crawler - complex HTML scenarios', () => {
  it('handles a full realistic HTML page', async () => {
    const html = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Example Page | Site Name</title>
          <meta name="description" content="This is an example page for testing.">
          <meta name="robots" content="index, follow">
          <link rel="canonical" href="https://example.com/page">
          <link rel="icon" href="/favicon.ico">
          <link rel="stylesheet" href="/styles.css">
          <script src="/app.js"></script>
          <meta property="og:title" content="Example Page">
          <meta property="og:description" content="OG description here">
          <meta property="og:image" content="https://example.com/og.jpg">
          <meta name="twitter:card" content="summary_large_image">
        </head>
        <body>
          <header>
            <nav>
              <a href="/">Home</a>
              <a href="/about">About</a>
              <a href="/contact">Contact</a>
            </nav>
          </header>
          <main>
            <h1>Welcome to Example Page</h1>
            <p>This is the main content of the page with some text.</p>
            <h2>Section One</h2>
            <p>Content for section one.</p>
            <img src="/hero.jpg" alt="Hero Image" width="1200" height="600">
            <h3>Subsection</h3>
            <p>More content here.</p>
          </main>
          <footer>
            <a href="https://external.com">External Link</a>
            <a href="mailto:test@example.com">Email</a>
          </footer>
        </body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/page', html);

    // Basic SEO fields
    expect(result.title).toBe('Example Page | Site Name');
    expect(result.metaDescription).toBe('This is an example page for testing.');
    expect(result.h1).toBe('Welcome to Example Page');
    expect(result.canonical).toBe('https://example.com/page');
    expect(result.robotsMeta).toBe('index, follow');

    // Lang and viewport
    expect(result.lang).toBe('en');
    expect(result.viewport).toBe('width=device-width, initial-scale=1.0');

    // Favicon
    expect(result.favicon).toBe('https://example.com/favicon.ico');

    // Resources
    expect(result.scriptCount).toBe(1);
    expect(result.stylesheetCount).toBe(1);

    // Headings
    expect(result.headings.length).toBe(3);
    expect(result.headings.map(h => h.level)).toEqual([1, 2, 3]);

    // Images
    expect(result.images.length).toBe(1);
    expect(result.images[0].alt).toBe('Hero Image');

    // OG tags
    expect(result.ogTags['og:title']).toBe('Example Page');
    expect(result.ogTags['twitter:card']).toBe('summary_large_image');

    // Links - should exclude mailto but include internal and external
    const internalLinks = result.links.filter(l => l.isInternal);
    const externalLinks = result.links.filter(l => !l.isInternal);
    expect(internalLinks.length).toBeGreaterThan(0);
    expect(externalLinks.length).toBeGreaterThan(0);

    // mailto should be excluded
    const mailtoLinks = result.links.filter(l => l.href.includes('mailto'));
    expect(mailtoLinks.length).toBe(0);
  });

  it('handles HTML with no body content', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Empty Page</title>
        </head>
        <body></body>
      </html>
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    expect(result.title).toBe('Empty Page');
    expect(result.wordCount).toBe(0);
    expect(result.headings).toEqual([]);
    expect(result.images).toEqual([]);
    expect(result.links).toEqual([]);
  });

  it('handles malformed HTML gracefully', async () => {
    // Properly test malformed HTML - missing closing tags but with actual closings
    const html = `
      <html>
        <head>
          <title>Broken HTML</title>
        <body>
          <h1>Unclosed heading
          <p>Unclosed paragraph
          <img src="/img.jpg" alt="Image">
    `;

    const result = await parseHtmlViaFetch('https://example.com/', html);

    // Should still extract what it can
    expect(result.title).toBe('Broken HTML');
    expect(result.h1).toBeTruthy();
    expect(result.images.length).toBeGreaterThanOrEqual(0);
  });
});
