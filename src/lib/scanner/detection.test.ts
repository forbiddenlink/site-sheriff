import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkEEAT } from './eeat-checker';
import { checkSEO } from './seo-checker';
import { checkImageOptimization } from './image-checker';
import { checkResourceOptimization } from './resource-checker';
import { checkLlmsTxt, checkAIReadiness, checkAICrawlerAccess } from './ai-readiness-checker';
import { parseDisallowPatterns, isDisallowedByRobots } from './robots-checker';
import { checkContentSimilarity } from './content-similarity-checker';
import type { CrawlResult } from './crawler';

/**
 * Helper to create minimal CrawlResult for testing
 */
function createCrawlResult(overrides: Partial<CrawlResult> = {}): CrawlResult {
  return {
    url: 'https://example.com/',
    html: '<html><head></head><body></body></html>',
    statusCode: 200,
    loadTimeMs: 100,
    title: 'Test Page',
    metaDescription: null,
    h1: null,
    canonical: null,
    robotsMeta: null,
    wordCount: 100,
    links: [],
    responseHeaders: {},
    cookies: [],
    images: [],
    headings: [],
    ogTags: {
      'og:title': 'Test Page',
      'og:description': null,
      'og:image': null,
    },
    viewport: 'width=device-width, initial-scale=1',
    scriptCount: 0,
    stylesheetCount: 0,
    lang: 'en',
    contentType: 'text/html',
    consoleErrors: [],
    ttfbMs: 50,
    httpVersion: 'HTTP/2',
    favicon: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Noscript Detection Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('noscript detection', () => {
  it('should NOT flag meaningful noscript that explains JS requirement with context', () => {
    // This is the actual noscript content from Site Sheriff
    // It has >100 chars AND mentions "enable JavaScript" but provides meaningful context
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <div id="__next"></div>
          <noscript>
            <div style="padding: 2rem; text-align: center; background-color: #1a1a2e; color: #e4e4e7; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;">
              <h1 style="font-size: 1.5rem; margin-bottom: 1rem;">JavaScript Required</h1>
              <p style="max-width: 500px; line-height: 1.6;">
                Site Sheriff requires JavaScript to run website audits and display results.
                Please enable JavaScript in your browser settings to use this application.
              </p>
            </div>
          </noscript>
        </body>
      </html>
    `;

    const result = createCrawlResult({ html });
    const issues = checkSEO(result);

    const noscriptIssue = issues.find(i => i.code === 'noscript_fallback_missing');
    expect(noscriptIssue).toBeUndefined();
  });

  // NOTE: Noscript detection works correctly - meaningful content with "enable JavaScript"
  // is accepted (tested above). The production issue was likely that the privacy page
  // doesn't have the same noscript tag as the main layout.
});

// ─────────────────────────────────────────────────────────────────────────────
// Privacy Policy Detection Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('privacy policy detection', () => {
  it('should NOT flag missing privacy link on the privacy page itself', () => {
    // The privacy page shouldn't need to link to itself
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Privacy Policy</title></head>
        <body>
          <h1>Privacy Policy</h1>
          <p>We collect minimal data...</p>
        </body>
      </html>
    `;

    const result = createCrawlResult({
      url: 'https://example.com/privacy',
      html,
    });
    const issues = checkEEAT(result);

    const privacyIssue = issues.find(i => i.code === 'missing_privacy_policy');
    expect(privacyIssue).toBeUndefined();
  });

  it('should NOT flag missing privacy link on /privacy-policy page', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Privacy Policy</title></head>
        <body>
          <h1>Privacy Policy</h1>
        </body>
      </html>
    `;

    const result = createCrawlResult({
      url: 'https://example.com/privacy-policy',
      html,
    });
    const issues = checkEEAT(result);

    const privacyIssue = issues.find(i => i.code === 'missing_privacy_policy');
    expect(privacyIssue).toBeUndefined();
  });

  it('should flag missing privacy link on homepage', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Example</title></head>
        <body>
          <h1>Welcome</h1>
          <footer>
            <a href="/about">About</a>
          </footer>
        </body>
      </html>
    `;

    const result = createCrawlResult({
      url: 'https://example.com/',
      html,
    });
    const issues = checkEEAT(result);

    const privacyIssue = issues.find(i => i.code === 'missing_privacy_policy');
    expect(privacyIssue).toBeDefined();
  });

  it('should NOT flag when privacy link exists in footer', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Example</title></head>
        <body>
          <footer>
            <a href="/privacy">Privacy</a>
          </footer>
        </body>
      </html>
    `;

    const result = createCrawlResult({ html });
    const issues = checkEEAT(result);

    const privacyIssue = issues.find(i => i.code === 'missing_privacy_policy');
    expect(privacyIssue).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Contact Info Detection Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('contact info detection', () => {
  it('should NOT flag when link TEXT contains "Contact"', () => {
    // This is the actual pattern from Site Sheriff - link text says "Contact"
    // but href points to GitHub issues
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Example</title></head>
        <body>
          <footer>
            <a href="https://github.com/example/repo/issues">Contact</a>
          </footer>
        </body>
      </html>
    `;

    const result = createCrawlResult({ html });
    const issues = checkEEAT(result);

    const contactIssue = issues.find(i => i.code === 'missing_contact_info');
    expect(contactIssue).toBeUndefined();
  });

  it('should NOT flag when link TEXT contains "contact us" (case insensitive)', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Example</title></head>
        <body>
          <a href="/support">Contact Us</a>
        </body>
      </html>
    `;

    const result = createCrawlResult({ html });
    const issues = checkEEAT(result);

    const contactIssue = issues.find(i => i.code === 'missing_contact_info');
    expect(contactIssue).toBeUndefined();
  });

  it('should NOT flag when mailto: link exists', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Example</title></head>
        <body>
          <a href="mailto:support@example.com">Email us</a>
        </body>
      </html>
    `;

    const result = createCrawlResult({ html });
    const issues = checkEEAT(result);

    const contactIssue = issues.find(i => i.code === 'missing_contact_info');
    expect(contactIssue).toBeUndefined();
  });

  it('should flag when no contact info exists', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Example</title></head>
        <body>
          <footer>
            <a href="/about">About</a>
            <a href="/privacy">Privacy</a>
          </footer>
        </body>
      </html>
    `;

    const result = createCrawlResult({ html });
    const issues = checkEEAT(result);

    const contactIssue = issues.find(i => i.code === 'missing_contact_info');
    expect(contactIssue).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AVIF Image Format Detection Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('AVIF image format detection', () => {
  it('should flag when images use WebP but not AVIF', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Example</title></head>
        <body>
          <picture>
            <source srcset="/hero.webp" type="image/webp">
            <img src="/hero.jpg" alt="Hero">
          </picture>
          <picture>
            <source srcset="/product.webp" type="image/webp">
            <img src="/product.jpg" alt="Product">
          </picture>
        </body>
      </html>
    `;

    const result = createCrawlResult({ html });
    const issues = checkImageOptimization(result);

    const avifIssue = issues.find(i => i.code === 'avif_not_used');
    expect(avifIssue).toBeDefined();
    expect(avifIssue?.evidence.webpCount).toBe(2);
  });

  it('should NOT flag when AVIF is already used', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Example</title></head>
        <body>
          <picture>
            <source srcset="/hero.avif" type="image/avif">
            <source srcset="/hero.webp" type="image/webp">
            <img src="/hero.jpg" alt="Hero">
          </picture>
        </body>
      </html>
    `;

    const result = createCrawlResult({ html });
    const issues = checkImageOptimization(result);

    const avifIssue = issues.find(i => i.code === 'avif_not_used');
    expect(avifIssue).toBeUndefined();
  });

  it('should NOT flag when only legacy formats are used (covered by existing check)', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Example</title></head>
        <body>
          <img src="/hero.jpg" alt="Hero">
          <img src="/product.png" alt="Product">
        </body>
      </html>
    `;

    const result = createCrawlResult({ html });
    const issues = checkImageOptimization(result);

    // Should have no_modern_image_format, not avif_not_used
    const avifIssue = issues.find(i => i.code === 'avif_not_used');
    expect(avifIssue).toBeUndefined();
  });

  it('should NOT flag pages with no images', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Example</title></head>
        <body><p>No images here</p></body>
      </html>
    `;

    const result = createCrawlResult({ html });
    const issues = checkImageOptimization(result);

    const avifIssue = issues.find(i => i.code === 'avif_not_used');
    expect(avifIssue).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LCP Preload Detection Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('LCP preload detection', () => {
  it('should flag when hero image lacks preload hint', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Example</title>
        </head>
        <body>
          <img src="/hero.jpg" alt="Hero" width="1200" height="600">
        </body>
      </html>
    `;

    const result = createCrawlResult({ html });
    const issues = checkResourceOptimization(result);

    const lcpIssue = issues.find(i => i.code === 'lcp_image_not_preloaded');
    expect(lcpIssue).toBeDefined();
  });

  it('should NOT flag when hero image has preload hint', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Example</title>
          <link rel="preload" as="image" href="/hero.jpg">
        </head>
        <body>
          <img src="/hero.jpg" alt="Hero" width="1200" height="600">
        </body>
      </html>
    `;

    const result = createCrawlResult({ html });
    const issues = checkResourceOptimization(result);

    const lcpIssue = issues.find(i => i.code === 'lcp_image_not_preloaded');
    expect(lcpIssue).toBeUndefined();
  });

  it('should NOT flag when first image is small (likely not LCP)', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Example</title></head>
        <body>
          <img src="/icon.png" alt="Icon" width="32" height="32">
        </body>
      </html>
    `;

    const result = createCrawlResult({ html });
    const issues = checkResourceOptimization(result);

    const lcpIssue = issues.find(i => i.code === 'lcp_image_not_preloaded');
    expect(lcpIssue).toBeUndefined();
  });

  it('should NOT flag when no images exist', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Example</title></head>
        <body><h1>Text Only Page</h1></body>
      </html>
    `;

    const result = createCrawlResult({ html });
    const issues = checkResourceOptimization(result);

    const lcpIssue = issues.find(i => i.code === 'lcp_image_not_preloaded');
    expect(lcpIssue).toBeUndefined();
  });

  it('should flag hero image in picture element without preload', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Example</title></head>
        <body>
          <picture>
            <source srcset="/hero.avif" type="image/avif">
            <source srcset="/hero.webp" type="image/webp">
            <img src="/hero.jpg" alt="Hero" width="1200" height="600">
          </picture>
        </body>
      </html>
    `;

    const result = createCrawlResult({ html });
    const issues = checkResourceOptimization(result);

    const lcpIssue = issues.find(i => i.code === 'lcp_image_not_preloaded');
    expect(lcpIssue).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// llms.txt Detection Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('llms.txt detection', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should flag when llms.txt is missing (404)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const issues = await checkLlmsTxt('https://example.com');

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('missing_llms_txt');
    expect(issues[0].severity).toBe('P3');
  });

  it('should NOT flag when llms.txt exists with content', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '# Site Name\nThis site provides...',
    });

    const issues = await checkLlmsTxt('https://example.com');

    expect(issues).toHaveLength(0);
  });

  it('should flag when llms.txt exists but is empty', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    });

    const issues = await checkLlmsTxt('https://example.com');

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('missing_llms_txt');
  });

  it('should NOT flag on network error (skip gracefully)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const issues = await checkLlmsTxt('https://example.com');

    expect(issues).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AI Crawler Access Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('AI crawler access detection', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should flag when GPTBot is blocked', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => `
User-agent: GPTBot
Disallow: /

User-agent: *
Allow: /
      `,
    });

    const issues = await checkAICrawlerAccess('https://example.com');

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('ai_crawlers_blocked');
    expect(issues[0].evidence.actual).toContain('GPTBot');
  });

  it('should flag multiple blocked AI crawlers with higher severity', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => `
User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: PerplexityBot
Disallow: /

User-agent: *
Allow: /
      `,
    });

    const issues = await checkAICrawlerAccess('https://example.com');

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('P2'); // Higher severity for 3+ bots
    expect(issues[0].evidence.actual).toContain('GPTBot');
    expect(issues[0].evidence.actual).toContain('ClaudeBot');
    expect(issues[0].evidence.actual).toContain('PerplexityBot');
  });

  it('should NOT flag when no AI bots are specifically blocked', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => `
User-agent: *
Allow: /
Disallow: /admin/
      `,
    });

    const issues = await checkAICrawlerAccess('https://example.com');

    expect(issues).toHaveLength(0);
  });

  it('should NOT flag when robots.txt is missing', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const issues = await checkAICrawlerAccess('https://example.com');

    expect(issues).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Content Similarity Detection Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('content similarity detection', () => {
  it('should detect duplicate content (>90% similarity)', () => {
    const page1 = createCrawlResult({
      url: 'https://example.com/page-1',
      html: `
        <html><body>
          <main>
            <h1>Welcome to Our Product</h1>
            <p>This is a comprehensive guide to using our product effectively.
            Our team has worked hard to create the best experience for our users.
            Learn how to get started with our amazing features and tools.
            The following sections will help you understand everything you need to know.</p>
          </main>
        </body></html>
      `,
      wordCount: 100,
    });

    const page2 = createCrawlResult({
      url: 'https://example.com/page-2',
      html: `
        <html><body>
          <main>
            <h1>Welcome to Our Product</h1>
            <p>This is a comprehensive guide to using our product effectively.
            Our team has worked hard to create the best experience for our users.
            Learn how to get started with our amazing features and tools.
            The following sections will help you understand everything you need to know.</p>
          </main>
        </body></html>
      `,
      wordCount: 100,
    });

    const issues = checkContentSimilarity([page1, page2]);

    const dupeIssue = issues.find(i => i.code === 'duplicate_content');
    expect(dupeIssue).toBeDefined();
    expect(dupeIssue?.severity).toBe('P2');
  });

  it('should detect high similarity (70-90%)', () => {
    // These pages share ~80% of their content but differ in key areas
    const sharedContent = `
      This product offers comprehensive features for your business needs.
      Our team has developed innovative solutions that help companies grow.
      Get started today with our enterprise-grade tools and support.
      We provide excellent customer service and technical assistance.
      Our platform integrates seamlessly with your existing workflows.
      Thousands of customers trust us to deliver reliable solutions.
    `;

    const page1 = createCrawlResult({
      url: 'https://example.com/product-a',
      html: `
        <html><body>
          <main>
            <h1>Product A - Best Solution</h1>
            <p>${sharedContent}</p>
            <p>Product A specific: Advanced analytics and reporting dashboard.</p>
          </main>
        </body></html>
      `,
      wordCount: 100,
    });

    const page2 = createCrawlResult({
      url: 'https://example.com/product-b',
      html: `
        <html><body>
          <main>
            <h1>Product B - Premium Solution</h1>
            <p>${sharedContent}</p>
            <p>Product B specific: Enhanced security features and compliance tools.</p>
          </main>
        </body></html>
      `,
      wordCount: 100,
    });

    const issues = checkContentSimilarity([page1, page2]);

    // Should find either duplicate_content or high_content_similarity
    const similarityIssue = issues.find(i =>
      i.code === 'duplicate_content' || i.code === 'high_content_similarity'
    );
    expect(similarityIssue).toBeDefined();
  });

  it('should NOT flag unique content pages', () => {
    const page1 = createCrawlResult({
      url: 'https://example.com/about',
      html: `
        <html><body>
          <main>
            <h1>About Our Company</h1>
            <p>Founded in 2020, we have been working on innovative solutions
            that transform how businesses operate in the digital age.
            Our mission is to empower teams with cutting-edge technology.</p>
          </main>
        </body></html>
      `,
      wordCount: 100,
    });

    const page2 = createCrawlResult({
      url: 'https://example.com/pricing',
      html: `
        <html><body>
          <main>
            <h1>Pricing Plans</h1>
            <p>Choose the perfect plan for your organization. We offer
            flexible monthly and annual subscriptions with various tiers.
            Enterprise customers can contact sales for custom solutions.</p>
          </main>
        </body></html>
      `,
      wordCount: 100,
    });

    const issues = checkContentSimilarity([page1, page2]);

    const similarityIssue = issues.find(i =>
      i.code === 'duplicate_content' || i.code === 'high_content_similarity'
    );
    expect(similarityIssue).toBeUndefined();
  });

  it('should skip pages with too little content', () => {
    const page1 = createCrawlResult({
      url: 'https://example.com/empty-1',
      html: '<html><body><main><p>Short</p></main></body></html>',
      wordCount: 10,
    });

    const page2 = createCrawlResult({
      url: 'https://example.com/empty-2',
      html: '<html><body><main><p>Brief</p></main></body></html>',
      wordCount: 10,
    });

    const issues = checkContentSimilarity([page1, page2]);

    expect(issues).toHaveLength(0);
  });

  it('should require at least 2 pages to compare', () => {
    const page1 = createCrawlResult({
      url: 'https://example.com/',
      html: '<html><body><main><p>Content here</p></main></body></html>',
      wordCount: 100,
    });

    const issues = checkContentSimilarity([page1]);

    expect(issues).toHaveLength(0);
  });
});

describe('parseDisallowPatterns', () => {
  it('should extract Disallow patterns from robots.txt', () => {
    const robotsTxt = `
User-agent: *
Disallow: /admin/
Disallow: /private/
Allow: /

Sitemap: https://example.com/sitemap.xml
    `;

    const patterns = parseDisallowPatterns(robotsTxt);

    expect(patterns).toContain('/admin/');
    expect(patterns).toContain('/private/');
    expect(patterns).not.toContain('/'); // Blanket disallow is excluded
  });

  it('should handle empty robots.txt', () => {
    const patterns = parseDisallowPatterns('');
    expect(patterns).toHaveLength(0);
  });

  it('should dedupe patterns', () => {
    const robotsTxt = `
User-agent: *
Disallow: /admin/

User-agent: Googlebot
Disallow: /admin/
    `;

    const patterns = parseDisallowPatterns(robotsTxt);

    expect(patterns.filter(p => p === '/admin/')).toHaveLength(1);
  });
});

describe('isDisallowedByRobots', () => {
  it('should match simple prefix patterns', () => {
    const patterns = ['/admin/', '/private/'];

    expect(isDisallowedByRobots('https://example.com/admin/dashboard', patterns)).toBe(true);
    expect(isDisallowedByRobots('https://example.com/private/settings', patterns)).toBe(true);
    expect(isDisallowedByRobots('https://example.com/public/page', patterns)).toBe(false);
  });

  it('should handle wildcard patterns', () => {
    const patterns = ['/user/*/settings'];

    expect(isDisallowedByRobots('https://example.com/user/123/settings', patterns)).toBe(true);
    expect(isDisallowedByRobots('https://example.com/user/abc/settings', patterns)).toBe(true);
    expect(isDisallowedByRobots('https://example.com/user/123/profile', patterns)).toBe(false);
  });

  it('should return false for empty patterns', () => {
    expect(isDisallowedByRobots('https://example.com/admin', [])).toBe(false);
  });
});

describe('checkAIReadiness - citation friendliness', () => {
  it('should flag article pages without citation-friendly patterns', () => {
    const result = createCrawlResult({
      url: 'https://example.com/blog/my-article',
      html: `
        <html><body>
          <article>
            <h1>My Long Article About Things</h1>
            <p>This is a long article that discusses various topics in depth.
            We explore many different aspects of the subject matter without
            using any structured elements like lists or statistics.
            The content continues for several paragraphs covering different
            areas of interest to our readers who want to learn more.</p>
            <p>Additional content here to meet the minimum length requirement.
            More prose that continues without any clear structure or
            citation-friendly patterns that AI systems prefer to extract.
            This makes it harder for AI to cite specific facts or points.</p>
            <p>Even more unstructured content filling out the article length.
            The writing style is conversational but lacks the structured
            elements that make content easy to cite and reference.</p>
          </article>
        </body></html>
      `,
    });

    const issues = checkAIReadiness(result);

    const citationIssue = issues.find(i => i.code === 'low_citation_friendliness');
    expect(citationIssue).toBeDefined();
    expect(citationIssue?.severity).toBe('P3');
  });

  it('should NOT flag articles with numbered lists', () => {
    const result = createCrawlResult({
      url: 'https://example.com/blog/my-article',
      html: `
        <html><body>
          <article>
            <h1>Top 5 Tips for Success</h1>
            <p>Here are our recommendations for achieving success in your projects.
            Following these steps will help you reach your goals efficiently.</p>
            <ol>
              <li>Start with clear objectives</li>
              <li>Break down tasks into smaller pieces</li>
              <li>Track your progress regularly</li>
              <li>Adjust your approach as needed</li>
              <li>Celebrate small wins along the way</li>
            </ol>
            <p>By following these steps, you can significantly improve your outcomes.</p>
          </article>
        </body></html>
      `,
    });

    const issues = checkAIReadiness(result);

    const citationIssue = issues.find(i => i.code === 'low_citation_friendliness');
    expect(citationIssue).toBeUndefined();
  });

  it('should NOT flag articles with statistics', () => {
    const result = createCrawlResult({
      url: 'https://example.com/blog/research',
      html: `
        <html><body>
          <article>
            <h1>Industry Research Report</h1>
            <p>According to our research, 75% of users prefer faster loading times.
            This study shows that performance optimization leads to better outcomes.
            The data shows clear patterns in user behavior and preferences.</p>
            <p>Additional research indicates that companies investing in speed
            see significant improvements in conversion rates and user satisfaction.</p>
          </article>
        </body></html>
      `,
    });

    const issues = checkAIReadiness(result);

    const citationIssue = issues.find(i => i.code === 'low_citation_friendliness');
    expect(citationIssue).toBeUndefined();
  });
});

describe('checkAIReadiness - speakable schema', () => {
  it('should flag Article without speakable schema', () => {
    const result = createCrawlResult({
      url: 'https://example.com/blog/article',
      html: `
        <html><head>
          <script type="application/ld+json">
            {"@type": "Article", "headline": "Test Article", "datePublished": "2024-01-01"}
          </script>
        </head><body>
          <article><h1>Test Article</h1><p>Content here.</p></article>
        </body></html>
      `,
    });

    const issues = checkAIReadiness(result);
    const speakableIssue = issues.find(i => i.code === 'missing_speakable_schema');
    expect(speakableIssue).toBeDefined();
    expect(speakableIssue?.severity).toBe('P3');
  });

  it('should NOT flag Article with speakable schema', () => {
    const result = createCrawlResult({
      url: 'https://example.com/blog/article',
      html: `
        <html><head>
          <script type="application/ld+json">
            {"@type": "Article", "headline": "Test", "speakable": {"cssSelector": [".headline", ".summary"]}}
          </script>
        </head><body>
          <article><h1 class="headline">Test</h1><p class="summary">Content.</p></article>
        </body></html>
      `,
    });

    const issues = checkAIReadiness(result);
    const speakableIssue = issues.find(i => i.code === 'missing_speakable_schema');
    expect(speakableIssue).toBeUndefined();
  });

  it('should NOT flag non-article pages', () => {
    const result = createCrawlResult({
      url: 'https://example.com/',
      html: `
        <html><head>
          <script type="application/ld+json">
            {"@type": "WebSite", "name": "Example Site"}
          </script>
        </head><body><h1>Homepage</h1></body></html>
      `,
    });

    const issues = checkAIReadiness(result);
    const speakableIssue = issues.find(i => i.code === 'missing_speakable_schema');
    expect(speakableIssue).toBeUndefined();
  });
});

describe('checkAIReadiness - dateModified freshness', () => {
  it('should flag Article with datePublished but no dateModified', () => {
    const result = createCrawlResult({
      url: 'https://example.com/blog/article',
      html: `
        <html><head>
          <script type="application/ld+json">
            {"@type": "Article", "headline": "Test", "datePublished": "2024-01-01"}
          </script>
        </head><body><article><h1>Test</h1></article></body></html>
      `,
    });

    const issues = checkAIReadiness(result);
    const freshnessIssue = issues.find(i => i.code === 'missing_date_modified');
    expect(freshnessIssue).toBeDefined();
    expect(freshnessIssue?.severity).toBe('P3');
  });

  it('should NOT flag Article with both datePublished and dateModified', () => {
    const result = createCrawlResult({
      url: 'https://example.com/blog/article',
      html: `
        <html><head>
          <script type="application/ld+json">
            {"@type": "Article", "headline": "Test", "datePublished": "2024-01-01", "dateModified": "2024-06-15"}
          </script>
        </head><body><article><h1>Test</h1></article></body></html>
      `,
    });

    const issues = checkAIReadiness(result);
    const freshnessIssue = issues.find(i => i.code === 'missing_date_modified');
    expect(freshnessIssue).toBeUndefined();
  });

  it('should accept dateModified from meta tag', () => {
    const result = createCrawlResult({
      url: 'https://example.com/blog/article',
      html: `
        <html><head>
          <meta property="article:modified_time" content="2024-06-15T10:00:00Z">
          <script type="application/ld+json">
            {"@type": "Article", "headline": "Test", "datePublished": "2024-01-01"}
          </script>
        </head><body><article><h1>Test</h1></article></body></html>
      `,
    });

    const issues = checkAIReadiness(result);
    const freshnessIssue = issues.find(i => i.code === 'missing_date_modified');
    expect(freshnessIssue).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WCAG 2.2 Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

import { isWCAG22Rule, getWCAG22Info, WCAG_22_RULES } from './a11y-checker';

describe('WCAG 2.2 Helper Functions', () => {
  it('should identify WCAG 2.2 specific rules', () => {
    expect(isWCAG22Rule('focus-not-obscured-minimum')).toBe(true);
    expect(isWCAG22Rule('target-size-minimum')).toBe(true);
    expect(isWCAG22Rule('dragging-movements')).toBe(true);
  });

  it('should NOT identify generic axe rules as WCAG 2.2', () => {
    expect(isWCAG22Rule('color-contrast')).toBe(false);
    expect(isWCAG22Rule('image-alt')).toBe(false);
    expect(isWCAG22Rule('link-name')).toBe(false);
  });

  it('should return WCAG 2.2 info for specific rules', () => {
    const focusInfo = getWCAG22Info('focus-not-obscured-minimum');
    expect(focusInfo).not.toBeNull();
    expect(focusInfo?.criterion).toBe('2.4.11 Focus Not Obscured (Minimum)');
    expect(focusInfo?.level).toBe('AA');

    const targetInfo = getWCAG22Info('target-size-minimum');
    expect(targetInfo).not.toBeNull();
    expect(targetInfo?.criterion).toBe('2.5.8 Target Size (Minimum)');
    expect(targetInfo?.level).toBe('AA');

    const dragInfo = getWCAG22Info('dragging-movements');
    expect(dragInfo).not.toBeNull();
    expect(dragInfo?.criterion).toBe('2.5.7 Dragging Movements');
    expect(dragInfo?.level).toBe('AA');
  });

  it('should return null for non-WCAG 2.2 rules', () => {
    expect(getWCAG22Info('color-contrast')).toBeNull();
    expect(getWCAG22Info('image-alt')).toBeNull();
  });

  it('should have all WCAG 2.2 rules defined with required fields', () => {
    for (const info of Object.values(WCAG_22_RULES)) {
      expect(info.criterion).toBeDefined();
      expect(info.level).toMatch(/^(A|AA|AAA)$/);
      expect(info.description).toBeDefined();
      expect(info.description.length).toBeGreaterThan(10);
    }
  });
});
