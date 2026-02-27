import type { CrawlResult } from '../crawler';
import type { SPAIssue } from './types';

/**
 * JS framework detection patterns for script src and inline scripts.
 */
const JS_FRAMEWORK_PATTERNS: Record<string, RegExp[]> = {
  react: [
    /react(?:\.min)?\.js/i,
    /react-dom(?:\.min)?\.js/i,
    /\/_next\//,
    /\/next\//,
    /__NEXT_DATA__/,
  ],
  vue: [
    /vue(?:\.min)?\.js/i,
    /vue\.runtime(?:\.min)?\.js/i,
    /\/_nuxt\//,
    /__NUXT__/,
  ],
  angular: [
    /angular(?:\.min)?\.js/i,
    /zone\.js/i,
    /ng-version/i,
  ],
  svelte: [
    /svelte(?:\.min)?\.js/i,
    /\/__svelte\//,
    /svelte-kit/i,
  ],
};

/**
 * Detect if a page appears to be a client-side rendered SPA,
 * which may cause incomplete audit results.
 */
export function checkSPARendering(result: CrawlResult): SPAIssue[] {
  const issues: SPAIssue[] = [];
  const indicators: string[] = [];
  const html = result.html || '';

  // Check for SPA framework mount points
  if (/<div\s+id=["'](root|app|__next|__nuxt|__svelte)["']/.test(html)) {
    indicators.push('Framework mount point detected');
  }

  // Check for common SPA bundles
  if (/\b(react|vue|angular|svelte)\b/i.test(html) || /\b(chunk|bundle)\.\w+\.js\b/.test(html)) {
    indicators.push('SPA framework or bundled JS detected');
  }

  // Check for noscript tags (often present in SPAs)
  if (/<noscript>/.test(html)) {
    indicators.push('<noscript> fallback present');
  }

  // Only flag if word count is very low AND we found SPA indicators
  const isLikelySPA = indicators.length >= 2 && (result.wordCount ?? 0) < 100;

  // Also flag if the body has almost no content but has script tags
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  const bodyContent = bodyMatch ? bodyMatch[1] : '';
  const scriptStripped = bodyContent
    .replaceAll(/<script[\s\S]*?<\/script>/gi, '')
    .replaceAll(/<[^>]+>/g, '')
    .trim();
  const bodyTextLength = scriptStripped.length;
  const hasMinimalBody = bodyTextLength < 200 && indicators.length >= 1;

  if (isLikelySPA || hasMinimalBody) {
    issues.push({
      code: 'spa_rendering',
      severity: 'P2',
      category: 'SEO',
      title: 'Site appears to use client-side rendering',
      whyItMatters:
        'Search engines may not fully execute JavaScript, meaning your content could be invisible to crawlers. Client-rendered content can also hurt Core Web Vitals and initial load performance.',
      howToFix:
        'Consider using Server-Side Rendering (SSR) or Static Site Generation (SSG) with frameworks like Next.js, Nuxt, or SvelteKit. For existing SPAs, implement pre-rendering or dynamic rendering for search engine bots.',
      evidence: {
        url: result.url,
        wordCount: result.wordCount ?? 0,
        bodyTextLength,
        indicators,
      },
      impact: 4,
      effort: 4,
    });
  }

  // JS Framework Detection (P3/Info)
  const detectedFrameworks: string[] = [];
  for (const [framework, patterns] of Object.entries(JS_FRAMEWORK_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(html)) {
        detectedFrameworks.push(framework);
        break; // Only count each framework once
      }
    }
  }

  if (detectedFrameworks.length > 0) {
    issues.push({
      code: 'js_framework_detected',
      severity: 'P3',
      category: 'SEO',
      title: `JavaScript framework detected: ${detectedFrameworks.join(', ')}`,
      whyItMatters:
        'JavaScript frameworks can affect how search engines crawl and index your content. While modern search engines can execute JavaScript, server-side rendering is still recommended for optimal SEO.',
      howToFix:
        'Ensure your framework uses SSR/SSG for critical content. For React, consider Next.js; for Vue, consider Nuxt; for Svelte, consider SvelteKit. Verify content is visible in View Source, not just after JS execution.',
      evidence: {
        url: result.url,
        frameworks: detectedFrameworks,
      },
      impact: 2,
      effort: 3,
    });
  }

  // Lazy Load Above Fold (P2)
  // Check if the first 3 img tags use loading="lazy" (above-fold images shouldn't)
  const imgTagMatches = [...html.matchAll(/<img\s[^>]*>/gi)];
  const aboveFoldImgCount = Math.min(3, imgTagMatches.length);
  const lazyAboveFoldImages: string[] = [];

  for (let i = 0; i < aboveFoldImgCount; i++) {
    const imgTag = imgTagMatches[i][0];
    if (/\bloading\s*=\s*["']lazy["']/i.test(imgTag)) {
      // Extract src for evidence
      const srcMatch = imgTag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
      const src = srcMatch ? srcMatch[1] : `Image ${i + 1}`;
      lazyAboveFoldImages.push(src);
    }
  }

  if (lazyAboveFoldImages.length > 0) {
    issues.push({
      code: 'lazy_load_above_fold',
      severity: 'P2',
      category: 'PERFORMANCE',
      title: 'Above-the-fold images use lazy loading',
      whyItMatters:
        'Images that appear above the fold (visible without scrolling) should load immediately. Using loading="lazy" on these images delays their display, hurting Largest Contentful Paint (LCP) and user experience.',
      howToFix:
        'Remove loading="lazy" from the first few images on your page (typically hero images, logos, or main content images). Reserve lazy loading for images below the fold.',
      evidence: {
        url: result.url,
        lazyImages: lazyAboveFoldImages,
        count: lazyAboveFoldImages.length,
      },
      impact: 4,
      effort: 1,
    });
  }

  // Noscript Fallback Missing (P2)
  // If page uses JS framework, check for meaningful <noscript> content
  if (detectedFrameworks.length > 0 || isLikelySPA || hasMinimalBody) {
    const noscriptMatches = [...html.matchAll(/<noscript[^>]*>([\s\S]*?)<\/noscript>/gi)];
    let hasMeaningfulNoscript = false;

    for (const match of noscriptMatches) {
      const noscriptContent = match[1]
        .replaceAll(/<[^>]+>/g, '')
        .trim();
      // Consider meaningful if it has substantial content (>100 chars)
      // Even if it mentions "enable JavaScript", longer explanations are acceptable
      if (noscriptContent.length > 100) {
        hasMeaningfulNoscript = true;
        break;
      }
    }

    if (!hasMeaningfulNoscript) {
      issues.push({
        code: 'noscript_fallback_missing',
        severity: 'P2',
        category: 'SEO',
        title: 'Missing meaningful <noscript> fallback',
        whyItMatters:
          'Pages relying on JavaScript should provide <noscript> content for search engines that don\'t execute JS, users with JS disabled, and as a fallback for failed script loads. Without it, these users see a blank or broken page.',
        howToFix:
          'Add a <noscript> tag with meaningful content that describes the page or provides essential information. At minimum, include a message explaining the page requires JavaScript and provide basic navigation.',
        evidence: {
          url: result.url,
          hasNoscript: noscriptMatches.length > 0,
          noscriptCount: noscriptMatches.length,
          frameworks: detectedFrameworks,
        },
        impact: 3,
        effort: 2,
      });
    }
  }

  // Client-Side Only Links (P3)
  // Check for links that are JavaScript-only (href="#" or href="javascript:")
  const linkMatches = [...html.matchAll(/<a\s[^>]*href\s*=\s*["']([^"']*)["'][^>]*>/gi)];
  const jsOnlyLinks: Array<{ href: string; snippet: string }> = [];

  for (const match of linkMatches) {
    const href = match[1].trim();
    const fullTag = match[0];

    // Check for JavaScript-only link patterns
    if (
      href === '#' ||
      href === '' ||
      href.toLowerCase().startsWith('javascript:') ||
      href === '#!' ||
      href === '#/' // Hash routing pattern
    ) {
      // Skip if it has an aria-label or meaningful onclick that suggests it's intentional
      // But still flag it for SEO purposes
      const snippet = fullTag.length > 100 ? fullTag.slice(0, 100) + '...' : fullTag;
      jsOnlyLinks.push({ href, snippet });
    }
  }

  if (jsOnlyLinks.length > 0) {
    // Limit evidence to first 5 examples
    const examples = jsOnlyLinks.slice(0, 5);
    issues.push({
      code: 'client_side_links',
      severity: 'P3',
      category: 'SEO',
      title: `Found ${jsOnlyLinks.length} JavaScript-only link(s)`,
      whyItMatters:
        'Links with href="#" or href="javascript:" are not crawlable by search engines. These links won\'t pass PageRank or help search engines discover your content structure. They also break functionality when JavaScript fails.',
      howToFix:
        'Replace JavaScript-only links with real URLs. Use proper <a href="/real-path"> for navigation. If the link triggers a modal or action, consider using a <button> element instead, or provide a fallback URL.',
      evidence: {
        url: result.url,
        count: jsOnlyLinks.length,
        examples: examples.map(l => l.href),
        snippets: examples.map(l => l.snippet),
      },
      impact: 2,
      effort: 2,
    });
  }

  return issues;
}
