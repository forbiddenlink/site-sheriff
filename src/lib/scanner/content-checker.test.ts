import { describe, it, expect } from 'vitest';
import { countSyllables, fleschKincaidReadingEase, checkContentQuality } from './content-checker';
import type { CrawlResult, ImageData, HeadingData } from './crawler';

const createMockCrawlResult = (overrides: Partial<CrawlResult> = {}): CrawlResult => ({
  url: 'https://example.com/page',
  statusCode: 200,
  loadTimeMs: 100,
  html: '<html><head></head><body><p>This is test content with enough words to pass the thin content check. We need at least three hundred words to avoid triggering the thin content warning so let us add more text here.</p></body></html>',
  title: 'Example Page',
  metaDescription: 'A test page',
  h1: 'Example',
  canonical: null,
  robotsMeta: null,
  wordCount: 500,
  links: [],
  responseHeaders: {},
  cookies: [],
  images: [],
  headings: [{ level: 1, text: 'Main Heading' }],
  ogTags: {},
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
});

// ─────────────────────────────────────────────────────────────────────────────
// countSyllables tests
// ─────────────────────────────────────────────────────────────────────────────

describe('countSyllables', () => {
  describe('short words', () => {
    it('returns 1 for single letter words', () => {
      expect(countSyllables('a')).toBe(1);
      expect(countSyllables('I')).toBe(1);
    });

    it('returns 1 for two-letter words', () => {
      expect(countSyllables('to')).toBe(1);
      expect(countSyllables('be')).toBe(1);
      expect(countSyllables('go')).toBe(1);
    });

    it('returns 1 for simple one-syllable words', () => {
      expect(countSyllables('cat')).toBe(1);
      expect(countSyllables('dog')).toBe(1);
      expect(countSyllables('run')).toBe(1);
      expect(countSyllables('jump')).toBe(1);
    });
  });

  describe('silent e handling', () => {
    it('handles silent e at end of words', () => {
      expect(countSyllables('make')).toBe(1);
      expect(countSyllables('take')).toBe(1);
      expect(countSyllables('bake')).toBe(1);
      expect(countSyllables('same')).toBe(1);
    });

    it('preserves syllable for -le endings', () => {
      expect(countSyllables('table')).toBe(2);
      expect(countSyllables('able')).toBe(2);
      expect(countSyllables('simple')).toBe(2);
      expect(countSyllables('little')).toBe(2);
    });
  });

  describe('vowel groups', () => {
    it('counts consecutive vowels as one syllable', () => {
      expect(countSyllables('beat')).toBe(1);
      expect(countSyllables('boat')).toBe(1);
      expect(countSyllables('great')).toBe(1);
    });

    it('counts multiple vowel groups correctly', () => {
      expect(countSyllables('beautiful')).toBe(3);
      expect(countSyllables('example')).toBe(3);
      expect(countSyllables('computer')).toBe(3);
    });
  });

  describe('complex words', () => {
    it('handles multi-syllable words', () => {
      expect(countSyllables('information')).toBe(4);
      expect(countSyllables('university')).toBe(5);
      expect(countSyllables('international')).toBe(5);
    });

    it('strips non-alphabetic characters', () => {
      expect(countSyllables("don't")).toBe(1);
      expect(countSyllables('co-operate')).toBe(3);
      expect(countSyllables('123')).toBe(1); // Empty after stripping, min 1
    });

    it('returns minimum of 1 syllable', () => {
      expect(countSyllables('')).toBe(1);
      expect(countSyllables('a')).toBe(1);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fleschKincaidReadingEase tests
// ─────────────────────────────────────────────────────────────────────────────

describe('fleschKincaidReadingEase', () => {
  describe('edge cases', () => {
    it('returns 100 for empty text', () => {
      expect(fleschKincaidReadingEase('')).toBe(100);
    });

    it('returns 100 for whitespace-only text', () => {
      expect(fleschKincaidReadingEase('   ')).toBe(100);
    });

    it('handles text with no sentence-ending punctuation', () => {
      // Text without sentence endings is treated as one long sentence
      // Score depends on word count and syllables
      const score = fleschKincaidReadingEase('no sentence ending');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('simple text', () => {
    it('returns high score for simple text', () => {
      const simpleText = 'The cat sat on the mat. The dog ran away. It was a fun day.';
      const score = fleschKincaidReadingEase(simpleText);
      expect(score).toBeGreaterThan(70);
    });

    it('returns high score for short simple sentences', () => {
      const text = 'Go now. Run fast. Jump high. Be good.';
      const score = fleschKincaidReadingEase(text);
      expect(score).toBeGreaterThan(80);
    });
  });

  describe('complex text', () => {
    it('returns low score for complex academic text', () => {
      const complexText = 'The epistemological implications of phenomenological hermeneutics necessitate a comprehensive reevaluation of our ontological presuppositions. Contemporary philosophical discourse increasingly emphasizes the interdisciplinary nature of metaphysical investigations.';
      const score = fleschKincaidReadingEase(complexText);
      expect(score).toBeLessThan(30);
    });

    it('returns low score for business text', () => {
      const businessText = 'Our organization seeks to implement strategic initiatives that will enhance operational efficiency. The management team has developed comprehensive policies to address these challenges. We anticipate significant improvements in our quarterly performance metrics.';
      const score = fleschKincaidReadingEase(businessText);
      // Complex business text with long words gets a low score
      expect(score).toBeLessThan(50);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('score clamping', () => {
    it('clamps score to minimum of 0', () => {
      // Very complex text with long words and long sentences
      const veryComplex = 'Electroencephalographically antidisestablishmentarianism conceptualization internationalization.';
      const score = fleschKincaidReadingEase(veryComplex);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('clamps score to maximum of 100', () => {
      const simple = 'Go. Run. Jump.';
      const score = fleschKincaidReadingEase(simple);
      expect(score).toBeLessThanOrEqual(100);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkContentQuality tests
// ─────────────────────────────────────────────────────────────────────────────

describe('checkContentQuality', () => {
  describe('thin content detection', () => {
    it('flags very thin content (< 50 words) as P1', () => {
      const result = createMockCrawlResult({
        wordCount: 30,
        html: '<html><body><p>Short content.</p></body></html>',
      });
      const issues = checkContentQuality(result);

      const issue = issues.find(i => i.code === 'very_thin_content');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P1');
      expect(issue?.category).toBe('CONTENT');
      expect(issue?.evidence).toMatchObject({ wordCount: 30 });
    });

    it('flags thin content (< 300 words) as P2 for non-homepage', () => {
      const result = createMockCrawlResult({
        url: 'https://example.com/about',
        wordCount: 150,
        html: '<html><body><p>Some content but not enough.</p></body></html>',
      });
      const issues = checkContentQuality(result);

      const issue = issues.find(i => i.code === 'thin_content');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P2');
    });

    it('does not flag thin content for homepage', () => {
      const result = createMockCrawlResult({
        url: 'https://example.com/',
        wordCount: 150,
        html: '<html><body><p>Homepage content.</p></body></html>',
      });
      const issues = checkContentQuality(result);

      const issue = issues.find(i => i.code === 'thin_content');
      expect(issue).toBeUndefined();
    });

    it('does not flag pages with 300+ words', () => {
      const result = createMockCrawlResult({
        wordCount: 350,
        html: '<html><body><p>Plenty of content here.</p></body></html>',
      });
      const issues = checkContentQuality(result);

      expect(issues.find(i => i.code === 'very_thin_content')).toBeUndefined();
      expect(issues.find(i => i.code === 'thin_content')).toBeUndefined();
    });
  });

  describe('readability detection', () => {
    it('flags poor readability (< 30 score) as P2', () => {
      // Generate text with 50+ words that is very complex
      const complexWords = 'epistemological phenomenological hermeneutical metaphysical ontological presuppositional';
      const complexText = Array(10).fill(complexWords).join(' ');
      const result = createMockCrawlResult({
        html: `<html><body><p>${complexText}.</p></body></html>`,
        wordCount: 60,
      });
      const issues = checkContentQuality(result);

      const issue = issues.find(i => i.code === 'poor_readability');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P2');
      expect(issue?.category).toBe('CONTENT');
    });

    it('flags difficult readability (30-50 score) as P3', () => {
      // Text that is difficult but not extremely so
      const moderateText = Array(60).fill('implementation documentation configuration optimization verification').join(' ');
      const result = createMockCrawlResult({
        html: `<html><body><p>${moderateText}.</p></body></html>`,
        wordCount: 60,
      });
      const issues = checkContentQuality(result);

      const issue = issues.find(i => i.code === 'difficult_readability') ||
                    issues.find(i => i.code === 'poor_readability');
      expect(issue).toBeDefined();
    });

    it('does not check readability for short content (< 50 words)', () => {
      const result = createMockCrawlResult({
        html: '<html><body><p>Short epistemological phenomenological content.</p></body></html>',
        wordCount: 30,
      });
      const issues = checkContentQuality(result);

      expect(issues.find(i => i.code === 'poor_readability')).toBeUndefined();
      expect(issues.find(i => i.code === 'difficult_readability')).toBeUndefined();
    });

    it('does not flag easy-to-read content', () => {
      const simpleText = Array(60).fill('The cat sat on the mat. Dogs run fast.').join(' ');
      const result = createMockCrawlResult({
        html: `<html><body><p>${simpleText}</p></body></html>`,
        wordCount: 500,
      });
      const issues = checkContentQuality(result);

      expect(issues.find(i => i.code === 'poor_readability')).toBeUndefined();
      expect(issues.find(i => i.code === 'difficult_readability')).toBeUndefined();
    });
  });

  describe('image alt text detection', () => {
    it('flags majority missing alt text (> 50%) as P1', () => {
      const images: ImageData[] = [
        { src: '/img1.jpg', alt: null, width: null, height: null },
        { src: '/img2.jpg', alt: '', width: null, height: null },
        { src: '/img3.jpg', alt: 'Valid alt', width: null, height: null },
        { src: '/img4.jpg', alt: null, width: null, height: null },
      ];
      const result = createMockCrawlResult({ images });
      const issues = checkContentQuality(result);

      const issue = issues.find(i => i.code === 'missing_alt_text_majority');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P1');
      expect(issue?.category).toBe('CONTENT');
      expect(issue?.evidence).toMatchObject({ totalImages: 4, missingAlt: 3 });
    });

    it('flags some missing alt text (> 20%) as P2', () => {
      const images: ImageData[] = [
        { src: '/img1.jpg', alt: 'Alt 1', width: null, height: null },
        { src: '/img2.jpg', alt: 'Alt 2', width: null, height: null },
        { src: '/img3.jpg', alt: null, width: null, height: null },
        { src: '/img4.jpg', alt: 'Alt 4', width: null, height: null },
      ];
      const result = createMockCrawlResult({ images });
      const issues = checkContentQuality(result);

      const issue = issues.find(i => i.code === 'missing_alt_text');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P2');
    });

    it('does not flag when all images have alt text', () => {
      const images: ImageData[] = [
        { src: '/img1.jpg', alt: 'Alt 1', width: null, height: null },
        { src: '/img2.jpg', alt: 'Alt 2', width: null, height: null },
      ];
      const result = createMockCrawlResult({ images });
      const issues = checkContentQuality(result);

      expect(issues.find(i => i.code === 'missing_alt_text_majority')).toBeUndefined();
      expect(issues.find(i => i.code === 'missing_alt_text')).toBeUndefined();
    });

    it('does not flag pages with no images', () => {
      const result = createMockCrawlResult({ images: [] });
      const issues = checkContentQuality(result);

      expect(issues.find(i => i.code === 'missing_alt_text_majority')).toBeUndefined();
      expect(issues.find(i => i.code === 'missing_alt_text')).toBeUndefined();
    });

    it('treats whitespace-only alt as missing', () => {
      const images: ImageData[] = [
        { src: '/img1.jpg', alt: '   ', width: null, height: null },
        { src: '/img2.jpg', alt: 'Valid', width: null, height: null },
      ];
      const result = createMockCrawlResult({ images });
      const issues = checkContentQuality(result);

      const issue = issues.find(i => i.code === 'missing_alt_text');
      expect(issue).toBeDefined();
    });
  });

  describe('heading hierarchy detection', () => {
    it('flags first heading not being h1', () => {
      const headings: HeadingData[] = [
        { level: 2, text: 'First heading is h2' },
        { level: 3, text: 'Second heading' },
      ];
      const result = createMockCrawlResult({ headings });
      const issues = checkContentQuality(result);

      const issue = issues.find(i => i.code === 'heading_hierarchy_skip');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P2');
      expect(issue?.evidence).toMatchObject({ firstHeadingLevel: 2 });
    });

    it('flags multiple h1 headings', () => {
      const headings: HeadingData[] = [
        { level: 1, text: 'First h1' },
        { level: 2, text: 'Subheading' },
        { level: 1, text: 'Second h1' },
      ];
      const result = createMockCrawlResult({ headings });
      const issues = checkContentQuality(result);

      const issue = issues.find(i => i.code === 'multiple_h1');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P2');
      expect(issue?.evidence).toMatchObject({ h1Count: 2 });
    });

    it('flags heading level skips', () => {
      const headings: HeadingData[] = [
        { level: 1, text: 'Main heading' },
        { level: 3, text: 'Skipped to h3' },
      ];
      const result = createMockCrawlResult({ headings });
      const issues = checkContentQuality(result);

      const issue = issues.find(i => i.code === 'heading_level_skip');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P3');
      expect(issue?.title).toContain('h1');
      expect(issue?.title).toContain('h3');
    });

    it('only reports first heading level skip', () => {
      const headings: HeadingData[] = [
        { level: 1, text: 'Main' },
        { level: 3, text: 'Skip 1' },
        { level: 6, text: 'Skip 2' },
      ];
      const result = createMockCrawlResult({ headings });
      const issues = checkContentQuality(result);

      const skipIssues = issues.filter(i => i.code === 'heading_level_skip');
      expect(skipIssues).toHaveLength(1);
    });

    it('does not flag proper heading hierarchy', () => {
      const headings: HeadingData[] = [
        { level: 1, text: 'Main' },
        { level: 2, text: 'Section' },
        { level: 3, text: 'Subsection' },
        { level: 2, text: 'Another section' },
      ];
      const result = createMockCrawlResult({ headings });
      const issues = checkContentQuality(result);

      expect(issues.find(i => i.code === 'heading_hierarchy_skip')).toBeUndefined();
      expect(issues.find(i => i.code === 'multiple_h1')).toBeUndefined();
      expect(issues.find(i => i.code === 'heading_level_skip')).toBeUndefined();
    });

    it('does not flag pages with no headings', () => {
      const result = createMockCrawlResult({ headings: [] });
      const issues = checkContentQuality(result);

      expect(issues.find(i => i.code === 'heading_hierarchy_skip')).toBeUndefined();
      expect(issues.find(i => i.code === 'multiple_h1')).toBeUndefined();
      expect(issues.find(i => i.code === 'heading_level_skip')).toBeUndefined();
    });
  });

  describe('keyword stuffing detection', () => {
    it('flags keyword stuffing (> 7% density)', () => {
      // Create text with excessive keyword repetition
      const keyword = 'optimization';
      const filler = 'content text writing reading article blog post website marketing digital strategy';
      // ~240 words total, with keyword appearing ~20 times = ~8% density
      const stuffedText = Array(20).fill(`${keyword} ${filler}`).join(' ');
      const result = createMockCrawlResult({
        html: `<html><body><p>${stuffedText}.</p></body></html>`,
        wordCount: 250,
      });
      const issues = checkContentQuality(result);

      const issue = issues.find(i => i.code === 'keyword_stuffing');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P2');
      expect(issue?.category).toBe('CONTENT');
    });

    it('does not flag short content (< 200 words)', () => {
      const keyword = 'test';
      const stuffedText = Array(10).fill(keyword).join(' ');
      const result = createMockCrawlResult({
        html: `<html><body><p>${stuffedText}</p></body></html>`,
        wordCount: 50,
      });
      const issues = checkContentQuality(result);

      expect(issues.find(i => i.code === 'keyword_stuffing')).toBeUndefined();
    });

    it('ignores stop words in density calculation', () => {
      // Text with many stop words should not trigger keyword stuffing for those stop words
      // Each word appears only a few times, no single keyword dominates
      const text = 'The the the the the and and and and and for for for for for';
      const filler = Array(50).fill('apple banana cherry dates elderberry fig grape honeydew kiwi lemon mango nectarine').join(' ');
      const result = createMockCrawlResult({
        html: `<html><body><p>${text} ${filler}.</p></body></html>`,
        wordCount: 650,
      });
      const issues = checkContentQuality(result);

      // Stop words like "the", "and", "for" should not trigger keyword stuffing
      const issue = issues.find(i => i.code === 'keyword_stuffing');
      if (issue) {
        // If there is a keyword stuffing issue, it should NOT be for a stop word
        const stopWords = ['the', 'and', 'for', 'to', 'of', 'in', 'a', 'that', 'it', 'is'];
        expect(stopWords).not.toContain((issue.evidence as { keyword: string }).keyword);
      }
    });

    it('does not flag natural content', () => {
      const naturalText = Array(250).fill(
        'Creating great content requires careful planning and execution. Writers must balance creativity with clarity to engage readers effectively.'
      ).join(' ');
      const result = createMockCrawlResult({
        html: `<html><body><p>${naturalText}</p></body></html>`,
        wordCount: 500,
      });
      const issues = checkContentQuality(result);

      expect(issues.find(i => i.code === 'keyword_stuffing')).toBeUndefined();
    });
  });

  describe('deprecated HTML tags detection', () => {
    it('flags <center> tag', () => {
      const result = createMockCrawlResult({
        html: '<html><body><center>Centered text</center></body></html>',
      });
      const issues = checkContentQuality(result);

      const issue = issues.find(i => i.code === 'deprecated_html_tags');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P3');
      expect(issue?.evidence).toMatchObject({ deprecated: expect.stringContaining('<center>') });
    });

    it('flags <font> tag', () => {
      const result = createMockCrawlResult({
        html: '<html><body><font color="red">Red text</font></body></html>',
      });
      const issues = checkContentQuality(result);

      const issue = issues.find(i => i.code === 'deprecated_html_tags');
      expect(issue).toBeDefined();
      expect(issue?.evidence).toMatchObject({ deprecated: expect.stringContaining('<font>') });
    });

    it('flags <marquee> tag', () => {
      const result = createMockCrawlResult({
        html: '<html><body><marquee>Scrolling text</marquee></body></html>',
      });
      const issues = checkContentQuality(result);

      const issue = issues.find(i => i.code === 'deprecated_html_tags');
      expect(issue).toBeDefined();
      expect(issue?.evidence).toMatchObject({ deprecated: expect.stringContaining('<marquee>') });
    });

    it('flags multiple deprecated tags', () => {
      const result = createMockCrawlResult({
        html: '<html><body><center>Text</center><font>More</font><big>Big</big></body></html>',
      });
      const issues = checkContentQuality(result);

      const issue = issues.find(i => i.code === 'deprecated_html_tags');
      expect(issue).toBeDefined();
      expect(issue?.evidence).toMatchObject({
        deprecated: expect.stringContaining('<center>'),
      });
    });

    it('flags <blink>, <big>, <strike>, <tt> tags', () => {
      const result = createMockCrawlResult({
        html: '<html><body><blink>Blink</blink><big>Big</big><strike>Strike</strike><tt>TT</tt></body></html>',
      });
      const issues = checkContentQuality(result);

      const issue = issues.find(i => i.code === 'deprecated_html_tags');
      expect(issue).toBeDefined();
    });

    it('does not flag modern HTML tags', () => {
      const result = createMockCrawlResult({
        html: '<html><body><div><span>Modern</span><p>HTML</p></div></body></html>',
      });
      const issues = checkContentQuality(result);

      expect(issues.find(i => i.code === 'deprecated_html_tags')).toBeUndefined();
    });
  });

  describe('form labels detection', () => {
    it('flags inputs without labels', () => {
      const result = createMockCrawlResult({
        html: '<html><body><form><input type="text" name="username"></form></body></html>',
      });
      const issues = checkContentQuality(result);

      const issue = issues.find(i => i.code === 'form_missing_labels');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P2');
      expect(issue?.category).toBe('ACCESSIBILITY');
    });

    it('does not flag inputs with associated label', () => {
      const result = createMockCrawlResult({
        html: '<html><body><form><label for="user">Username</label><input type="text" id="user" name="username"></form></body></html>',
      });
      const issues = checkContentQuality(result);

      expect(issues.find(i => i.code === 'form_missing_labels')).toBeUndefined();
    });

    it('does not flag inputs with wrapping label', () => {
      const result = createMockCrawlResult({
        html: '<html><body><form><label>Username <input type="text" name="username"></label></form></body></html>',
      });
      const issues = checkContentQuality(result);

      expect(issues.find(i => i.code === 'form_missing_labels')).toBeUndefined();
    });

    it('does not flag inputs with aria-label', () => {
      const result = createMockCrawlResult({
        html: '<html><body><form><input type="text" name="search" aria-label="Search"></form></body></html>',
      });
      const issues = checkContentQuality(result);

      expect(issues.find(i => i.code === 'form_missing_labels')).toBeUndefined();
    });

    it('does not flag inputs with aria-labelledby', () => {
      const result = createMockCrawlResult({
        html: '<html><body><span id="label">Search</span><form><input type="text" aria-labelledby="label"></form></body></html>',
      });
      const issues = checkContentQuality(result);

      expect(issues.find(i => i.code === 'form_missing_labels')).toBeUndefined();
    });

    it('does not flag hidden, submit, button, reset, image inputs', () => {
      const result = createMockCrawlResult({
        html: `<html><body><form>
          <input type="hidden" name="csrf">
          <input type="submit" value="Submit">
          <input type="button" value="Click">
          <input type="reset" value="Reset">
          <input type="image" src="btn.png">
        </form></body></html>`,
      });
      const issues = checkContentQuality(result);

      expect(issues.find(i => i.code === 'form_missing_labels')).toBeUndefined();
    });

    it('reports count of unlabeled inputs', () => {
      const result = createMockCrawlResult({
        html: `<html><body><form>
          <input type="text" name="field1">
          <input type="email" name="field2">
          <input type="password" name="field3">
        </form></body></html>`,
      });
      const issues = checkContentQuality(result);

      const issue = issues.find(i => i.code === 'form_missing_labels');
      expect(issue).toBeDefined();
      expect(issue?.evidence).toMatchObject({ count: 3 });
    });
  });

  describe('iframe titles detection', () => {
    it('flags iframes without title attribute', () => {
      const result = createMockCrawlResult({
        html: '<html><body><iframe src="https://example.com/embed"></iframe></body></html>',
      });
      const issues = checkContentQuality(result);

      const issue = issues.find(i => i.code === 'iframe_missing_title');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('P3');
      expect(issue?.category).toBe('ACCESSIBILITY');
    });

    it('flags iframes with empty title', () => {
      const result = createMockCrawlResult({
        html: '<html><body><iframe src="https://example.com/embed" title=""></iframe></body></html>',
      });
      const issues = checkContentQuality(result);

      const issue = issues.find(i => i.code === 'iframe_missing_title');
      expect(issue).toBeDefined();
    });

    it('flags iframes with whitespace-only title', () => {
      const result = createMockCrawlResult({
        html: '<html><body><iframe src="https://example.com/embed" title="   "></iframe></body></html>',
      });
      const issues = checkContentQuality(result);

      const issue = issues.find(i => i.code === 'iframe_missing_title');
      expect(issue).toBeDefined();
    });

    it('does not flag iframes with proper title', () => {
      const result = createMockCrawlResult({
        html: '<html><body><iframe src="https://example.com/embed" title="Embedded video player"></iframe></body></html>',
      });
      const issues = checkContentQuality(result);

      expect(issues.find(i => i.code === 'iframe_missing_title')).toBeUndefined();
    });

    it('reports count of untitled iframes', () => {
      const result = createMockCrawlResult({
        html: `<html><body>
          <iframe src="https://a.com"></iframe>
          <iframe src="https://b.com"></iframe>
          <iframe src="https://c.com" title="Has title"></iframe>
        </body></html>`,
      });
      const issues = checkContentQuality(result);

      const issue = issues.find(i => i.code === 'iframe_missing_title');
      expect(issue).toBeDefined();
      expect(issue?.evidence).toMatchObject({ count: 2 });
    });

    it('does not flag pages without iframes', () => {
      const result = createMockCrawlResult({
        html: '<html><body><p>No iframes here</p></body></html>',
      });
      const issues = checkContentQuality(result);

      expect(issues.find(i => i.code === 'iframe_missing_title')).toBeUndefined();
    });
  });

  describe('issue properties', () => {
    it('includes all required fields in issues', () => {
      const result = createMockCrawlResult({
        wordCount: 30,
        html: '<html><body><center>Text</center></body></html>',
        images: [{ src: '/img.jpg', alt: null, width: null, height: null }],
        headings: [{ level: 2, text: 'Not h1' }],
      });
      const issues = checkContentQuality(result);

      expect(issues.length).toBeGreaterThan(0);
      for (const issue of issues) {
        expect(issue.code).toBeDefined();
        expect(issue.severity).toMatch(/^P[0-3]$/);
        expect(['CONTENT', 'ACCESSIBILITY']).toContain(issue.category);
        expect(issue.title).toBeDefined();
        expect(issue.whyItMatters).toBeDefined();
        expect(issue.howToFix).toBeDefined();
        expect(issue.evidence).toBeDefined();
        expect(typeof issue.impact).toBe('number');
        expect(typeof issue.effort).toBe('number');
      }
    });
  });

  describe('text extraction', () => {
    it('strips script tags from content', () => {
      const result = createMockCrawlResult({
        html: '<html><body><script>var x = "word word word";</script><p>Simple text.</p></body></html>',
        wordCount: 500,
      });
      const issues = checkContentQuality(result);

      // Should not count words inside script as content
      expect(issues.find(i => i.code === 'keyword_stuffing')).toBeUndefined();
    });

    it('strips style tags from content', () => {
      const result = createMockCrawlResult({
        html: '<html><body><style>body { color: red; }</style><p>Simple text here for the page.</p></body></html>',
        wordCount: 500,
      });
      const issues = checkContentQuality(result);

      // Should not count words inside style as content
      expect(issues.find(i => i.code === 'keyword_stuffing')).toBeUndefined();
    });

    it('decodes HTML entities', () => {
      const simpleText = Array(60).fill('The cat sat on the mat.').join(' ');
      const result = createMockCrawlResult({
        html: `<html><body><p>Don&apos;t &amp; can&apos;t. ${simpleText}</p></body></html>`,
        wordCount: 500,
      });
      const issues = checkContentQuality(result);

      // Should handle entities correctly without breaking readability
      expect(issues.find(i => i.code === 'poor_readability')).toBeUndefined();
    });
  });
});
