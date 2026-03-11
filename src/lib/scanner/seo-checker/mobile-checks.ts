import * as cheerio from 'cheerio';
import type { CrawlResult } from '../crawler';
import type { SEOIssue } from './types';

/**
 * Check mobile-first indexing issues (viewport zoom, font sizes, tap targets, interstitials).
 */
export function checkMobileUsability(result: CrawlResult): SEOIssue[] {
  const issues: SEOIssue[] = [];

  // Check for viewport that disables user scaling (not mobile-friendly)
  if (result.viewport) {
    const viewportLower = result.viewport.toLowerCase();
    const hasUserScalableNo = /user-scalable\s*=\s*(no|0)/.test(viewportLower);
    const hasMaxScaleOne = /maximum-scale\s*=\s*1(\.0)?(?!\d)/.test(viewportLower);
    if (hasUserScalableNo || hasMaxScaleOne) {
      issues.push({
        code: 'viewport_not_mobile_friendly',
        severity: 'P2',
        category: 'SEO',
        title: 'Viewport disables user scaling',
        whyItMatters: 'Disabling pinch-to-zoom (user-scalable=no or maximum-scale=1) hurts accessibility and mobile usability. Google considers this a mobile-friendliness issue that can affect rankings.',
        howToFix: 'Remove user-scalable=no and maximum-scale=1 from your viewport meta tag. Allow users to zoom for accessibility.',
        evidence: { url: result.url, actual: result.viewport, expected: 'Viewport without zoom restrictions' },
        impact: 3,
        effort: 1,
      });
    }
  }

  if (!result.html) return issues;

  // Check for small font sizes in inline styles (basic heuristic)
  const smallFontPattern = /style\s*=\s*["'][^"']*font-size\s*:\s*(\d+(?:\.\d+)?)(px|pt)[^"']*["']/gi;
  const smallFontMatches = [...result.html.matchAll(smallFontPattern)];
  const tooSmallFonts: string[] = [];

  for (const match of smallFontMatches) {
    const size = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    // 12px is Google's minimum recommended font size for mobile
    // pt is roughly 1.33x px, so 9pt ≈ 12px
    const minSize = unit === 'pt' ? 9 : 12;
    if (size < minSize) {
      tooSmallFonts.push(`${size}${unit}`);
    }
  }

  if (tooSmallFonts.length > 0) {
    issues.push({
      code: 'text_too_small_mobile',
      severity: 'P2',
      category: 'SEO',
      title: 'Text may be too small to read on mobile',
      whyItMatters: 'Google recommends a minimum font size of 12px for mobile readability. Text smaller than this fails mobile-friendliness tests and hurts user experience.',
      howToFix: 'Increase font sizes to at least 12px (or 16px for body text). Use relative units like rem or em for better scaling.',
      evidence: {
        url: result.url,
        actual: `Found ${tooSmallFonts.length} instance(s) with small fonts: ${tooSmallFonts.slice(0, 5).join(', ')}${tooSmallFonts.length > 5 ? '...' : ''}`,
        expected: 'Minimum 12px font size'
      },
      impact: 3,
      effort: 2,
    });
  }

  // Check for small tap targets (buttons/links with small dimensions in inline styles)
  const tapTargetPattern = /<(button|a|input|select)\b[^>]*style\s*=\s*["'][^"']*(?:width|height)\s*:\s*(\d+(?:\.\d+)?)(px|em|rem)[^"']*["'][^>]*>/gi;
  const smallTapTargets: Array<{ element: string; size: string }> = [];

  let tapMatch;
  while ((tapMatch = tapTargetPattern.exec(result.html)) !== null) {
    const element = tapMatch[1];
    const fullTag = tapMatch[0];

    // Extract width and height from the style attribute
    const widthMatch = /width\s*:\s*(\d+(?:\.\d+)?)(px|em|rem)/i.exec(fullTag);
    const heightMatch = /height\s*:\s*(\d+(?:\.\d+)?)(px|em|rem)/i.exec(fullTag);

    for (const sizeMatch of [widthMatch, heightMatch]) {
      if (sizeMatch) {
        const size = parseFloat(sizeMatch[1]);
        const unit = sizeMatch[2].toLowerCase();
        // 48px is Google's recommended minimum tap target size
        // Convert em/rem assuming 16px base (48px = 3em/rem)
        const minSize = unit === 'px' ? 48 : 3;
        if (size < minSize) {
          smallTapTargets.push({ element, size: `${size}${unit}` });
          break; // Only report once per element
        }
      }
    }
  }

  if (smallTapTargets.length > 0) {
    const examples = smallTapTargets.slice(0, 3).map(t => `<${t.element}> (${t.size})`).join(', ');
    issues.push({
      code: 'tap_targets_too_close',
      severity: 'P3',
      category: 'SEO',
      title: 'Tap targets may be too small for mobile',
      whyItMatters: 'Google recommends tap targets (buttons, links) be at least 48x48px for comfortable tapping on mobile devices. Small targets lead to accidental taps and frustration.',
      howToFix: 'Increase the size of clickable elements to at least 48x48px. Add padding if you cannot increase the visible size.',
      evidence: {
        url: result.url,
        actual: `Found ${smallTapTargets.length} potentially small tap target(s): ${examples}${smallTapTargets.length > 3 ? '...' : ''}`,
        expected: 'Minimum 48x48px tap targets'
      },
      impact: 2,
      effort: 2,
    });
  }

  // Check for intrusive interstitials/modals that may block content on mobile.
  // Detect genuine intrusive interstitials — elements covering page content at render time.
  // Strategy: element must have an interstitial-keyword class/id AND position:fixed in
  // inline style. This catches content-blocking overlays rendered by the server (e.g. a
  // login gate, email-signup popup, or adblocker wall shown immediately on page load)
  // while skipping:
  //   - hidden modal templates (no inline position:fixed, or have aria-hidden/d-none)
  //   - <dialog> elements not explicitly opened (dialog element without 'open')
  //   - third-party chat widgets / cookie bars (position:fixed but no modal keyword)
  //   - navigation dropdowns / active menu items (no inline position:fixed)
  const $$ = cheerio.load(result.html);
  const interstitialKeywords = /\b(modal|popup|overlay|lightbox|interstitial)\b/i;
  const hiddenClassPattern = /\b(d-none|hidden|is-hidden|hide|ng-hide|sr-only|visually-hidden|invisible)\b/i;

  const visibleInterstitials: string[] = [];

  $$('[class], [id]').each((_, el) => {
    const classVal = $$(el).attr('class') ?? '';
    const idVal = $$(el).attr('id') ?? '';
    if (!interstitialKeywords.test(classVal) && !interstitialKeywords.test(idVal)) return;

    // Skip if hidden via HTML attributes
    if ($$(el).attr('hidden') !== undefined) return;
    if ($$(el).attr('aria-hidden') === 'true') return;
    // <dialog> without `open` is hidden by default per HTML spec
    if (el.type === 'tag' && el.tagName.toLowerCase() === 'dialog' && $$(el).attr('open') === undefined) return;

    const inlineStyle = ($$(el).attr('style') ?? '').toLowerCase();
    // Skip if hidden via inline style
    if (inlineStyle.includes('display:none') || inlineStyle.includes('display: none')) return;
    if (inlineStyle.includes('visibility:hidden') || inlineStyle.includes('visibility: hidden')) return;
    // Skip if hidden via CSS-framework hidden class
    if (hiddenClassPattern.test(classVal)) return;

    // Require position:fixed in inline style — the definitive signal that this
    // element covers content at render time. Without it, the element is just a
    // DOM template (Bootstrap modals, GitHub Primer overlays etc.) hidden by CSS.
    const isFixed = inlineStyle.includes('position:fixed') || inlineStyle.includes('position: fixed');
    if (!isFixed) return;

    const keyword = interstitialKeywords.exec(classVal) ?? interstitialKeywords.exec(idVal);
    if (keyword) visibleInterstitials.push(keyword[1].toLowerCase());
  });

  // Also catch <dialog open> — explicit open state on a dialog element
  $$('dialog[open]').each(() => {
    visibleInterstitials.push('dialog');
  });

  const uniqueIndicators = [...new Set(visibleInterstitials)];

  if (uniqueIndicators.length >= 1) {
    issues.push({
      code: 'mobile_usability_interstitial',
      severity: 'P2',
      category: 'SEO',
      title: 'Page may have intrusive interstitials',
      whyItMatters: 'Google penalizes pages with intrusive interstitials (popups, modals) that block content on mobile. These hurt user experience and can negatively impact rankings.',
      howToFix: 'Ensure popups/modals don\'t cover main content on mobile page load. Use banners instead of full-screen overlays. Delay interstitials until after user interaction.',
      evidence: {
        url: result.url,
        snippet: `Detected patterns: ${uniqueIndicators.join(', ')}`,
        actual: `Found ${uniqueIndicators.length} potential interstitial pattern(s)`
      },
      impact: 3,
      effort: 2,
    });
  }

  return issues;
}
