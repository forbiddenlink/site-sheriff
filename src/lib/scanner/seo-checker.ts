import type { CrawlResult } from './crawler';

export interface SEOIssue {
  code: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  category: 'SEO';
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

  return issues;
}
