import * as cheerio from 'cheerio';
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
  // Additional high-frequency English words that are not keyword-stuffing signals
  'more', 'less', 'very', 'much', 'many', 'such', 'may', 'each', 'been', 'has',
  'had', 'were', 'said', 'did', 'does', 'are', 'was', 'is', 'am', 'being',
  'where', 'while', 'those', 'through', 'between', 'both', 'few', 'own', 'same',
  'too', 'again', 'further', 'once', 'here', 'why',
  'under', 'until', 'with', 'need', 'across', 'without', 'per', 'via',
  'within', 'including', 'following', 'since', 'due', 'together', 'using',
  'help', 'let', 'set', 'used', 'based',
  // Common adjectives/adverbs heavily used in marketing copy (not stuffing signals)
  'every', 'always', 'never', 'still', 'often', 'ever', 'really', 'truly',
  'easy', 'simple', 'fast', 'free', 'full', 'high', 'low', 'top', 'key',
  'open', 'true', 'real', 'better', 'best', 'great', 'right', 'small', 'large',
]);

// UI/status label words found in reference documentation sites (MDN, developer portals,
// API explorers) where they appear as repeated badge text, not as SEO keyword stuffing.
// Exclude these from the top-word candidate so they never trigger keyword_stuffing.
const TECHNICAL_STATE_WORDS = new Set([
  'experimental', 'deprecated', 'obsolete', 'nonstandard', 'standard',
  'baseline', 'beta', 'alpha', 'preview', 'stable', 'unstable',
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
      impact: 5,
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
      impact: 4,
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
      impact: 5,
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

function checkKeywordStuffing(url: string, html: string): ContentIssue[] {
  // Build a set of brand/domain words AND page-topic words from the URL so a
  // site's own name and the specific page topic aren't flagged as stuffing.
  // e.g. "stripe.com/authorization-boost" → {"stripe", "authorization", "boost"}
  const brandWords = new Set<string>();
  try {
    const parsed = new URL(url);
    // Hostname: "smashing-magazine.com" → {"smashing", "magazine"}
    const hostname = parsed.hostname.replace(/^www\./, '');
    for (const part of hostname.split(/[.\-]/)) {
      if (part.length > 2) brandWords.add(part.toLowerCase());
    }
    // Path segments: "/authorization-boost/features" → {"authorization", "boost", "features"}
    // Also add de-pluraled (strip trailing 's') of each segment so that a URL like
    // "/JavaScript/Reference/Functions" also covers the singular "function" — that
    // page's entire purpose is documenting functions, not stuffing the word as spam.
    for (const segment of parsed.pathname.split(/[\/\-_]/)) {
      if (segment.length > 2) {
        const word = segment.toLowerCase();
        brandWords.add(word);
        if (word.endsWith('s') && word.length > 3) brandWords.add(word.slice(0, -1));
      }
    }
  } catch {
    // ignore invalid URLs
  }

  // Strip navigational chrome and non-content before word counting.
  const $ks = cheerio.load(html);
  $ks('nav, header, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"], script, style').remove();

  // Extract heading/title text for corroboration check (real SEO stuffing always
  // targets heading elements; data-table/"treatment group" repetition never does).
  const headingText = $ks('title, h1, h2, h3').text().toLowerCase();

  const mainText = $ks.text();

  // Use ALL visible words as denominator so stop-word removal doesn't inflate density.
  // Only exclude stop/brand words from being the *candidate* stuffed word.
  const allWords = mainText
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replaceAll(/[^a-z]/g, ''))
    .filter((w) => w.length > 2);

  if (allWords.length <= 200) return [];

  const total = allWords.length; // true denominator — all visible words

  const freq = new Map<string, number>();
  for (const w of allWords) {
    // Only count content words (skip stop words, brand words, and UI status labels)
    // so they can't be falsely identified as the stuffed keyword.
    if (!STOP_WORDS.has(w) && !brandWords.has(w) && !TECHNICAL_STATE_WORDS.has(w)) {
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }

  let topWord = '';
  let topCount = 0;
  for (const [word, count] of freq) {
    if (count > topCount) {
      topWord = word;
      topCount = count;
    }
  }

  const density = topCount / total;

  // Two-signal approach: density flag alone is insufficient for borderline cases
  // because legitimate data-heavy pages (A/B test case studies, dashboards) can
  // repeat a technical term many times without SEO intent.
  //
  // Gate 1 (density):   >8% of all visible words IS the candidate keyword.
  // Gate 2 (heading):   The keyword appears in the title or an h1-h3 element,
  //                     which is where real keyword stuffing always concentrates.
  //                     Exception: ultra-extreme density (>20%) is flagged anyway.
  const inHeadings = headingText.includes(topWord);
  const ultraExtreme = density > 0.20;

  if (density > 0.08 && (inHeadings || ultraExtreme)) {
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
        totalWords: total,
        density: `${(density * 100).toFixed(1)}%`,
      },
      impact: 4,
      effort: 3,
    }];
  }

  return [];
}

function checkDeprecatedHtmlTags(url: string, html: string): ContentIssue[] {
  const $ = cheerio.load(html);
  const deprecatedTags = ['center', 'font', 'marquee', 'blink', 'big', 'strike', 'tt'];
  const found: string[] = [];

  for (const tag of deprecatedTags) {
    if ($(tag).length > 0) {
      found.push(`<${tag}> (${$(tag).length})`);
    }
  }

  if (found.length === 0) return [];

  return [{
    code: 'deprecated_html_tags',
    severity: 'P3',
    category: 'CONTENT',
    title: 'Deprecated HTML tags found',
    whyItMatters:
      'Deprecated HTML elements are no longer part of the HTML standard and may not render correctly in modern browsers. They signal outdated code.',
    howToFix:
      'Replace deprecated tags with modern CSS equivalents. For example, use CSS text-align instead of <center>, CSS font properties instead of <font>.',
    evidence: { url, deprecated: found.join(', ') },
    impact: 2,
    effort: 2,
  }];
}

function checkFormLabels(url: string, html: string): ContentIssue[] {
  const $ = cheerio.load(html);
  const unlabeled: string[] = [];

  $('input').each((_i, el) => {
    const type = ($(el).attr('type') ?? 'text').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) return;

    const id = $(el).attr('id');
    const hasAriaLabel = !!$(el).attr('aria-label');
    const hasAriaLabelledBy = !!$(el).attr('aria-labelledby');
    const hasAssociatedLabel = id ? $(`label[for="${id}"]`).length > 0 : false;
    const hasWrappingLabel = $(el).closest('label').length > 0;

    if (!hasAriaLabel && !hasAriaLabelledBy && !hasAssociatedLabel && !hasWrappingLabel) {
      const name = $(el).attr('name') || $(el).attr('id') || type;
      unlabeled.push(name);
    }
  });

  if (unlabeled.length === 0) return [];

  return [{
    code: 'form_missing_labels',
    severity: 'P2',
    category: 'ACCESSIBILITY',
    title: 'Form inputs missing labels',
    whyItMatters:
      'Input fields without associated labels are inaccessible to screen reader users and make forms harder to use for everyone.',
    howToFix:
      'Add a <label for="inputId"> element for each input, or use aria-label or aria-labelledby attributes.',
    evidence: { url, unlabeledInputs: unlabeled.slice(0, 10).join(', '), count: unlabeled.length },
    impact: 4,
    effort: 2,
  }];
}

function checkIframeTitles(url: string, html: string): ContentIssue[] {
  const $ = cheerio.load(html);
  const untitled: string[] = [];

  $('iframe').each((_i, el) => {
    const title = $(el).attr('title');
    if (!title || title.trim().length === 0) {
      const src = $(el).attr('src') ?? '<unknown>';
      untitled.push(src.slice(0, 80));
    }
  });

  if (untitled.length === 0) return [];

  return [{
    code: 'iframe_missing_title',
    severity: 'P3',
    category: 'ACCESSIBILITY',
    title: 'Iframes missing title attribute',
    whyItMatters:
      'Iframes without a title attribute are not accessible to screen reader users, who rely on the title to understand the embedded content.',
    howToFix:
      'Add a descriptive title attribute to each <iframe> element that explains its content.',
    evidence: { url, untitledIframes: untitled.slice(0, 5).join(', '), count: untitled.length },
    impact: 3,
    effort: 1,
  }];
}

// ───────────────────────────────────────────────────────────────────────────────
// Empty headings
// ───────────────────────────────────────────────────────────────────────────────

function checkEmptyHeadings(url: string, headings: HeadingData[]): ContentIssue[] {
  if (!headings || headings.length === 0) return [];

  const empty = headings.filter(h => !h.text || h.text.trim().length === 0);
  if (empty.length === 0) return [];

  return [{
    code: 'empty_headings',
    severity: 'P2',
    category: 'CONTENT',
    title: `${empty.length} empty heading${empty.length === 1 ? '' : 's'} found`,
    whyItMatters:
      'Empty headings break the document outline and confuse screen readers. Search engines may also see them as low-quality markup.',
    howToFix:
      'Add descriptive text to each heading, or remove the heading tag if it is purely decorative.',
    evidence: { url, emptyCount: empty.length, levels: empty.map(h => `h${h.level}`) },
    impact: 3,
    effort: 1,
  }];
}

// ───────────────────────────────────────────────────────────────────────────────
// Content-to-code ratio
// ───────────────────────────────────────────────────────────────────────────────

function checkContentToCodeRatio(url: string, html: string, wordCount: number): ContentIssue[] {
  if (html.length < 500) return []; // skip tiny pages

  const textLength = wordCount * 5; // rough char estimate
  const ratio = textLength / html.length;

  if (ratio < 0.05 && wordCount > 20) {
    return [{
      code: 'low_text_ratio',
      severity: 'P3',
      category: 'CONTENT',
      title: 'Very low text-to-HTML ratio',
      whyItMatters:
        'Pages where text makes up less than 5% of the HTML may be seen as thin or bloated by search engines. High code-to-content ratio can also slow rendering.',
      howToFix:
        'Remove unnecessary inline styles, scripts, and markup. Consider moving large CSS and JS to external files.',
      evidence: { url, ratio: `${(ratio * 100).toFixed(1)}%`, htmlSize: html.length, wordCount },
      impact: 2,
      effort: 3,
    }];
  }
  return [];
}

// ───────────────────────────────────────────────────────────────────────────────
// Missing language attribute
// ───────────────────────────────────────────────────────────────────────────────

function checkLanguageAttribute(url: string, html: string, isHomepage: boolean): ContentIssue[] {
  // Only check homepage — the lang attribute is set once on the html tag
  if (!isHomepage) return [];

  const htmlTagMatch = /<html[^>]*>/i.exec(html);
  if (!htmlTagMatch) return [];

  const hasLang = /\blang\s*=\s*["'][a-z]/i.test(htmlTagMatch[0]);
  if (hasLang) return [];

  return [{
    code: 'missing_lang_attribute',
    severity: 'P1',
    category: 'ACCESSIBILITY',
    title: 'Missing language attribute on <html> tag',
    whyItMatters:
      'The lang attribute helps screen readers pronounce content correctly and enables browsers to offer translation. It is a WCAG 2.1 Level A requirement (Success Criterion 3.1.1).',
    howToFix:
      'Add lang="en" (or the appropriate language code) to the <html> tag.',
    evidence: { url },
    impact: 5,
    effort: 1,
  }];
}

// ───────────────────────────────────────────────────────────────────────────────
// Main content quality checker
// ───────────────────────────────────────────────────────────────────────────────

export function checkContentQuality(result: CrawlResult): ContentIssue[] {
  const isHomepage = new URL(result.url).pathname === '/';
  const plainText = extractText(result.html);

  return [
    ...checkThinContent(result.url, result.wordCount, isHomepage),
    ...checkReadability(result.url, plainText),
    ...checkImageAltText(result.url, result.images),
    ...checkHeadingHierarchy(result.url, result.headings),
    ...checkKeywordStuffing(result.url, result.html),
    ...checkDeprecatedHtmlTags(result.url, result.html),
    ...checkFormLabels(result.url, result.html),
    ...checkIframeTitles(result.url, result.html),
    ...checkEmptyHeadings(result.url, result.headings),
    ...checkContentToCodeRatio(result.url, result.html, result.wordCount),
    ...checkLanguageAttribute(result.url, result.html, isHomepage),
  ];
}
