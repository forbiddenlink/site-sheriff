import * as cheerio from 'cheerio';
import type { CrawlResult } from './crawler';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AIReadinessIssue {
  code: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  category: 'SEO' | 'CONTENT';
  title: string;
  whyItMatters: string;
  howToFix: string;
  evidence: {
    url: string;
    actual?: string | null;
    expected?: string;
    details?: string;
  };
  impact: number;
  effort: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-checks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check for structured data (JSON-LD) that helps AI understand content.
 * AI systems like SearchGPT and Perplexity use structured data to extract facts.
 */
function checkStructuredData($: cheerio.CheerioAPI, url: string): AIReadinessIssue[] {
  const jsonLdScripts = $('script[type="application/ld+json"]');

  if (jsonLdScripts.length === 0) {
    return [{
      code: 'no_structured_data',
      severity: 'P2' as const,
      category: 'SEO' as const,
      title: 'No structured data (JSON-LD) found',
      whyItMatters:
        'AI systems like SearchGPT, Perplexity, and Claude use structured data to extract facts and cite sources accurately. Without it, your content may be misunderstood or overlooked.',
      howToFix:
        'Add JSON-LD structured data using schema.org types like Article, FAQPage, HowTo, Product, or Organization. Place it in a <script type="application/ld+json"> tag.',
      evidence: {
        url,
        expected: 'At least one JSON-LD script with schema.org data',
      },
      impact: 3,
      effort: 2,
    }];
  }

  return [];
}

/**
 * Check for FAQ schema which is highly valued by AI for Q&A extraction.
 */
function checkFAQSchema($: cheerio.CheerioAPI, url: string): AIReadinessIssue[] {
  const jsonLdScripts = $('script[type="application/ld+json"]');
  let hasFAQ = false;
  let hasHowTo = false;

  jsonLdScripts.each((_i, el) => {
    const content = $(el).text();
    try {
      const data = JSON.parse(content);
      const types = Array.isArray(data) ? data.map(d => d['@type']) : [data['@type']];
      if (types.some(t => t === 'FAQPage' || t === 'Question')) hasFAQ = true;
      if (types.some(t => t === 'HowTo')) hasHowTo = true;
    } catch {
      // Invalid JSON, skip
    }
  });

  // Check if page has FAQ-like content but no FAQ schema
  const hasQuestionHeadings = $('h2, h3').toArray().some((el) => {
    const text = $(el).text().toLowerCase();
    return text.includes('?') ||
           text.startsWith('how ') ||
           text.startsWith('what ') ||
           text.startsWith('why ') ||
           text.startsWith('when ') ||
           text.startsWith('faq');
  });

  if (hasQuestionHeadings && !hasFAQ && !hasHowTo) {
    return [{
      code: 'faq_content_no_schema',
      severity: 'P3' as const,
      category: 'SEO' as const,
      title: 'FAQ-style content without FAQ schema',
      whyItMatters:
        'Your page has question-style headings that could benefit from FAQPage or HowTo schema. AI systems prioritize structured Q&A content for direct answers.',
      howToFix:
        'Add FAQPage schema for Q&A sections or HowTo schema for step-by-step instructions. This helps AI extract and cite your answers directly.',
      evidence: {
        url,
        actual: 'Question-style headings detected',
        expected: 'FAQPage or HowTo structured data',
      },
      impact: 2,
      effort: 2,
    }];
  }

  return [];
}

/**
 * Check for clear authorship signals (author, datePublished, dateModified).
 * AI systems prefer content with clear attribution for trustworthiness.
 */
function checkAuthorshipSignals($: cheerio.CheerioAPI, url: string): AIReadinessIssue[] {
  // Check JSON-LD for author info
  const jsonLdScripts = $('script[type="application/ld+json"]');
  let hasAuthor = false;
  let hasDatePublished = false;

  jsonLdScripts.each((_i, el) => {
    const content = $(el).text();
    try {
      const data = JSON.parse(content);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item.author) hasAuthor = true;
        if (item.datePublished || item.dateCreated) hasDatePublished = true;
      }
    } catch {
      // Invalid JSON
    }
  });

  // Check meta tags as fallback
  if ($('meta[name="author"]').length > 0) hasAuthor = true;
  if ($('meta[property="article:published_time"]').length > 0) hasDatePublished = true;
  if ($('time[datetime]').length > 0) hasDatePublished = true;

  const issues: AIReadinessIssue[] = [];

  // Only check article-like pages (has article tag or significant content)
  const isArticlePage = $('article').length > 0 ||
                        $('meta[property="og:type"][content="article"]').length > 0;

  if (isArticlePage && !hasAuthor) {
    issues.push({
      code: 'missing_author_attribution',
      severity: 'P3' as const,
      category: 'CONTENT' as const,
      title: 'Article missing author attribution',
      whyItMatters:
        'AI systems weight content trustworthiness based on authorship. Clear author attribution improves your content\'s credibility for AI citations.',
      howToFix:
        'Add author info via JSON-LD (author property), <meta name="author">, or visible byline with schema.org Person markup.',
      evidence: {
        url,
        expected: 'Author attribution in structured data or meta tags',
      },
      impact: 2,
      effort: 1,
    });
  }

  if (isArticlePage && !hasDatePublished) {
    issues.push({
      code: 'missing_publish_date',
      severity: 'P3' as const,
      category: 'CONTENT' as const,
      title: 'Article missing publication date',
      whyItMatters:
        'AI systems prefer recent, dated content. Publication dates help AI assess content freshness and relevance.',
      howToFix:
        'Add datePublished in JSON-LD, <meta property="article:published_time">, or visible <time datetime="..."> elements.',
      evidence: {
        url,
        expected: 'Publication date in structured data or time element',
      },
      impact: 2,
      effort: 1,
    });
  }

  return issues;
}

/**
 * Check for citation-friendly content patterns that AI systems prefer.
 * Detects: numbered lists, statistics, definitions, quotable statements.
 */
function checkCitationFriendliness($: cheerio.CheerioAPI, url: string): AIReadinessIssue[] {
  // Only check article-type pages with substantial content
  const isArticlePage = $('article').length > 0 ||
                        $('meta[property="og:type"][content="article"]').length > 0;

  const paragraphs = $('article p, main p, .content p, [role="main"] p').toArray();
  const textContent = paragraphs.map(p => $(p).text()).join(' ');

  // Skip pages with minimal content
  if (textContent.length < 500) return [];

  // Count citation-friendly patterns
  const hasNumberedLists = $('ol li').length >= 3;
  const hasBulletLists = $('ul li').length >= 3;
  const hasDefinitions = /\b(?:is defined as|refers to|means that|is when)\b/i.test(textContent);
  const hasStatistics = /\b\d+(?:\.\d+)?%|\b(?:according to|study shows|research indicates|data shows)\b/i.test(textContent);
  const hasBlockquotes = $('blockquote').length > 0;

  const citationPatterns = [
    hasNumberedLists,
    hasBulletLists,
    hasDefinitions,
    hasStatistics,
    hasBlockquotes,
  ].filter(Boolean).length;

  // Only flag article pages with low citation-friendliness
  if (isArticlePage && citationPatterns === 0) {
    return [{
      code: 'low_citation_friendliness',
      severity: 'P3' as const,
      category: 'CONTENT' as const,
      title: 'Content lacks citation-friendly patterns',
      whyItMatters:
        'AI systems like ChatGPT and Perplexity prefer citing content with clear structure: numbered lists, statistics, definitions, or quotable statements. Unstructured prose is harder to extract and cite accurately.',
      howToFix:
        'Add structured elements: numbered lists for steps/rankings, statistics with sources, clear definitions for key terms, or blockquotes for key takeaways. These make your content more extractable for AI citations.',
      evidence: {
        url,
        actual: 'No citation-friendly patterns detected',
        expected: 'Lists, statistics, definitions, or blockquotes',
      },
      impact: 2,
      effort: 2,
    }];
  }

  return [];
}

/**
 * Check for clear content summary/intro that AI can extract.
 * First paragraph should summarize the page content.
 */
function checkContentSummary($: cheerio.CheerioAPI, url: string, metaDescription: string | null): AIReadinessIssue[] {
  // Skip if meta description exists (that serves as summary)
  if (metaDescription && metaDescription.length >= 50) return [];

  // Check for a substantial first paragraph after h1
  const h1 = $('h1').first();
  if (h1.length === 0) return [];

  const firstParagraph = h1.nextAll('p').first();
  const firstParagraphText = firstParagraph.text().trim();

  if (firstParagraphText.length < 50) {
    return [{
      code: 'weak_content_intro',
      severity: 'P3' as const,
      category: 'CONTENT' as const,
      title: 'Page lacks clear content summary',
      whyItMatters:
        'AI systems extract the first paragraph or meta description as a content summary. A weak intro makes it harder for AI to understand and cite your content accurately.',
      howToFix:
        'Add a compelling meta description (150-160 chars) OR ensure the first paragraph after your H1 summarizes the page content (at least 50 characters).',
      evidence: {
        url,
        actual: firstParagraphText.length > 0
          ? `First paragraph: ${firstParagraphText.length} chars`
          : 'No paragraph after H1',
        expected: 'Meta description or intro paragraph (50+ chars)',
      },
      impact: 2,
      effort: 1,
    }];
  }

  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyze a crawled page for AI-readiness signals.
 *
 * These checks help ensure content is optimized for AI crawlers and citation
 * systems like SearchGPT, Perplexity, and Claude.
 *
 * Checks performed:
 * 1. **no_structured_data** – no JSON-LD structured data found
 * 2. **faq_content_no_schema** – FAQ-style content without FAQPage schema
 * 3. **missing_author_attribution** – article without author info
 * 4. **missing_publish_date** – article without publication date
 * 5. **weak_content_intro** – no clear summary for AI extraction
 * 6. **low_citation_friendliness** – article lacks lists, stats, or definitions
 *
 * @param result - The crawl result for a single page.
 * @returns An array of issues found.
 */
export function checkAIReadiness(result: CrawlResult): AIReadinessIssue[] {
  if (!result.html) return [];
  const $ = cheerio.load(result.html);

  return [
    ...checkStructuredData($, result.url),
    ...checkFAQSchema($, result.url),
    ...checkAuthorshipSignals($, result.url),
    ...checkContentSummary($, result.url, result.metaDescription),
    ...checkCitationFriendliness($, result.url),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Site-level checks (run once per scan)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check for llms.txt file at the root of the site.
 *
 * llms.txt is an emerging standard (similar to robots.txt) that provides
 * instructions and context for AI crawlers like ChatGPT, Perplexity, and Claude.
 * See: https://llmstxt.org/
 *
 * @param baseUrl - The base URL of the site (e.g., "https://example.com")
 * @returns An array with a single issue if llms.txt is missing, empty otherwise
 */
export async function checkLlmsTxt(baseUrl: string): Promise<AIReadinessIssue[]> {
  try {
    const url = new URL('/llms.txt', baseUrl);
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'SiteSheriff/1.0 (AI Readiness Checker)',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const text = await response.text();
      // Basic validation: should have some content and look like a text file
      if (text.trim().length > 0) {
        return []; // llms.txt exists and has content
      }
    }

    // 404 or empty file - suggest adding llms.txt
    return [{
      code: 'missing_llms_txt',
      severity: 'P3' as const,
      category: 'SEO' as const,
      title: 'No llms.txt file found',
      whyItMatters:
        'llms.txt is an emerging standard for providing AI crawlers with site context, content guidelines, and preferred citation formats. Sites with llms.txt may receive better AI-generated summaries and citations.',
      howToFix:
        'Create a /llms.txt file at your site root with: site description, key content areas, preferred citation format, and any AI-specific instructions. See https://llmstxt.org/ for the specification.',
      evidence: {
        url: url.toString(),
        expected: 'A text file with AI crawler instructions',
      },
      impact: 1,
      effort: 1,
    }];
  } catch {
    // Network error or timeout - don't report as missing, just skip
    return [];
  }
}
