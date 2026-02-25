import { describe, it, expect } from 'vitest';
import { checkEEAT } from './eeat-checker';
import { checkSEO } from './seo-checker';
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
