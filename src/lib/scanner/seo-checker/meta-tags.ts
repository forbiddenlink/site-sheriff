import type { CrawlResult } from '../crawler';
import type { SEOIssue } from './types';
import { isLikelyAuthPage } from './auth-page';

/**
 * Check title tag issues.
 */
export function checkTitle(result: CrawlResult, disallowPatterns: string[] = []): SEOIssue[] {
  const issues: SEOIssue[] = [];
  const isAuthPage = isLikelyAuthPage(result.url, disallowPatterns);

  if (!result.title) {
    issues.push({
      code: 'missing_title',
      severity: isAuthPage ? 'P3' : 'P0',
      category: 'SEO',
      title: isAuthPage ? 'Missing page title (dashboard page)' : 'Missing page title',
      whyItMatters: isAuthPage
        ? 'Page titles help with browser tabs and accessibility. This appears to be a dashboard/auth page, so SEO impact is minimal.'
        : 'Page titles are critical for SEO and appear in search results. Missing titles hurt rankings and click-through rates.',
      howToFix: 'Add a <title> tag inside the <head> section with a descriptive, unique title (50-60 characters).',
      evidence: { url: result.url },
      impact: isAuthPage ? 1 : 5,
      effort: 1,
    });
  } else if (result.title.length < 10) {
    issues.push({
      code: 'title_too_short',
      severity: 'P1',
      category: 'SEO',
      title: 'Page title too short',
      whyItMatters: 'Short titles miss opportunities to include relevant keywords and context.',
      howToFix: 'Expand the title to 50-60 characters with relevant keywords.',
      evidence: { url: result.url, actual: result.title, expected: '50-60 characters' },
      impact: 3,
      effort: 1,
    });
  } else if (result.title.length > 60) {
    issues.push({
      code: 'title_too_long',
      severity: 'P2',
      category: 'SEO',
      title: 'Page title too long',
      whyItMatters: 'Titles over 60 characters may be truncated in search results.',
      howToFix: 'Shorten the title to 50-60 characters while keeping important keywords.',
      evidence: { url: result.url, actual: `${result.title.length} chars`, expected: '50-60 characters' },
      impact: 2,
      effort: 1,
    });
  }

  return issues;
}

/**
 * Check meta description issues.
 */
export function checkMetaDescription(result: CrawlResult): SEOIssue[] {
  const issues: SEOIssue[] = [];

  if (!result.metaDescription) {
    issues.push({
      code: 'missing_meta_description',
      severity: 'P1',
      category: 'SEO',
      title: 'Missing meta description',
      whyItMatters: 'Meta descriptions appear in search results and influence click-through rates. Without one, search engines generate their own (often poorly).',
      howToFix: 'Add a <meta name="description" content="..."> tag with a compelling summary (150-160 characters).',
      evidence: { url: result.url },
      impact: 4,
      effort: 1,
    });
  } else if (result.metaDescription.length < 50) {
    issues.push({
      code: 'meta_description_too_short',
      severity: 'P2',
      category: 'SEO',
      title: 'Meta description too short',
      whyItMatters: 'Short meta descriptions waste valuable space to convince searchers to click.',
      howToFix: 'Expand to 150-160 characters with a compelling call-to-action.',
      evidence: { url: result.url, actual: `${result.metaDescription.length} chars`, expected: '150-160 characters' },
      impact: 2,
      effort: 1,
    });
  } else if (result.metaDescription.length > 160) {
    issues.push({
      code: 'meta_description_too_long',
      severity: 'P3',
      category: 'SEO',
      title: 'Meta description too long',
      whyItMatters: 'Descriptions over 160 characters are truncated in search results.',
      howToFix: 'Shorten to 150-160 characters while keeping the most important information upfront.',
      evidence: { url: result.url, actual: `${result.metaDescription.length} chars`, expected: '150-160 characters' },
      impact: 1,
      effort: 1,
    });
  }

  return issues;
}

/**
 * Check H1 heading issues.
 */
export function checkH1(result: CrawlResult, disallowPatterns: string[] = []): SEOIssue[] {
  const issues: SEOIssue[] = [];
  const isAuthPage = isLikelyAuthPage(result.url, disallowPatterns);

  if (!result.h1) {
    issues.push({
      code: 'missing_h1',
      severity: isAuthPage ? 'P3' : 'P1',
      category: 'SEO',
      title: isAuthPage ? 'Missing H1 heading (dashboard page)' : 'Missing H1 heading',
      whyItMatters: isAuthPage
        ? 'H1 headings help with accessibility. This appears to be a dashboard/auth page, so SEO impact is minimal.'
        : 'H1 headings help search engines understand page content and are important for accessibility.',
      howToFix: 'Add a single, descriptive <h1> tag that summarizes the page content.',
      evidence: { url: result.url },
      impact: isAuthPage ? 1 : 4,
      effort: 1,
    });
  }

  return issues;
}

/**
 * Check robots meta (noindex) issues.
 */
export function checkRobotsMeta(result: CrawlResult): SEOIssue[] {
  const issues: SEOIssue[] = [];

  if (result.robotsMeta?.toLowerCase().includes('noindex')) {
    // Search result pages, login pages, and other utility pages commonly use noindex
    // intentionally. Downgrade these to P2 (informational) instead of P0.
    const isIntentionalNoindex = /[?&](search|q|query|s)=|\/(search|login|signin|signup|register|auth|preview|draft)\b/i.test(result.url);
    issues.push({
      code: 'page_noindex',
      severity: isIntentionalNoindex ? 'P2' : 'P0',
      category: 'SEO',
      title: 'Page is set to noindex',
      whyItMatters: isIntentionalNoindex
        ? 'This page has noindex set, which is likely intentional for search/utility pages. Verify this is expected.'
        : 'This page will not appear in search results. If this is intentional, you can ignore this. If not, fix immediately.',
      howToFix: 'Remove "noindex" from the robots meta tag if you want this page indexed.',
      evidence: { url: result.url, actual: result.robotsMeta },
      impact: isIntentionalNoindex ? 2 : 5,
      effort: 1,
    });
  }

  return issues;
}

/**
 * Check viewport meta tag issues.
 */
export function checkViewport(result: CrawlResult): SEOIssue[] {
  const issues: SEOIssue[] = [];

  if (!result.viewport) {
    issues.push({
      code: 'missing_viewport',
      severity: 'P1',
      category: 'SEO',
      title: 'Missing viewport meta tag',
      whyItMatters: 'Without a viewport meta tag, mobile devices render the page at desktop width. Google uses mobile-first indexing, so this hurts rankings.',
      howToFix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the <head>.',
      evidence: { url: result.url },
      impact: 5,
      effort: 1,
    });
  } else if (!result.viewport.includes('width=device-width')) {
    issues.push({
      code: 'viewport_not_responsive',
      severity: 'P2',
      category: 'SEO',
      title: 'Viewport meta tag is not responsive',
      whyItMatters: 'A viewport tag without width=device-width means the page won\'t scale properly on mobile devices, hurting usability and mobile-first indexing.',
      howToFix: 'Update the viewport tag to include width=device-width: <meta name="viewport" content="width=device-width, initial-scale=1">.',
      evidence: { url: result.url, actual: result.viewport, expected: 'width=device-width' },
      impact: 4,
      effort: 1,
    });
  }

  return issues;
}

/**
 * Check language attribute on HTML tag.
 */
export function checkLangAttribute(result: CrawlResult): SEOIssue[] {
  const issues: SEOIssue[] = [];

  if (!result.lang) {
    issues.push({
      code: 'missing_lang_attribute',
      severity: 'P2',
      category: 'ACCESSIBILITY',
      title: 'Missing lang attribute on <html>',
      whyItMatters: 'The lang attribute helps screen readers determine the correct pronunciation and helps search engines understand the page language. Missing it hurts accessibility.',
      howToFix: 'Add lang="en" (or your language code) to the <html> tag.',
      evidence: { url: result.url },
      impact: 3,
      effort: 1,
    });
  }

  return issues;
}

/**
 * Check favicon (homepage only).
 */
export function checkFavicon(result: CrawlResult): SEOIssue[] {
  const issues: SEOIssue[] = [];

  let isHomepage = false;
  try {
    isHomepage = ['/', ''].includes(new URL(result.url).pathname);
  } catch { /* ignore */ }

  if (isHomepage && result.html) {
    const htmlLower = result.html.toLowerCase();
    const hasFavicon =
      htmlLower.includes('rel="icon"') ||
      htmlLower.includes("rel='icon'") ||
      htmlLower.includes('rel="shortcut icon"') ||
      htmlLower.includes("rel='shortcut icon'") ||
      htmlLower.includes('rel="apple-touch-icon"') ||
      htmlLower.includes("rel='apple-touch-icon'");

    if (!hasFavicon) {
      issues.push({
        code: 'missing_favicon',
        severity: 'P2',
        category: 'SEO',
        title: 'Missing favicon',
        whyItMatters: 'Favicons help users identify your site in browser tabs, bookmarks, and search results. Missing favicons look unprofessional and can hurt brand recognition.',
        howToFix: 'Add a <link rel="icon" href="/favicon.ico"> tag to your HTML <head>. Consider adding apple-touch-icon for iOS devices.',
        evidence: { url: result.url },
        impact: 2,
        effort: 1,
      });
    }
  }

  return issues;
}
