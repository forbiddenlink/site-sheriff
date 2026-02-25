import type { CrawlResult } from './crawler';

export interface SEOIssue {
  code: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  category: 'SEO' | 'CONTENT' | 'ACCESSIBILITY';
  title: string;
  whyItMatters: string;
  howToFix: string;
  evidence: {
    url: string;
    expected?: string;
    actual?: string | null;
    snippet?: string;
    src?: string;
    width?: number;
    height?: number;
  };
  impact: number;
  effort: number;
}

/**
 * Analyze a crawl result for SEO issues
 */
export function checkSEO(result: CrawlResult): SEOIssue[] {
  const issues: SEOIssue[] = [];
  let isHomepage = false;
  try { isHomepage = ['/', ''].includes(new URL(result.url).pathname); } catch { /* ignore */ }

  // Missing title
  if (!result.title) {
    issues.push({
      code: 'missing_title',
      severity: 'P0',
      category: 'SEO',
      title: 'Missing page title',
      whyItMatters: 'Page titles are critical for SEO and appear in search results. Missing titles hurt rankings and click-through rates.',
      howToFix: 'Add a <title> tag inside the <head> section with a descriptive, unique title (50-60 characters).',
      evidence: { url: result.url },
      impact: 5,
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

  // Missing meta description
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

  // Missing H1
  if (!result.h1) {
    issues.push({
      code: 'missing_h1',
      severity: 'P1',
      category: 'SEO',
      title: 'Missing H1 heading',
      whyItMatters: 'H1 headings help search engines understand page content and are important for accessibility.',
      howToFix: 'Add a single, descriptive <h1> tag that summarizes the page content.',
      evidence: { url: result.url },
      impact: 4,
      effort: 1,
    });
  }

  // Missing canonical
  if (!result.canonical) {
    issues.push({
      code: 'missing_canonical',
      severity: 'P2',
      category: 'SEO',
      title: 'Missing canonical URL',
      whyItMatters: 'Canonical tags prevent duplicate content issues by telling search engines which URL is the "official" version.',
      howToFix: 'Add <link rel="canonical" href="..."> pointing to the preferred URL for this page.',
      evidence: { url: result.url },
      impact: 3,
      effort: 1,
    });
  } else if (result.canonical && !result.canonical.startsWith('http')) {
    issues.push({
      code: 'relative_canonical',
      severity: 'P2',
      category: 'SEO',
      title: 'Canonical URL is relative',
      whyItMatters: 'Relative canonical URLs can be misinterpreted by search engines, potentially causing indexing issues.',
      howToFix: 'Use an absolute URL for the canonical tag. Change to the full URL including protocol and domain.',
      evidence: { url: result.url, actual: result.canonical },
      impact: 3,
      effort: 1,
    });
  } else {
    try {
      const canonicalDomain = new URL(result.canonical).hostname;
      const pageDomain = new URL(result.url).hostname;
      if (canonicalDomain !== pageDomain) {
        issues.push({
          code: 'cross_domain_canonical',
          severity: 'P1',
          category: 'SEO',
          title: 'Canonical URL points to a different domain',
          whyItMatters: 'A canonical tag pointing to a different domain tells search engines to index that domain\'s version instead. This is usually a misconfiguration.',
          howToFix: 'Update the canonical tag to point to the correct domain, or remove it if cross-domain canonicalization is not intended.',
          evidence: { url: result.url, actual: result.canonical, expected: pageDomain },
          impact: 5,
          effort: 1,
        });
      }
    } catch {
      // Invalid URL format — skip cross-domain check
    }
  }

  // Noindex detection
  if (result.robotsMeta?.toLowerCase().includes('noindex')) {
    issues.push({
      code: 'page_noindex',
      severity: 'P0',
      category: 'SEO',
      title: 'Page is set to noindex',
      whyItMatters: 'This page will not appear in search results. If this is intentional, you can ignore this. If not, fix immediately.',
      howToFix: 'Remove "noindex" from the robots meta tag if you want this page indexed.',
      evidence: { url: result.url, actual: result.robotsMeta },
      impact: 5,
      effort: 1,
    });
  }

  // ── Open Graph checks ────────────────────────────────────────────────
  if (!result.ogTags['og:title']) {
    issues.push({
      code: 'missing_og_title',
      severity: 'P2',
      category: 'SEO',
      title: 'Missing og:title meta tag',
      whyItMatters: 'Open Graph title controls how the page appears when shared on social media. Without it, platforms guess the title and often get it wrong.',
      howToFix: 'Add <meta property="og:title" content="Your Page Title"> to the <head>.',
      evidence: { url: result.url },
      impact: 3,
      effort: 1,
    });
  }

  if (!result.ogTags['og:description']) {
    issues.push({
      code: 'missing_og_description',
      severity: 'P3',
      category: 'SEO',
      title: 'Missing og:description meta tag',
      whyItMatters: 'Controls the description shown when shared on Facebook, LinkedIn, etc.',
      howToFix: 'Add <meta property="og:description" content="..."> to the <head>.',
      evidence: { url: result.url },
      impact: 2,
      effort: 1,
    });
  }

  if (!result.ogTags['og:image']) {
    issues.push({
      code: 'missing_og_image',
      severity: 'P2',
      category: 'SEO',
      title: 'Missing og:image meta tag',
      whyItMatters: 'Pages shared on social media without an og:image show a blank preview, dramatically reducing click-through rates.',
      howToFix: 'Add <meta property="og:image" content="https://..."> with an image at least 1200x630px.',
      evidence: { url: result.url },
      impact: 3,
      effort: 2,
    });
  } else if (result.ogTags['og:image'] && !result.ogTags['og:image'].startsWith('http')) {
    issues.push({
      code: 'og_image_relative',
      severity: 'P2',
      category: 'SEO',
      title: 'Open Graph image URL is relative',
      whyItMatters: 'Relative og:image URLs may not be resolved correctly by social media platforms, resulting in missing or broken preview images.',
      howToFix: 'Use an absolute URL for og:image including protocol and domain.',
      evidence: { url: result.url, actual: result.ogTags['og:image'] },
      impact: 3,
      effort: 1,
    });
  }

  if (!result.ogTags['twitter:card']) {
    issues.push({
      code: 'missing_twitter_card',
      severity: 'P3',
      category: 'SEO',
      title: 'Missing twitter:card meta tag',
      whyItMatters: 'Without a Twitter Card meta tag, links shared on X/Twitter show minimal previews.',
      howToFix: 'Add <meta name="twitter:card" content="summary_large_image"> to the <head>.',
      evidence: { url: result.url },
      impact: 2,
      effort: 1,
    });
  }

  // ── Viewport check ───────────────────────────────────────────────────
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
  } else if (result.viewport && !result.viewport.includes('width=device-width')) {
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

  // ── Language attribute check ──────────────────────────────────────────
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

  // ── Favicon check (homepage only) ─────────────────────────────────────
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

  // ── Hreflang validation ───────────────────────────────────────────────
  if (result.html) {
    const hreflangMatches = [...result.html.matchAll(/<link[^>]*\bhreflang\s*=\s*["']([^"']+)["'][^>]*>/gi)];
    const hreflangTags: Array<{ lang: string; href: string }> = [];
    for (const match of hreflangMatches) {
      const tag = match[0];
      if (!/\brel\s*=\s*["']alternate["']/i.test(tag)) continue;
      const lang = match[1];
      const hrefMatch = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag);
      const href = hrefMatch?.[1] ?? '';
      hreflangTags.push({ lang, href });
    }

    if (hreflangTags.length > 0) {
      // Self-referencing check
      const normalizedPageUrl = result.url.replace(/\/$/, '').toLowerCase();
      const hasSelfReference = hreflangTags.some(t => {
        try { return t.href.replace(/\/$/, '').toLowerCase() === normalizedPageUrl; }
        catch { return false; }
      });
      if (!hasSelfReference) {
        issues.push({
          code: 'hreflang_missing_self_reference',
          severity: 'P2',
          category: 'SEO',
          title: 'Hreflang missing self-referencing tag',
          whyItMatters: 'Each page with hreflang tags should include a self-referencing entry. Without it, search engines may not correctly associate the page with its language/region.',
          howToFix: 'Add a <link rel="alternate" hreflang="..." href="..."> tag that points to the current page URL.',
          evidence: { url: result.url, snippet: `Found ${hreflangTags.length} hreflang tag(s) but none point to this page` },
          impact: 3,
          effort: 1,
        });
      }

      // Invalid language code check
      const validLangRegex = /^[a-z]{2}(-[A-Z]{2})?$|^x-default$/;
      for (const tag of hreflangTags) {
        if (!validLangRegex.test(tag.lang)) {
          issues.push({
            code: 'hreflang_invalid_language',
            severity: 'P2',
            category: 'SEO',
            title: 'Invalid hreflang language code',
            whyItMatters: 'Invalid language codes in hreflang tags are ignored by search engines, defeating the purpose of international targeting.',
            howToFix: 'Use valid ISO 639-1 language codes (e.g., "en", "fr") optionally followed by ISO 3166-1 region codes (e.g., "en-US", "fr-CA"), or "x-default".',
            evidence: { url: result.url, actual: tag.lang, expected: 'Valid language code like "en", "en-US", or "x-default"' },
            impact: 3,
            effort: 1,
          });
        }
      }
    }
  }

  // ── URL structure checks ─────────────────────────────────────────────
  try {
    const urlPath = new URL(result.url).pathname + new URL(result.url).search;

    // Check for uppercase characters in URL
    if (/[A-Z]/.test(urlPath)) {
      issues.push({
        code: 'url_uppercase',
        severity: 'P3',
        category: 'SEO',
        title: 'URL contains uppercase characters',
        whyItMatters: 'URLs are case-sensitive on most servers. Uppercase URLs can cause duplicate content issues if the same page is accessible via different cases, and they look less clean.',
        howToFix: 'Use lowercase URLs consistently. Set up 301 redirects from uppercase variants to lowercase versions.',
        evidence: { url: result.url, actual: urlPath },
        impact: 1,
        effort: 2,
      });
    }

    // Check for URL length (path + query string)
    if (urlPath.length > 115) {
      issues.push({
        code: 'url_too_long',
        severity: 'P3',
        category: 'SEO',
        title: 'URL is too long',
        whyItMatters: 'Long URLs are harder to share, may get truncated in some contexts, and can indicate poor URL structure. Search engines may also give less weight to keywords far into the URL.',
        howToFix: 'Shorten the URL by removing unnecessary words, using shorter slugs, or restructuring your URL hierarchy.',
        evidence: { url: result.url, actual: `${urlPath.length} characters`, expected: 'Under 115 characters' },
        impact: 1,
        effort: 2,
      });
    }

    // Check for underscores instead of hyphens
    if (urlPath.includes('_')) {
      issues.push({
        code: 'url_underscores',
        severity: 'P3',
        category: 'SEO',
        title: 'URL uses underscores instead of hyphens',
        whyItMatters: 'Google treats hyphens as word separators but not underscores. Using underscores means search engines see "my_page" as one word rather than "my page".',
        howToFix: 'Replace underscores with hyphens in URLs. Set up 301 redirects from old underscore URLs to new hyphenated versions.',
        evidence: { url: result.url, actual: urlPath },
        impact: 1,
        effort: 2,
      });
    }
  } catch {
    // Invalid URL - skip URL structure checks
  }

  // ── Pagination rel=prev/next check ──────────────────────────────────────
  if (result.html) {
    const prevMatch = result.html.match(/<link[^>]*\brel\s*=\s*["']prev["'][^>]*>/i);
    const nextMatch = result.html.match(/<link[^>]*\brel\s*=\s*["']next["'][^>]*>/i);

    // Extract href from prev/next links
    const prevHrefMatch = prevMatch ? prevMatch[0].match(/\bhref\s*=\s*["']([^"']+)["']/i) : null;
    const nextHrefMatch = nextMatch ? nextMatch[0].match(/\bhref\s*=\s*["']([^"']+)["']/i) : null;

    const prevHref = prevHrefMatch?.[1];
    const nextHref = nextHrefMatch?.[1];

    // Detect pagination pattern in URL (e.g., ?page=2, /page/2, /p/2, etc.)
    const paginationPatterns = [
      /[?&]page=\d+/i,
      /\/page\/\d+/i,
      /\/p\/\d+/i,
      /[?&]p=\d+/i,
      /[?&]offset=\d+/i,
      /\/\d+\/?$/,
    ];
    const urlLooksPaginated = paginationPatterns.some(p => p.test(result.url));

    // If page looks paginated but has no prev/next links
    if (urlLooksPaginated && !prevMatch && !nextMatch) {
      issues.push({
        code: 'pagination_missing_rel_links',
        severity: 'P2',
        category: 'SEO',
        title: 'Paginated page missing rel=prev/next links',
        whyItMatters: 'Search engines use rel=prev and rel=next to understand pagination sequences. Without them, search engines may not discover all paginated content or may treat each page as standalone.',
        howToFix: 'Add <link rel="prev" href="..."> and <link rel="next" href="..."> tags to paginated pages pointing to adjacent pages in the sequence.',
        evidence: { url: result.url, snippet: 'URL appears paginated but no rel=prev/next found' },
        impact: 3,
        effort: 1,
      });
    }

    // Validate prev/next href values if present
    if (prevHref && !prevHref.startsWith('http') && !prevHref.startsWith('/')) {
      issues.push({
        code: 'pagination_prev_relative',
        severity: 'P3',
        category: 'SEO',
        title: 'rel=prev uses non-standard URL format',
        whyItMatters: 'Relative URLs in rel=prev may not be resolved correctly by all search engines.',
        howToFix: 'Use absolute URLs for rel=prev (starting with https:// or /).',
        evidence: { url: result.url, actual: prevHref },
        impact: 2,
        effort: 1,
      });
    }

    if (nextHref && !nextHref.startsWith('http') && !nextHref.startsWith('/')) {
      issues.push({
        code: 'pagination_next_relative',
        severity: 'P3',
        category: 'SEO',
        title: 'rel=next uses non-standard URL format',
        whyItMatters: 'Relative URLs in rel=next may not be resolved correctly by all search engines.',
        howToFix: 'Use absolute URLs for rel=next (starting with https:// or /).',
        evidence: { url: result.url, actual: nextHref },
        impact: 2,
        effort: 1,
      });
    }
  }

  return issues;
}

/**
 * Common non-descriptive anchor text patterns to flag
 */
const NON_DESCRIPTIVE_ANCHOR_PATTERNS = [
  /^click\s*here$/i,
  /^here$/i,
  /^read\s*more$/i,
  /^learn\s*more$/i,
  /^more$/i,
  /^link$/i,
  /^this$/i,
  /^this\s*link$/i,
  /^go$/i,
  /^see\s*more$/i,
  /^continue$/i,
  /^continue\s*reading$/i,
  /^details$/i,
  /^info$/i,
  /^view$/i,
  /^view\s*more$/i,
];

/**
 * Check anchor text quality for all links on a page
 */
export function checkAnchorText(result: CrawlResult): SEOIssue[] {
  const issues: SEOIssue[] = [];

  for (const link of result.links) {
    const anchorText = link.text.trim();

    // Check for empty anchor text (P2 - more important)
    if (!anchorText) {
      issues.push({
        code: 'empty_anchor_text',
        severity: 'P2',
        category: 'SEO',
        title: 'Link has empty anchor text',
        whyItMatters: 'Empty anchor text provides no context to users or search engines about where the link leads. Screen readers will only announce "link" without describing the destination.',
        howToFix: 'Add descriptive text to the link that explains where it leads. For image links, ensure the image has alt text.',
        evidence: { url: result.url, snippet: `Link to: ${link.href}` },
        impact: 3,
        effort: 1,
      });
      continue;
    }

    // Check for non-descriptive anchor text (P3 - minor issue)
    for (const pattern of NON_DESCRIPTIVE_ANCHOR_PATTERNS) {
      if (pattern.test(anchorText)) {
        issues.push({
          code: 'non_descriptive_anchor',
          severity: 'P3',
          category: 'SEO',
          title: 'Link uses non-descriptive anchor text',
          whyItMatters: 'Generic anchor text like "click here" or "read more" provides no SEO value and poor accessibility. Search engines use anchor text to understand linked content.',
          howToFix: 'Replace generic text with descriptive anchor text that indicates the link destination. For example, change "click here" to "view our pricing plans".',
          evidence: { url: result.url, actual: anchorText, snippet: `Link to: ${link.href}` },
          impact: 2,
          effort: 1,
        });
        break; // Only report once per link
      }
    }
  }

  return issues;
}

/**
 * Check for structured data (JSON-LD) in the page HTML
 */
export function checkStructuredData(result: CrawlResult): SEOIssue[] {
  const issues: SEOIssue[] = [];
  if (!result.html) return issues;

  // Find all JSON-LD script blocks
  const jsonLdPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const matches = [...result.html.matchAll(jsonLdPattern)];
  const isHomepage = (() => { try { return ['/', ''].includes(new URL(result.url).pathname); } catch { return false; } })();

  if (matches.length === 0 && isHomepage) {
    issues.push({
      code: 'missing_structured_data',
      severity: 'P3',
      category: 'SEO',
      title: 'No structured data (JSON-LD) found',
      whyItMatters: 'Structured data helps search engines understand your content and can enable rich results (stars, FAQs, breadcrumbs) in search listings.',
      howToFix: 'Add JSON-LD structured data to describe your page content. Start with Organization, WebSite, or Article schema as appropriate.',
      evidence: { url: result.url },
      impact: 3,
      effort: 2,
    });
  } else {
    for (const match of matches) {
      const content = match[1];
      try {
        JSON.parse(content);
      } catch {
        issues.push({
          code: 'invalid_json_ld',
          severity: 'P2',
          category: 'SEO',
          title: 'Invalid JSON-LD structured data',
          whyItMatters: 'Malformed JSON-LD will be ignored by search engines, meaning you lose the benefits of structured data entirely.',
          howToFix: 'Validate your JSON-LD using Google\'s Rich Results Test or Schema.org validator and fix any syntax errors.',
          evidence: { url: result.url, snippet: content.slice(0, 200) },
          impact: 4,
          effort: 1,
        });
      }
    }
  }

  return issues;
}

/**
 * Detect duplicate titles and descriptions across all crawled pages
 */
export function checkDuplicates(results: CrawlResult[]): SEOIssue[] {
  const issues: SEOIssue[] = [];
  const successfulResults = results.filter(r => !r.error && r.statusCode >= 200 && r.statusCode < 400);

  // Check duplicate titles
  const titleMap = new Map<string, string[]>();
  for (const r of successfulResults) {
    if (r.title) {
      const key = r.title.toLowerCase().trim();
      if (!titleMap.has(key)) titleMap.set(key, []);
      titleMap.get(key)!.push(r.url);
    }
  }

  for (const [title, urls] of titleMap) {
    if (urls.length > 1) {
      issues.push({
        code: 'duplicate_title',
        severity: 'P2',
        category: 'SEO',
        title: `Duplicate title across ${urls.length} pages`,
        whyItMatters: 'Duplicate titles make it hard for search engines to differentiate pages, reducing the chance each page ranks for unique keywords.',
        howToFix: 'Give each page a unique, descriptive title that reflects its specific content.',
        evidence: {
          url: urls[0],
          actual: title,
          snippet: urls.join(', '),
        },
        impact: 3,
        effort: 2,
      });
    }
  }

  // Check duplicate descriptions
  const descMap = new Map<string, string[]>();
  for (const r of successfulResults) {
    if (r.metaDescription) {
      const key = r.metaDescription.toLowerCase().trim();
      if (!descMap.has(key)) descMap.set(key, []);
      descMap.get(key)!.push(r.url);
    }
  }

  for (const [desc, urls] of descMap) {
    if (urls.length > 1) {
      issues.push({
        code: 'duplicate_meta_description',
        severity: 'P2',
        category: 'SEO',
        title: `Duplicate meta description across ${urls.length} pages`,
        whyItMatters: 'Duplicate descriptions reduce the effectiveness of search result snippets and suggest poor content differentiation.',
        howToFix: 'Write a unique meta description for each page that summarizes its specific content.',
        evidence: {
          url: urls[0],
          actual: desc.slice(0, 100),
          snippet: urls.join(', '),
        },
        impact: 2,
        effort: 2,
      });
    }
  }

  return issues;
}

/**
 * Detect if a page appears to be a client-side rendered SPA,
 * which may cause incomplete audit results.
 */
export function checkSPARendering(result: CrawlResult): Array<{
  code: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  category: 'SEO' | 'ACCESSIBILITY' | 'PERFORMANCE' | 'LINKS' | 'CONTENT' | 'SECURITY';
  title: string;
  whyItMatters: string | null;
  howToFix: string | null;
  evidence: object;
  impact: number | null;
  effort: number | null;
}> {
  const issues: Array<{
    code: string;
    severity: 'P0' | 'P1' | 'P2' | 'P3';
    category: 'SEO' | 'ACCESSIBILITY' | 'PERFORMANCE' | 'LINKS' | 'CONTENT' | 'SECURITY';
    title: string;
    whyItMatters: string | null;
    howToFix: string | null;
    evidence: object;
    impact: number | null;
    effort: number | null;
  }> = [];
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
      severity: 'P2' as const,
      category: 'SEO' as const,
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

  return issues;
}

/**
 * Validate that og:image and twitter:image URLs actually resolve to valid images.
 * This is a cross-page check that deduplicates image URLs before checking.
 */
export async function validateOgImages(results: CrawlResult[]): Promise<Array<{
  code: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  category: 'SEO';
  title: string;
  whyItMatters: string;
  howToFix: string;
  evidence: object;
  impact: number;
  effort: number;
}>> {
  const issues: Array<{
    code: string;
    severity: 'P0' | 'P1' | 'P2' | 'P3';
    category: 'SEO';
    title: string;
    whyItMatters: string;
    howToFix: string;
    evidence: object;
    impact: number;
    effort: number;
  }> = [];

  // Collect unique image URLs and track which pages reference them
  const imageUrlToPages = new Map<string, string[]>();
  for (const result of results) {
    if (result.error) continue;
    const ogImage = result.ogTags['og:image'];
    const twitterImage = result.ogTags['twitter:image'];
    for (const imgUrl of [ogImage, twitterImage]) {
      if (imgUrl?.startsWith('http')) {
        if (!imageUrlToPages.has(imgUrl)) imageUrlToPages.set(imgUrl, []);
        imageUrlToPages.get(imgUrl)!.push(result.url);
      }
    }
  }

  const uniqueUrls = Array.from(imageUrlToPages.keys());
  const BATCH_SIZE = 5;

  for (let i = 0; i < uniqueUrls.length; i += BATCH_SIZE) {
    const batch = uniqueUrls.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (imgUrl) => {
        const pages = imageUrlToPages.get(imgUrl)!;
        const pageUrl = pages[0];

        let response: Response | null = null;
        let errorMessage: string | null = null;

        // Try HEAD first, fall back to GET
        for (const method of ['HEAD', 'GET'] as const) {
          try {
            response = await fetch(imgUrl, {
              method,
              signal: AbortSignal.timeout(5000),
              headers: { 'User-Agent': 'SiteSheriffBot/1.0' },
              redirect: 'follow',
            });
            break;
          } catch (err) {
            errorMessage = err instanceof Error ? err.message : String(err);
            if (method === 'HEAD') {
              // HEAD failed, try GET
              continue;
            }
          }
        }

        if (!response) {
          // Both HEAD and GET failed
          issues.push({
            code: 'og_image_broken',
            severity: 'P1',
            category: 'SEO',
            title: `Open Graph image returns error`,
            whyItMatters:
              'The og:image URL does not resolve to a valid image. When this page is shared on social media, it will show a broken or missing preview image.',
            howToFix:
              'Fix the image URL or upload the image to the correct location. Verify the URL is accessible publicly (not behind auth).',
            evidence: { url: pageUrl, ogImageUrl: imgUrl, httpStatus: null, error: errorMessage },
            impact: 4,
            effort: 1,
          });
          return;
        }

        if (response.status >= 400) {
          issues.push({
            code: 'og_image_broken',
            severity: 'P1',
            category: 'SEO',
            title: `Open Graph image returns ${response.status}`,
            whyItMatters:
              'The og:image URL does not resolve to a valid image. When this page is shared on social media, it will show a broken or missing preview image.',
            howToFix:
              'Fix the image URL or upload the image to the correct location. Verify the URL is accessible publicly (not behind auth).',
            evidence: { url: pageUrl, ogImageUrl: imgUrl, httpStatus: response.status, error: null },
            impact: 4,
            effort: 1,
          });
          return;
        }

        // Check Content-Type for 200 responses
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.startsWith('image/')) {
          issues.push({
            code: 'og_image_not_image',
            severity: 'P2',
            category: 'SEO',
            title: 'Open Graph image URL is not an image',
            whyItMatters:
              'The og:image URL points to a resource that is not an image file. Social media platforms may not display it correctly.',
            howToFix:
              'Ensure the og:image URL points to an actual image file (JPEG, PNG, WebP).',
            evidence: { url: pageUrl, ogImageUrl: imgUrl, contentType },
            impact: 3,
            effort: 1,
          });
        }
      }),
    );

    // Log any unexpected rejections (shouldn't happen since we catch inside)
    for (const r of batchResults) {
      if (r.status === 'rejected') {
        console.warn('OG image validation batch error:', r.reason);
      }
    }
  }

  return issues;
}

/**
 * Validate that canonical URLs actually resolve and point to the correct domain.
 * This is a cross-page check that deduplicates canonical URLs before checking.
 */
export async function validateCanonicals(results: CrawlResult[]): Promise<SEOIssue[]> {
  const issues: SEOIssue[] = [];

  // Collect unique canonical URLs and track which pages reference them
  const canonicalToPages = new Map<string, string[]>();
  for (const result of results) {
    if (result.error) continue;
    if (result.canonical?.startsWith('http')) {
      if (!canonicalToPages.has(result.canonical)) canonicalToPages.set(result.canonical, []);
      canonicalToPages.get(result.canonical)!.push(result.url);
    }
  }

  for (const [canonicalUrl, pages] of canonicalToPages) {
    const pageUrl = pages[0];

    // Check for cross-domain canonical
    try {
      const pageDomain = new URL(pageUrl).hostname;
      const canonicalDomain = new URL(canonicalUrl).hostname;
      if (canonicalDomain !== pageDomain) {
        issues.push({
          code: 'canonical_cross_domain',
          severity: 'P2',
          category: 'SEO',
          title: 'Cross-domain canonical URL',
          whyItMatters:
            'A canonical pointing to a different domain tells search engines this page is a copy of content on another site. This may be intentional (syndication) but is often a misconfiguration that gives away your ranking credit.',
          howToFix:
            'Verify this is intentional. If not, update the canonical to point to your own domain.',
          evidence: { url: pageUrl, actual: canonicalUrl, expected: pageDomain, snippet: `Page domain: ${pageDomain}, Canonical domain: ${canonicalDomain}` },
          impact: 4,
          effort: 1,
        });
      }
    } catch {
      // Invalid URL — skip cross-domain check
    }

    // Verify canonical URL resolves
    try {
      let response: Response | null = null;
      let errorMessage: string | null = null;

      for (const method of ['HEAD', 'GET'] as const) {
        try {
          response = await fetch(canonicalUrl, {
            method,
            signal: AbortSignal.timeout(5000),
            headers: { 'User-Agent': 'SiteSheriffBot/1.0' },
            redirect: 'follow',
          });
          break;
        } catch (err) {
          errorMessage = err instanceof Error ? err.message : String(err);
          if (method === 'HEAD') continue;
        }
      }

      if (!response) {
        issues.push({
          code: 'canonical_url_broken',
          severity: 'P1',
          category: 'SEO',
          title: 'Canonical URL returns error',
          whyItMatters:
            'A broken canonical URL tells search engines to index a page that doesn\'t exist, wasting crawl budget and confusing indexing.',
          howToFix:
            'Fix the canonical URL to point to a valid, accessible page, or remove it to let search engines determine the canonical.',
          evidence: { url: pageUrl, actual: canonicalUrl, expected: 'HTTP 200', snippet: errorMessage ?? 'Connection error' },
          impact: 5,
          effort: 1,
        });
      } else if (response.status >= 400) {
        issues.push({
          code: 'canonical_url_broken',
          severity: 'P1',
          category: 'SEO',
          title: `Canonical URL returns ${response.status}`,
          whyItMatters:
            'A broken canonical URL tells search engines to index a page that doesn\'t exist, wasting crawl budget and confusing indexing.',
          howToFix:
            'Fix the canonical URL to point to a valid, accessible page, or remove it to let search engines determine the canonical.',
          evidence: { url: pageUrl, actual: canonicalUrl, expected: 'HTTP 200', snippet: `HTTP ${response.status}` },
          impact: 5,
          effort: 1,
        });
      }
    } catch {
      // Network error — skip silently
    }
  }

  return issues;
}
