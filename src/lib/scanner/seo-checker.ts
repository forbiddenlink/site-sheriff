import type { CrawlResult } from './crawler';

export interface SEOIssue {
  code: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  category: 'SEO' | 'CONTENT';
  title: string;
  whyItMatters: string;
  howToFix: string;
  evidence: {
    url: string;
    expected?: string;
    actual?: string;
    snippet?: string;
  };
  impact: number;
  effort: number;
}

/**
 * Analyze a crawl result for SEO issues
 */
export function checkSEO(result: CrawlResult): SEOIssue[] {
  const issues: SEOIssue[] = [];

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

  // Thin content
  if (result.wordCount < 100) {
    issues.push({
      code: 'thin_content',
      severity: 'P2',
      category: 'SEO',
      title: 'Thin content (low word count)',
      whyItMatters: 'Pages with very little text may be seen as low-quality by search engines.',
      howToFix: 'Add more valuable, relevant content to the page (aim for 300+ words for main content pages).',
      evidence: { url: result.url, actual: `${result.wordCount} words`, expected: '300+ words' },
      impact: 3,
      effort: 3,
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
  }

  // ── Language attribute check ──────────────────────────────────────────
  if (!result.lang) {
    issues.push({
      code: 'missing_lang',
      severity: 'P2',
      category: 'SEO',
      title: 'Missing lang attribute on <html>',
      whyItMatters: 'The lang attribute helps search engines and screen readers understand the page language. Missing it can hurt accessibility and SEO.',
      howToFix: 'Add lang="en" (or your language code) to the <html> tag.',
      evidence: { url: result.url },
      impact: 3,
      effort: 1,
    });
  }

  // ── Heading hierarchy checks ──────────────────────────────────────────
  const h1Count = result.headings.filter(h => h.level === 1).length;
  if (h1Count > 1) {
    issues.push({
      code: 'multiple_h1',
      severity: 'P2',
      category: 'SEO',
      title: `Multiple H1 tags found (${h1Count})`,
      whyItMatters: 'Using multiple H1 tags can confuse search engines about the main topic of the page.',
      howToFix: 'Use a single H1 for the main page heading. Use H2-H6 for subheadings.',
      evidence: {
        url: result.url,
        actual: result.headings.filter(h => h.level === 1).map(h => h.text).join(', '),
      },
      impact: 2,
      effort: 1,
    });
  }

  // Check heading hierarchy (shouldn't skip levels, e.g. H1 → H3)
  if (result.headings.length > 1) {
    for (let i = 1; i < result.headings.length; i++) {
      const prev = result.headings[i - 1].level;
      const curr = result.headings[i].level;
      if (curr > prev + 1) {
        issues.push({
          code: 'heading_skip_level',
          severity: 'P3',
          category: 'SEO',
          title: `Heading hierarchy skips level (H${prev} → H${curr})`,
          whyItMatters: 'Skipping heading levels (e.g., H1 to H3) hurts accessibility and can confuse search engines about content structure.',
          howToFix: `Use sequential heading levels. Add an H${prev + 1} between the H${prev} and H${curr}.`,
          evidence: { url: result.url, actual: `H${prev} → H${curr}` },
          impact: 1,
          effort: 1,
        });
        break; // Only report first skip
      }
    }
  }

  // ── Image alt text checks ─────────────────────────────────────────────
  const imagesWithoutAlt = result.images.filter(img => img.alt === null || img.alt === '');
  if (imagesWithoutAlt.length > 0) {
    issues.push({
      code: 'images_missing_alt',
      severity: 'P1',
      category: 'CONTENT',
      title: `${imagesWithoutAlt.length} image(s) missing alt text`,
      whyItMatters: 'Images without alt text are invisible to screen readers and search engines. Alt text is critical for accessibility and image SEO.',
      howToFix: 'Add descriptive alt attributes to all meaningful images. Use alt="" only for decorative images.',
      evidence: {
        url: result.url,
        snippet: imagesWithoutAlt.slice(0, 5).map(i => i.src).join(', '),
        actual: `${imagesWithoutAlt.length} of ${result.images.length} images`,
      },
      impact: 4,
      effort: 2,
    });
  }

  // Images missing dimensions
  const imagesWithoutDimensions = result.images.filter(img => !img.width || !img.height);
  if (imagesWithoutDimensions.length > 3) {
    issues.push({
      code: 'images_missing_dimensions',
      severity: 'P3',
      category: 'CONTENT',
      title: `${imagesWithoutDimensions.length} image(s) missing width/height`,
      whyItMatters: 'Images without explicit dimensions cause layout shifts (CLS) when they load, hurting Core Web Vitals scores.',
      howToFix: 'Add width and height attributes to <img> tags to reserve space before the image loads.',
      evidence: {
        url: result.url,
        actual: `${imagesWithoutDimensions.length} of ${result.images.length} images`,
      },
      impact: 2,
      effort: 2,
    });
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
