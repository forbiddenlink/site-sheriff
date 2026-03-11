import { describe, it, expect } from 'vitest';
import { checkUrlStructure } from './seo-checker/url-structure';
import { checkMobileUsability } from './seo-checker/mobile-checks';
import { checkStructuredData } from './seo-checker/structured-data';
import { checkAnchorText } from './seo-checker/anchor-text';
import {
  checkTitle,
  checkMetaDescription,
  checkH1,
  checkRobotsMeta,
  checkViewport,
  checkLangAttribute,
  checkFavicon,
} from './seo-checker/meta-tags';
import type { CrawlResult } from './crawler';

/**
 * Minimal CrawlResult factory — only the fields each test needs.
 */
function makeResult(overrides: Partial<CrawlResult> = {}): CrawlResult {
  return {
    url: 'https://example.com/',
    html: '<html><head></head><body></body></html>',
    statusCode: 200,
    loadTimeMs: 100,
    title: 'Normal Page Title Here',
    metaDescription: 'A normal meta description that is the right length.',
    h1: 'Main Heading',
    canonical: null,
    robotsMeta: null,
    wordCount: 100,
    links: [],
    responseHeaders: {},
    cookies: [],
    images: [],
    headings: [],
    ogTags: { 'og:title': 'Test Page', 'og:description': null, 'og:image': null },
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
// checkUrlStructure
// ─────────────────────────────────────────────────────────────────────────────

describe('checkUrlStructure', () => {
  it('flags uppercase letters in path', () => {
    const result = makeResult({ url: 'https://example.com/Products/View' });
    const issues = checkUrlStructure(result);
    expect(issues.some((i) => i.code === 'url_uppercase')).toBe(true);
  });

  it('does NOT flag BCP 47 locale segments (en-US)', () => {
    const result = makeResult({ url: 'https://example.com/en-US/products' });
    const issues = checkUrlStructure(result);
    expect(issues.some((i) => i.code === 'url_uppercase')).toBe(false);
  });

  it('does NOT flag BCP 47 locale segments (zh-CN)', () => {
    const result = makeResult({ url: 'https://example.com/zh-CN/about' });
    const issues = checkUrlStructure(result);
    expect(issues.some((i) => i.code === 'url_uppercase')).toBe(false);
  });

  it('does NOT flag a lowercase path', () => {
    const result = makeResult({ url: 'https://example.com/normal-page' });
    const issues = checkUrlStructure(result);
    expect(issues.some((i) => i.code === 'url_uppercase')).toBe(false);
  });

  it('flags paths longer than 115 characters', () => {
    const longPath = '/' + 'a'.repeat(120);
    const result = makeResult({ url: `https://example.com${longPath}` });
    const issues = checkUrlStructure(result);
    expect(issues.some((i) => i.code === 'url_too_long')).toBe(true);
  });

  it('does NOT flag paths at or under 115 characters', () => {
    const result = makeResult({ url: 'https://example.com/short-path' });
    const issues = checkUrlStructure(result);
    expect(issues.some((i) => i.code === 'url_too_long')).toBe(false);
  });

  it('flags underscores in path', () => {
    const result = makeResult({ url: 'https://example.com/my_page' });
    const issues = checkUrlStructure(result);
    expect(issues.some((i) => i.code === 'url_underscores')).toBe(true);
  });

  it('does NOT flag hyphens in path', () => {
    const result = makeResult({ url: 'https://example.com/my-page' });
    const issues = checkUrlStructure(result);
    expect(issues.some((i) => i.code === 'url_underscores')).toBe(false);
  });

  it('returns no issues for a clean lowercase hyphenated URL', () => {
    const result = makeResult({ url: 'https://example.com/blog/my-great-post' });
    const issues = checkUrlStructure(result);
    expect(issues).toHaveLength(0);
  });

  it('can surface multiple issues on the same URL', () => {
    // uppercase + underscore
    const result = makeResult({ url: 'https://example.com/My_Page' });
    const issues = checkUrlStructure(result);
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('url_uppercase');
    expect(codes).toContain('url_underscores');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkMobileUsability
// ─────────────────────────────────────────────────────────────────────────────

describe('checkMobileUsability', () => {
  describe('viewport_not_mobile_friendly', () => {
    it('flags user-scalable=no viewport', () => {
      const result = makeResult({
        html: '<html><head><meta name="viewport" content="width=device-width, user-scalable=no"></head><body></body></html>',
        viewport: 'width=device-width, user-scalable=no',
      });
      const issues = checkMobileUsability(result);
      expect(issues.some((i) => i.code === 'viewport_not_mobile_friendly')).toBe(true);
    });

    it('flags maximum-scale=1 viewport', () => {
      const result = makeResult({
        html: '<html><head><meta name="viewport" content="width=device-width, maximum-scale=1"></head><body></body></html>',
        viewport: 'width=device-width, maximum-scale=1',
      });
      const issues = checkMobileUsability(result);
      expect(issues.some((i) => i.code === 'viewport_not_mobile_friendly')).toBe(true);
    });

    it('does NOT flag a normal responsive viewport', () => {
      const result = makeResult({
        html: '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>',
      });
      const issues = checkMobileUsability(result);
      expect(issues.some((i) => i.code === 'viewport_not_mobile_friendly')).toBe(false);
    });
  });

  describe('text_too_small_mobile', () => {
    it('flags inline font-size below 12px', () => {
      const result = makeResult({
        html: '<html><head></head><body><p style="font-size:10px">Small text</p></body></html>',
      });
      const issues = checkMobileUsability(result);
      expect(issues.some((i) => i.code === 'text_too_small_mobile')).toBe(true);
    });

    it('flags inline font-size below 9pt', () => {
      const result = makeResult({
        html: '<html><head></head><body><p style="font-size:8pt">Small text</p></body></html>',
      });
      const issues = checkMobileUsability(result);
      expect(issues.some((i) => i.code === 'text_too_small_mobile')).toBe(true);
    });

    it('does NOT flag inline font-size of 12px or more', () => {
      const result = makeResult({
        html: '<html><head></head><body><p style="font-size:14px">Normal text</p></body></html>',
      });
      const issues = checkMobileUsability(result);
      expect(issues.some((i) => i.code === 'text_too_small_mobile')).toBe(false);
    });

    it('does NOT flag elements with no inline font-size', () => {
      const result = makeResult({
        html: '<html><head></head><body><p>Normal text</p></body></html>',
      });
      const issues = checkMobileUsability(result);
      expect(issues.some((i) => i.code === 'text_too_small_mobile')).toBe(false);
    });
  });

  describe('tap_targets_too_close', () => {
    it('flags a button with inline width below 48px', () => {
      const result = makeResult({
        html: '<html><head></head><body><button style="width:30px">X</button></body></html>',
      });
      const issues = checkMobileUsability(result);
      expect(issues.some((i) => i.code === 'tap_targets_too_close')).toBe(true);
    });

    it('flags an anchor with inline height below 48px', () => {
      const result = makeResult({
        html: '<html><head></head><body><a href="#" style="height:20px">link</a></body></html>',
      });
      const issues = checkMobileUsability(result);
      expect(issues.some((i) => i.code === 'tap_targets_too_close')).toBe(true);
    });

    it('does NOT flag a button with inline width of 48px or more', () => {
      const result = makeResult({
        html: '<html><head></head><body><button style="width:50px">OK</button></body></html>',
      });
      const issues = checkMobileUsability(result);
      expect(issues.some((i) => i.code === 'tap_targets_too_close')).toBe(false);
    });
  });

  describe('mobile_usability_interstitial', () => {
    it('flags a visible modal div with position:fixed', () => {
      const result = makeResult({
        html: '<html><head></head><body><div class="modal" style="position:fixed">popup text</div></body></html>',
      });
      const issues = checkMobileUsability(result);
      expect(issues.some((i) => i.code === 'mobile_usability_interstitial')).toBe(true);
    });

    it('flags an overlay div with position:fixed', () => {
      const result = makeResult({
        html: '<html><head></head><body><div id="overlay" style="position:fixed">...</div></body></html>',
      });
      const issues = checkMobileUsability(result);
      expect(issues.some((i) => i.code === 'mobile_usability_interstitial')).toBe(true);
    });

    it('flags an open <dialog> element', () => {
      const result = makeResult({
        html: '<html><head></head><body><dialog open>Modal content</dialog></body></html>',
      });
      const issues = checkMobileUsability(result);
      expect(issues.some((i) => i.code === 'mobile_usability_interstitial')).toBe(true);
    });

    it('does NOT flag a <dialog> without the open attribute', () => {
      const result = makeResult({
        html: '<html><head></head><body><dialog>Hidden modal</dialog></body></html>',
      });
      const issues = checkMobileUsability(result);
      expect(issues.some((i) => i.code === 'mobile_usability_interstitial')).toBe(false);
    });

    it('does NOT flag modal with aria-hidden=true', () => {
      const result = makeResult({
        html: '<html><head></head><body><div class="modal" aria-hidden="true" style="position:fixed">hidden</div></body></html>',
      });
      const issues = checkMobileUsability(result);
      expect(issues.some((i) => i.code === 'mobile_usability_interstitial')).toBe(false);
    });

    it('does NOT flag modal with display:none', () => {
      const result = makeResult({
        html: '<html><head></head><body><div class="modal" style="position:fixed;display:none">hidden</div></body></html>',
      });
      const issues = checkMobileUsability(result);
      expect(issues.some((i) => i.code === 'mobile_usability_interstitial')).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkStructuredData
// ─────────────────────────────────────────────────────────────────────────────

describe('checkStructuredData', () => {
  const homepageWithNoJsonLd = makeResult({
    url: 'https://example.com/',
    html: '<html><head></head><body></body></html>',
  });

  const innerpageWithNoJsonLd = makeResult({
    url: 'https://example.com/about',
    html: '<html><head></head><body></body></html>',
  });

  const validJsonLd = JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage' });
  const homepageWithValidJsonLd = makeResult({
    url: 'https://example.com/',
    html: `<html><head><script type="application/ld+json">${validJsonLd}</script></head><body></body></html>`,
  });

  const homepageWithInvalidJsonLd = makeResult({
    url: 'https://example.com/',
    html: '<html><head><script type="application/ld+json">{broken json</script></head><body></body></html>',
  });

  it('flags missing structured data on the homepage', () => {
    const issues = checkStructuredData(homepageWithNoJsonLd);
    expect(issues.some((i) => i.code === 'missing_structured_data')).toBe(true);
  });

  it('does NOT flag missing structured data on an inner page', () => {
    const issues = checkStructuredData(innerpageWithNoJsonLd);
    expect(issues.some((i) => i.code === 'missing_structured_data')).toBe(false);
  });

  it('does NOT flag a homepage with valid JSON-LD', () => {
    const issues = checkStructuredData(homepageWithValidJsonLd);
    expect(issues.some((i) => i.code === 'missing_structured_data')).toBe(false);
  });

  it('flags malformed JSON-LD', () => {
    const issues = checkStructuredData(homepageWithInvalidJsonLd);
    expect(issues.some((i) => i.code === 'invalid_json_ld')).toBe(true);
  });

  it('does NOT flag valid JSON-LD as invalid', () => {
    const issues = checkStructuredData(homepageWithValidJsonLd);
    expect(issues.some((i) => i.code === 'invalid_json_ld')).toBe(false);
  });

  it('does NOT flag an inner page that has valid JSON-LD', () => {
    const innerWithJsonLd = makeResult({
      url: 'https://example.com/blog/post',
      html: `<html><head><script type="application/ld+json">${validJsonLd}</script></head><body></body></html>`,
    });
    const issues = checkStructuredData(innerWithJsonLd);
    expect(issues).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkAnchorText
// ─────────────────────────────────────────────────────────────────────────────

describe('checkAnchorText', () => {
  it('flags a link with empty text', () => {
    const result = makeResult({
      links: [{ href: 'https://example.com/page', text: '', isInternal: true }],
    });
    const issues = checkAnchorText(result);
    expect(issues.some((i) => i.code === 'empty_anchor_text')).toBe(true);
  });

  it('flags a link with whitespace-only text', () => {
    const result = makeResult({
      links: [{ href: 'https://example.com/page', text: '   ', isInternal: true }],
    });
    const issues = checkAnchorText(result);
    expect(issues.some((i) => i.code === 'empty_anchor_text')).toBe(true);
  });

  it('flags "click here" as non-descriptive', () => {
    const result = makeResult({
      links: [{ href: 'https://example.com/page', text: 'click here', isInternal: true }],
    });
    const issues = checkAnchorText(result);
    expect(issues.some((i) => i.code === 'non_descriptive_anchor')).toBe(true);
  });

  it('flags "Read more" (case-insensitive) as non-descriptive', () => {
    const result = makeResult({
      links: [{ href: 'https://example.com/page', text: 'Read more', isInternal: false }],
    });
    const issues = checkAnchorText(result);
    expect(issues.some((i) => i.code === 'non_descriptive_anchor')).toBe(true);
  });

  it('flags "here" as non-descriptive', () => {
    const result = makeResult({
      links: [{ href: 'https://example.com/page', text: 'here', isInternal: true }],
    });
    const issues = checkAnchorText(result);
    expect(issues.some((i) => i.code === 'non_descriptive_anchor')).toBe(true);
  });

  it('flags "learn more" as non-descriptive', () => {
    const result = makeResult({
      links: [{ href: 'https://example.com/page', text: 'learn more', isInternal: true }],
    });
    const issues = checkAnchorText(result);
    expect(issues.some((i) => i.code === 'non_descriptive_anchor')).toBe(true);
  });

  it('flags "view more" as non-descriptive', () => {
    const result = makeResult({
      links: [{ href: 'https://example.com/page', text: 'view more', isInternal: true }],
    });
    const issues = checkAnchorText(result);
    expect(issues.some((i) => i.code === 'non_descriptive_anchor')).toBe(true);
  });

  it('does NOT flag a descriptive link text', () => {
    const result = makeResult({
      links: [{ href: 'https://example.com/pricing', text: 'View our pricing plans', isInternal: true }],
    });
    const issues = checkAnchorText(result);
    expect(issues.some((i) => i.code === 'non_descriptive_anchor')).toBe(false);
    expect(issues.some((i) => i.code === 'empty_anchor_text')).toBe(false);
  });

  it('does NOT flag links when there are none', () => {
    const result = makeResult({ links: [] });
    const issues = checkAnchorText(result);
    expect(issues).toHaveLength(0);
  });

  it('can surface both empty and non-descriptive issues from a mixed link list', () => {
    const result = makeResult({
      links: [
        { href: 'https://example.com/a', text: '', isInternal: true },
        { href: 'https://example.com/b', text: 'click here', isInternal: true },
        { href: 'https://example.com/c', text: 'Good descriptive link text', isInternal: true },
      ],
    });
    const issues = checkAnchorText(result);
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('empty_anchor_text');
    expect(codes).toContain('non_descriptive_anchor');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkTitle
// ─────────────────────────────────────────────────────────────────────────────

describe('checkTitle', () => {
  it('flags missing title as P0', () => {
    const result = makeResult({ title: null });
    const issues = checkTitle(result);
    const issue = issues.find((i) => i.code === 'missing_title');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('P0');
  });

  it('flags missing title on auth page as P3', () => {
    const result = makeResult({ url: 'https://example.com/dashboard', title: null });
    const issues = checkTitle(result, []);
    const issue = issues.find((i) => i.code === 'missing_title');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('P3');
  });

  it('flags title shorter than 10 chars as title_too_short (P1)', () => {
    const result = makeResult({ title: 'Hi' });
    const issues = checkTitle(result);
    const issue = issues.find((i) => i.code === 'title_too_short');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('P1');
  });

  it('flags title longer than 60 chars as title_too_long (P2)', () => {
    const result = makeResult({ title: 'A'.repeat(61) });
    const issues = checkTitle(result);
    const issue = issues.find((i) => i.code === 'title_too_long');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('P2');
  });

  it('does NOT flag a title of exactly 10 chars', () => {
    const result = makeResult({ title: 'A'.repeat(10) });
    const issues = checkTitle(result);
    expect(issues.some((i) => i.code === 'title_too_short')).toBe(false);
  });

  it('does NOT flag a title of exactly 60 chars', () => {
    const result = makeResult({ title: 'A'.repeat(60) });
    const issues = checkTitle(result);
    expect(issues.some((i) => i.code === 'title_too_long')).toBe(false);
  });

  it('returns no issues for a well-formed title', () => {
    const result = makeResult({ title: 'A great page title that is just right' });
    const issues = checkTitle(result);
    expect(issues).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkMetaDescription
// ─────────────────────────────────────────────────────────────────────────────

describe('checkMetaDescription', () => {
  it('flags missing meta description as P1', () => {
    const result = makeResult({ metaDescription: null });
    const issues = checkMetaDescription(result);
    const issue = issues.find((i) => i.code === 'missing_meta_description');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('P1');
  });

  it('flags meta description shorter than 50 chars as P2', () => {
    const result = makeResult({ metaDescription: 'Too short.' });
    const issues = checkMetaDescription(result);
    const issue = issues.find((i) => i.code === 'meta_description_too_short');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('P2');
  });

  it('flags meta description longer than 160 chars as P3', () => {
    const result = makeResult({ metaDescription: 'A'.repeat(161) });
    const issues = checkMetaDescription(result);
    const issue = issues.find((i) => i.code === 'meta_description_too_long');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('P3');
  });

  it('does NOT flag meta description of exactly 50 chars', () => {
    const result = makeResult({ metaDescription: 'A'.repeat(50) });
    const issues = checkMetaDescription(result);
    expect(issues.some((i) => i.code === 'meta_description_too_short')).toBe(false);
  });

  it('does NOT flag meta description of exactly 160 chars', () => {
    const result = makeResult({ metaDescription: 'A'.repeat(160) });
    const issues = checkMetaDescription(result);
    expect(issues.some((i) => i.code === 'meta_description_too_long')).toBe(false);
  });

  it('returns no issues for a well-formed meta description', () => {
    const result = makeResult({ metaDescription: 'A perfectly good meta description with the right amount of content for SEO.' });
    const issues = checkMetaDescription(result);
    expect(issues).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkH1
// ─────────────────────────────────────────────────────────────────────────────

describe('checkH1', () => {
  it('flags missing H1 as P1 on a normal page', () => {
    const result = makeResult({ h1: null });
    const issues = checkH1(result);
    const issue = issues.find((i) => i.code === 'missing_h1');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('P1');
  });

  it('flags missing H1 as P3 on an auth page', () => {
    const result = makeResult({ url: 'https://example.com/dashboard', h1: null });
    const issues = checkH1(result, []);
    const issue = issues.find((i) => i.code === 'missing_h1');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('P3');
  });

  it('returns no issues when H1 is present', () => {
    const result = makeResult({ h1: 'Welcome to our site' });
    const issues = checkH1(result);
    expect(issues).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkRobotsMeta
// ─────────────────────────────────────────────────────────────────────────────

describe('checkRobotsMeta', () => {
  it('flags robotsMeta containing noindex as P0', () => {
    const result = makeResult({ robotsMeta: 'noindex, nofollow' });
    const issues = checkRobotsMeta(result);
    const issue = issues.find((i) => i.code === 'page_noindex');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('P0');
  });

  it('returns no issues when robotsMeta is null', () => {
    const result = makeResult({ robotsMeta: null });
    const issues = checkRobotsMeta(result);
    expect(issues.some((i) => i.code === 'page_noindex')).toBe(false);
  });

  it('returns no issues when robotsMeta is index, follow', () => {
    const result = makeResult({ robotsMeta: 'index, follow' });
    const issues = checkRobotsMeta(result);
    expect(issues.some((i) => i.code === 'page_noindex')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkViewport
// ─────────────────────────────────────────────────────────────────────────────

describe('checkViewport', () => {
  it('flags missing viewport as P1', () => {
    const result = makeResult({ viewport: null });
    const issues = checkViewport(result);
    const issue = issues.find((i) => i.code === 'missing_viewport');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('P1');
  });

  it('flags viewport without width=device-width as P2', () => {
    const result = makeResult({ viewport: 'initial-scale=1' });
    const issues = checkViewport(result);
    const issue = issues.find((i) => i.code === 'viewport_not_responsive');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('P2');
  });

  it('returns no issues for a correct responsive viewport', () => {
    const result = makeResult({ viewport: 'width=device-width, initial-scale=1' });
    const issues = checkViewport(result);
    expect(issues).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkLangAttribute
// ─────────────────────────────────────────────────────────────────────────────

describe('checkLangAttribute', () => {
  it('flags missing lang attribute as P2', () => {
    const result = makeResult({ lang: null });
    const issues = checkLangAttribute(result);
    const issue = issues.find((i) => i.code === 'missing_lang_attribute');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('P2');
  });

  it('returns no issues when lang attribute is present', () => {
    const result = makeResult({ lang: 'en' });
    const issues = checkLangAttribute(result);
    expect(issues).toHaveLength(0);
  });

  it('returns no issues for non-English lang codes', () => {
    const result = makeResult({ lang: 'fr' });
    const issues = checkLangAttribute(result);
    expect(issues).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkFavicon
// ─────────────────────────────────────────────────────────────────────────────

describe('checkFavicon', () => {
  it('flags missing favicon on the homepage as P2', () => {
    const result = makeResult({
      url: 'https://example.com/',
      html: '<html><head><title>Test</title></head><body></body></html>',
    });
    const issues = checkFavicon(result);
    const issue = issues.find((i) => i.code === 'missing_favicon');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('P2');
  });

  it('does NOT flag missing favicon on an inner page', () => {
    const result = makeResult({
      url: 'https://example.com/about',
      html: '<html><head><title>Test</title></head><body></body></html>',
    });
    const issues = checkFavicon(result);
    expect(issues.some((i) => i.code === 'missing_favicon')).toBe(false);
  });

  it('does NOT flag homepage that has rel="icon"', () => {
    const result = makeResult({
      url: 'https://example.com/',
      html: '<html><head><link rel="icon" href="/favicon.ico"></head><body></body></html>',
    });
    const issues = checkFavicon(result);
    expect(issues.some((i) => i.code === 'missing_favicon')).toBe(false);
  });

  it('does NOT flag homepage that has apple-touch-icon', () => {
    const result = makeResult({
      url: 'https://example.com/',
      html: '<html><head><link rel="apple-touch-icon" href="/icon-192.png"></head><body></body></html>',
    });
    const issues = checkFavicon(result);
    expect(issues.some((i) => i.code === 'missing_favicon')).toBe(false);
  });

  it('does NOT flag homepage that has shortcut icon', () => {
    const result = makeResult({
      url: 'https://example.com/',
      html: '<html><head><link rel="shortcut icon" href="/favicon.ico"></head><body></body></html>',
    });
    const issues = checkFavicon(result);
    expect(issues.some((i) => i.code === 'missing_favicon')).toBe(false);
  });
});
