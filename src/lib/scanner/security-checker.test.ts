import { describe, it, expect } from 'vitest';
import { checkSecurity } from './security-checker';
import type { CrawlResult } from './crawler';

const createMockCrawlResult = (overrides: Partial<CrawlResult> = {}): CrawlResult => ({
  url: 'https://example.com',
  statusCode: 200,
  loadTimeMs: 100,
  html: '<html><head></head><body></body></html>',
  title: 'Example',
  metaDescription: 'A test page',
  h1: 'Example',
  canonical: null,
  robotsMeta: null,
  wordCount: 500,
  links: [],
  responseHeaders: {},
  cookies: [],
  images: [],
  headings: [],
  ogTags: {},
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
});

describe('checkSecurity', () => {
  describe('security headers', () => {
    it('flags missing Content-Security-Policy', () => {
      const result = createMockCrawlResult({ responseHeaders: {} });
      const issues = checkSecurity(result);

      const cspIssue = issues.find(i => i.code === 'missing_csp');
      expect(cspIssue).toBeDefined();
      expect(cspIssue?.severity).toBe('P1');
    });

    it('flags missing X-Frame-Options', () => {
      const result = createMockCrawlResult({ responseHeaders: {} });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'missing_x_frame_options');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P2');
    });

    it('flags missing X-Content-Type-Options', () => {
      const result = createMockCrawlResult({ responseHeaders: {} });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'missing_x_content_type_options');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P2');
    });

    it('flags missing Strict-Transport-Security (HSTS)', () => {
      const result = createMockCrawlResult({ responseHeaders: {} });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'missing_hsts');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P1');
    });

    it('flags missing Referrer-Policy', () => {
      const result = createMockCrawlResult({ responseHeaders: {} });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'missing_referrer_policy');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P3');
    });

    it('flags missing Permissions-Policy', () => {
      const result = createMockCrawlResult({ responseHeaders: {} });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'missing_permissions_policy');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P3');
    });

    it('does not flag present security headers', () => {
      const result = createMockCrawlResult({
        responseHeaders: {
          'content-security-policy': "default-src 'self'",
          'x-frame-options': 'DENY',
          'x-content-type-options': 'nosniff',
          'strict-transport-security': 'max-age=31536000',
          'referrer-policy': 'strict-origin-when-cross-origin',
          'permissions-policy': 'camera=(), microphone=()',
          'cross-origin-opener-policy': 'same-origin',
          'cross-origin-embedder-policy': 'require-corp',
          'cross-origin-resource-policy': 'same-origin',
        },
      });
      const issues = checkSecurity(result);

      expect(issues.find(i => i.code === 'missing_csp')).toBeUndefined();
      expect(issues.find(i => i.code === 'missing_x_frame_options')).toBeUndefined();
      expect(issues.find(i => i.code === 'missing_hsts')).toBeUndefined();
    });
  });

  describe('CSP analysis', () => {
    it('flags unsafe-inline in CSP', () => {
      const result = createMockCrawlResult({
        responseHeaders: {
          'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'",
        },
      });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'csp_unsafe_inline');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P1');
    });

    it('flags unsafe-eval in CSP', () => {
      const result = createMockCrawlResult({
        responseHeaders: {
          'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-eval'",
        },
      });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'csp_unsafe_eval');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P1');
    });

    it('flags wildcard sources in default-src', () => {
      const result = createMockCrawlResult({
        responseHeaders: {
          'content-security-policy': 'default-src *',
        },
      });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'csp_wildcard_source');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P2');
    });

    it('flags wildcard sources in script-src', () => {
      const result = createMockCrawlResult({
        responseHeaders: {
          'content-security-policy': "default-src 'self'; script-src *",
        },
      });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'csp_wildcard_source');
      expect(issue).toBeDefined();
    });

    it('flags data: URIs in script-src', () => {
      const result = createMockCrawlResult({
        responseHeaders: {
          'content-security-policy': "default-src 'self'; script-src 'self' data:",
        },
      });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'csp_data_uri_scripts');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P2');
    });

    it('does not flag data: in other directives', () => {
      const result = createMockCrawlResult({
        responseHeaders: {
          'content-security-policy': "default-src 'self'; img-src 'self' data:",
        },
      });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'csp_data_uri_scripts');
      expect(issue).toBeUndefined();
    });

    it('does not flag subdomain wildcards as overly permissive', () => {
      const result = createMockCrawlResult({
        responseHeaders: {
          'content-security-policy': "default-src 'self' *.example.com",
        },
      });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'csp_wildcard_source');
      expect(issue).toBeUndefined();
    });
  });

  describe('cookie security', () => {
    it('flags cookies without Secure flag', () => {
      const result = createMockCrawlResult({
        cookies: ['session=abc123; HttpOnly; SameSite=Strict'],
      });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'cookie_missing_secure');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P1');
    });

    it('flags cookies without HttpOnly flag', () => {
      const result = createMockCrawlResult({
        cookies: ['session=abc123; Secure; SameSite=Strict'],
      });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'cookie_missing_httponly');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P2');
    });

    it('flags cookies without SameSite attribute', () => {
      const result = createMockCrawlResult({
        cookies: ['session=abc123; Secure; HttpOnly'],
      });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'cookie_missing_samesite');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P3');
    });

    it('does not flag properly secured cookies', () => {
      const result = createMockCrawlResult({
        cookies: ['session=abc123; Secure; HttpOnly; SameSite=Strict'],
      });
      const issues = checkSecurity(result);

      expect(issues.find(i => i.code === 'cookie_missing_secure')).toBeUndefined();
      expect(issues.find(i => i.code === 'cookie_missing_httponly')).toBeUndefined();
      expect(issues.find(i => i.code === 'cookie_missing_samesite')).toBeUndefined();
    });

    it('consolidates multiple insecure cookies into single issues', () => {
      const result = createMockCrawlResult({
        cookies: [
          'session1=abc; HttpOnly',
          'session2=def; HttpOnly',
          'session3=ghi; HttpOnly',
        ],
      });
      const issues = checkSecurity(result);

      const secureIssue = issues.find(i => i.code === 'cookie_missing_secure');
      expect(secureIssue?.title).toContain('3 cookie(s)');
    });

    it('limits cookie analysis to first 20 cookies', () => {
      const cookies = Array(30).fill(null).map((_, i) => `cookie${i}=value`);
      const result = createMockCrawlResult({ cookies });
      const issues = checkSecurity(result);

      // Should still produce issues, just limited
      const secureIssue = issues.find(i => i.code === 'cookie_missing_secure');
      expect(secureIssue).toBeDefined();
    });
  });

  describe('mixed content', () => {
    it('flags HTTP images on HTTPS pages', () => {
      const result = createMockCrawlResult({
        url: 'https://example.com',
        html: '<html><body><img src="http://insecure.com/image.jpg"></body></html>',
      });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'mixed_content');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P1');
    });

    it('flags HTTP scripts on HTTPS pages', () => {
      const result = createMockCrawlResult({
        url: 'https://example.com',
        html: '<html><body><script src="http://insecure.com/script.js"></script></body></html>',
      });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'mixed_content');
      expect(issue).toBeDefined();
    });

    it('flags HTTP stylesheets on HTTPS pages', () => {
      const result = createMockCrawlResult({
        url: 'https://example.com',
        html: '<html><head><link href="http://insecure.com/style.css" rel="stylesheet"></head></html>',
      });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'mixed_content');
      expect(issue).toBeDefined();
    });

    it('does not flag HTTP content on HTTP pages', () => {
      const result = createMockCrawlResult({
        url: 'http://example.com',
        html: '<html><body><img src="http://other.com/image.jpg"></body></html>',
      });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'mixed_content');
      expect(issue).toBeUndefined();
    });

    it('does not flag HTTPS content on HTTPS pages', () => {
      const result = createMockCrawlResult({
        url: 'https://example.com',
        html: '<html><body><img src="https://secure.com/image.jpg"></body></html>',
      });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'mixed_content');
      expect(issue).toBeUndefined();
    });
  });

  describe('noopener/noreferrer', () => {
    it('flags target="_blank" links without rel="noopener"', () => {
      const result = createMockCrawlResult({
        html: '<html><body><a href="https://external.com" target="_blank">Link</a></body></html>',
      });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'missing_noopener');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P3');
    });

    it('does not flag target="_blank" with rel="noopener"', () => {
      const result = createMockCrawlResult({
        html: '<html><body><a href="https://external.com" target="_blank" rel="noopener">Link</a></body></html>',
      });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'missing_noopener');
      expect(issue).toBeUndefined();
    });

    it('does not flag target="_blank" with rel="noreferrer"', () => {
      const result = createMockCrawlResult({
        html: '<html><body><a href="https://external.com" target="_blank" rel="noreferrer">Link</a></body></html>',
      });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'missing_noopener');
      expect(issue).toBeUndefined();
    });

    it('does not flag links without target="_blank"', () => {
      const result = createMockCrawlResult({
        html: '<html><body><a href="https://external.com">Link</a></body></html>',
      });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'missing_noopener');
      expect(issue).toBeUndefined();
    });
  });

  describe('subresource integrity', () => {
    it('flags external scripts without SRI', () => {
      const result = createMockCrawlResult({
        url: 'https://example.com',
        html: '<html><body><script src="https://cdn.example.org/lib.js"></script></body></html>',
      });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'external_script_missing_sri');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P3');
    });

    it('does not flag external scripts with SRI', () => {
      const result = createMockCrawlResult({
        url: 'https://example.com',
        html: '<html><body><script src="https://cdn.example.org/lib.js" integrity="sha384-abc123"></script></body></html>',
      });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'external_script_missing_sri');
      expect(issue).toBeUndefined();
    });

    it('does not flag same-origin scripts without SRI', () => {
      const result = createMockCrawlResult({
        url: 'https://example.com',
        html: '<html><body><script src="https://example.com/script.js"></script></body></html>',
      });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'external_script_missing_sri');
      expect(issue).toBeUndefined();
    });

    it('does not flag relative scripts', () => {
      const result = createMockCrawlResult({
        url: 'https://example.com',
        html: '<html><body><script src="/scripts/app.js"></script></body></html>',
      });
      const issues = checkSecurity(result);

      const issue = issues.find(i => i.code === 'external_script_missing_sri');
      expect(issue).toBeUndefined();
    });
  });

  describe('issue properties', () => {
    it('includes all required fields in issues', () => {
      const result = createMockCrawlResult({ responseHeaders: {} });
      const issues = checkSecurity(result);

      expect(issues.length).toBeGreaterThan(0);
      for (const issue of issues) {
        expect(issue.code).toBeDefined();
        expect(issue.severity).toMatch(/^P[0-3]$/);
        expect(issue.category).toBe('SECURITY');
        expect(issue.title).toBeDefined();
        expect(issue.whyItMatters).toBeDefined();
        expect(issue.howToFix).toBeDefined();
        expect(issue.evidence).toBeDefined();
        expect(issue.evidence.url).toBeDefined();
        expect(typeof issue.impact).toBe('number');
        expect(typeof issue.effort).toBe('number');
      }
    });
  });
});
