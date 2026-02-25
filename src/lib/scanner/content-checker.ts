import type { CrawlResult, ImageData, HeadingData } from './crawler';

interface ContentIssue {
  code: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  category: 'SEO' | 'ACCESSIBILITY' | 'PERFORMANCE' | 'LINKS' | 'CONTENT' | 'SECURITY';
  title: string;
  whyItMatters: string | null;
  howToFix: string | null;
  evidence: object;
  impact: number | null;
  effort: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stop words (common English words to ignore for keyword stuffing detection)
// ─────────────────────────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it',
  'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but',
  'his', 'by', 'from', 'they', 'we', 'her', 'she', 'or', 'an', 'will', 'my',
  'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if',
  'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like',
  'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year',
  'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then',
  'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back',
  'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even',
  'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Text extraction helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Strip HTML tags, decode common entities, and normalize whitespace. */
function extractText(html: string): string {
  // Remove script and style blocks entirely
  let text = html.replaceAll(/<script[\s\S]*?<\/script>/gi, ' ');
  text = text.replaceAll(/<style[\s\S]*?<\/style>/gi, ' ');

  // Strip all remaining HTML tags
  text = text.replaceAll(/<[^>]+>/g, ' ');

  // Decode common HTML entities
  text = text
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ')
    .replaceAll(/&#\d+;/g, ' ')
    .replaceAll(/&\w+;/g, ' ');

  // Normalize whitespace
  text = text.replaceAll(/\s+/g, ' ').trim();

  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Syllable counting & readability
// ─────────────────────────────────────────────────────────────────────────────

/** Simple English syllable counter: count vowel groups, handle silent e, min 1. */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replaceAll(/[^a-z]/g, '');
  if (w.length <= 2) return 1;

  // Count vowel groups
  const vowelGroups = w.match(/[aeiouy]+/g);
  let count = vowelGroups ? vowelGroups.length : 1;

  // Silent e at end (but not "le" endings like "table")
  if (w.endsWith('e') && !w.endsWith('le') && count > 1) {
    count -= 1;
  }

  return Math.max(1, count);
}

/** Flesch-Kincaid Reading Ease: 206.835 - 1.015*(words/sentences) - 84.6*(syllables/words). Clamped 0-100. */
export function fleschKincaidReadingEase(text: string): number {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  if (words.length === 0 || sentences.length === 0) return 100;

  const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);

  const score =
    206.835 -
    1.015 * (words.length / sentences.length) -
    84.6 * (totalSyllables / words.length);

  return Math.max(0, Math.min(100, score));
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-checks (extracted to reduce cognitive complexity)
// ─────────────────────────────────────────────────────────────────────────────

function checkThinContent(url: string, wordCount: number, isHomepage: boolean): ContentIssue[] {
  if (wordCount < 50) {
    return [{
      code: 'very_thin_content',
      severity: 'P1',
      category: 'CONTENT',
      title: 'Very thin content detected',
      whyItMatters:
        'Pages with fewer than 50 words provide almost no value to visitors or search engines and are likely to be ignored or penalised.',
      howToFix:
        'Add meaningful, relevant content to the page. If the page is intentionally minimal (e.g. a redirect), consider adding a noindex tag.',
      evidence: { url, wordCount },
      impact: 8,
      effort: 3,
    }];
  }
  if (wordCount < 300 && !isHomepage) {
    return [{
      code: 'thin_content',
      severity: 'P2',
      category: 'CONTENT',
      title: 'Thin content detected',
      whyItMatters:
        'Pages with fewer than 300 words may struggle to rank well and provide limited value to readers.',
      howToFix:
        'Expand the page with additional relevant information, examples, or supporting details.',
      evidence: { url, wordCount },
      impact: 5,
      effort: 3,
    }];
  }
  return [];
}

function checkReadability(url: string, plainText: string): ContentIssue[] {
  if (plainText.split(/\s+/).length < 50) return [];

  const readingEase = fleschKincaidReadingEase(plainText);

  if (readingEase < 30) {
    return [{
      code: 'poor_readability',
      severity: 'P2',
      category: 'CONTENT',
      title: 'Content is very hard to read',
      whyItMatters:
        'A Flesch-Kincaid score below 30 means the text is at a college-graduate level, alienating most readers and increasing bounce rates.',
      howToFix:
        'Use shorter sentences, simpler words, and break up long paragraphs. Aim for a reading-ease score above 60.',
      evidence: { url, fleschKincaidScore: Math.round(readingEase) },
      impact: 6,
      effort: 4,
    }];
  }
  if (readingEase < 50) {
    return [{
      code: 'difficult_readability',
      severity: 'P3',
      category: 'CONTENT',
      title: 'Content is difficult to read',
      whyItMatters:
        'A Flesch-Kincaid score below 50 indicates college-level text, which may not suit a general audience.',
      howToFix:
        'Simplify sentence structures and vocabulary where possible to improve accessibility for a wider audience.',
      evidence: { url, fleschKincaidScore: Math.round(readingEase) },
      impact: 4,
      effort: 4,
    }];
  }
  return [];
}

function checkImageAltText(url: string, images: ImageData[]): ContentIssue[] {
  if (!images || images.length === 0) return [];

  const missingAlt = images.filter((img) => !img.alt || img.alt.trim().length === 0);
  const missingPct = (missingAlt.length / images.length) * 100;
  const evidence = {
    url,
    totalImages: images.length,
    missingAlt: missingAlt.length,
    percentMissing: Math.round(missingPct),
  };

  if (missingPct > 50) {
    return [{
      code: 'missing_alt_text_majority',
      severity: 'P1',
      category: 'CONTENT',
      title: 'Majority of images missing alt text',
      whyItMatters:
        'Over half the images on this page lack alt text, severely impacting accessibility for screen-reader users and reducing image SEO.',
      howToFix:
        'Add descriptive alt attributes to all meaningful images. Use empty alt="" only for purely decorative images.',
      evidence,
      impact: 8,
      effort: 2,
    }];
  }
  if (missingPct > 20) {
    return [{
      code: 'missing_alt_text',
      severity: 'P2',
      category: 'CONTENT',
      title: 'Some images missing alt text',
      whyItMatters:
        'Images without alt text are invisible to screen readers and miss potential image-search traffic.',
      howToFix:
        'Add descriptive alt attributes to the images that are missing them.',
      evidence,
      impact: 5,
      effort: 2,
    }];
  }
  return [];
}

function checkHeadingHierarchy(url: string, headings: HeadingData[]): ContentIssue[] {
  if (!headings || headings.length === 0) return [];

  const issues: ContentIssue[] = [];

  // First heading should be h1
  if (headings[0].level !== 1) {
    issues.push({
      code: 'heading_hierarchy_skip',
      severity: 'P2',
      category: 'CONTENT',
      title: 'First heading is not an h1',
      whyItMatters:
        'The document should start with an h1 to establish a clear content hierarchy for both users and search engines.',
      howToFix: `Change the first heading (currently h${headings[0].level}) to an h1, or add an h1 before it.`,
      evidence: {
        url,
        firstHeadingLevel: headings[0].level,
        firstHeadingText: headings[0].text,
      },
      impact: 5,
      effort: 1,
    });
  }

  // Multiple h1s
  const h1s = headings.filter((h) => h.level === 1);
  if (h1s.length > 1) {
    issues.push({
      code: 'multiple_h1',
      severity: 'P2',
      category: 'CONTENT',
      title: 'Multiple h1 headings found',
      whyItMatters:
        'Using more than one h1 dilutes the main topic signal and can confuse search engines about the page\'s primary subject.',
      howToFix:
        'Keep a single h1 for the page title and demote the others to h2 or lower.',
      evidence: {
        url,
        h1Count: h1s.length,
        h1Texts: h1s.map((h) => h.text),
      },
      impact: 4,
      effort: 1,
    });
  }

  // Heading level skips (e.g., h1 → h3) — report only the first skip
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level > headings[i - 1].level + 1) {
      issues.push({
        code: 'heading_level_skip',
        severity: 'P3',
        category: 'CONTENT',
        title: `Heading level skipped: h${headings[i - 1].level} → h${headings[i].level}`,
        whyItMatters:
          'Skipping heading levels breaks the logical document outline, making content harder to navigate for assistive technologies.',
        howToFix: `Add intermediate heading levels or change the h${headings[i].level} to h${headings[i - 1].level + 1}.`,
        evidence: {
          url,
          from: { level: headings[i - 1].level, text: headings[i - 1].text },
          to: { level: headings[i].level, text: headings[i].text },
        },
        impact: 3,
        effort: 1,
      });
      break;
    }
  }

  return issues;
}

function checkKeywordStuffing(url: string, plainText: string): ContentIssue[] {
  const words = plainText
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .map((w) => w.replaceAll(/[^a-z]/g, ''))
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  if (words.length <= 100) return [];

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  let topWord = '';
  let topCount = 0;
  for (const [word, count] of freq) {
    if (count > topCount) {
      topWord = word;
      topCount = count;
    }
  }

  const density = topCount / words.length;
  if (density > 0.05) {
    return [{
      code: 'keyword_stuffing',
      severity: 'P2',
      category: 'CONTENT',
      title: 'Possible keyword stuffing detected',
      whyItMatters:
        'Repeating a single keyword excessively can trigger search-engine spam filters and degrade user experience.',
      howToFix:
        'Reduce repetition of the flagged word and use synonyms or related phrases instead.',
      evidence: {
        url,
        keyword: topWord,
        occurrences: topCount,
        totalWords: words.length,
        density: `${(density * 100).toFixed(1)}%`,
      },
      impact: 6,
      effort: 3,
    }];
  }

  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main content quality checker
// ─────────────────────────────────────────────────────────────────────────────

export function checkContentQuality(result: CrawlResult): ContentIssue[] {
  const isHomepage = new URL(result.url).pathname === '/';
  const plainText = extractText(result.html);

  return [
    ...checkThinContent(result.url, result.wordCount, isHomepage),
    ...checkReadability(result.url, plainText),
    ...checkImageAltText(result.url, result.images),
    ...checkHeadingHierarchy(result.url, result.headings),
    ...checkKeywordStuffing(result.url, plainText),
  ];
}
