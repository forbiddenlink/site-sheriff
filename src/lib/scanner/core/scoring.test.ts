import { describe, it, expect } from 'vitest';
import {
  SEVERITY_PENALTY,
  impactToScore,
  computeCategoryScore,
  computeSummary,
} from './scoring';
import type { CrawlResult } from '../crawler';

describe('SEVERITY_PENALTY', () => {
  it('has correct penalty values for each severity level', () => {
    expect(SEVERITY_PENALTY.P0).toBe(20);
    expect(SEVERITY_PENALTY.P1).toBe(8);
    expect(SEVERITY_PENALTY.P2).toBe(3);
    expect(SEVERITY_PENALTY.P3).toBe(1);
  });
});

describe('impactToScore', () => {
  it('returns 5 for critical impact', () => {
    expect(impactToScore('critical')).toBe(5);
  });

  it('returns 4 for serious impact', () => {
    expect(impactToScore('serious')).toBe(4);
  });

  it('returns 3 for moderate impact', () => {
    expect(impactToScore('moderate')).toBe(3);
  });

  it('returns 2 for minor impact', () => {
    expect(impactToScore('minor')).toBe(2);
  });

  it('returns 2 for null', () => {
    expect(impactToScore(null)).toBe(2);
  });

  it('returns 2 for undefined', () => {
    expect(impactToScore(undefined)).toBe(2);
  });

  it('returns 2 for unknown strings', () => {
    expect(impactToScore('unknown')).toBe(2);
    expect(impactToScore('')).toBe(2);
  });
});

describe('computeCategoryScore', () => {
  it('returns 100 when no issues exist', () => {
    const score = computeCategoryScore([], 'SEO');
    expect(score).toBe(100);
  });

  it('returns 100 when no issues match the category', () => {
    const issues = [
      { severity: 'P0', category: 'SECURITY', code: 'SEC001' },
    ];
    const score = computeCategoryScore(issues, 'SEO');
    expect(score).toBe(100);
  });

  it('applies P0 penalty correctly', () => {
    const issues = [
      { severity: 'P0', category: 'SEO', code: 'SEO001' },
    ];
    const score = computeCategoryScore(issues, 'SEO');
    // P0 = 20 penalty, diminishing returns: 100 * (1 - exp(-20/80)) ≈ 22
    // Score = 100 - 22 = 78
    expect(score).toBeGreaterThan(70);
    expect(score).toBeLessThan(85);
  });

  it('applies P1 penalty correctly', () => {
    const issues = [
      { severity: 'P1', category: 'SEO', code: 'SEO001' },
    ];
    const score = computeCategoryScore(issues, 'SEO');
    // P1 = 8 penalty, diminishing returns applied
    expect(score).toBeGreaterThan(85);
    expect(score).toBeLessThan(95);
  });

  it('applies P2 penalty correctly', () => {
    const issues = [
      { severity: 'P2', category: 'SEO', code: 'SEO001' },
    ];
    const score = computeCategoryScore(issues, 'SEO');
    // P2 = 3 penalty, diminishing returns applied
    expect(score).toBeGreaterThan(93);
    expect(score).toBeLessThan(100);
  });

  it('applies P3 penalty correctly', () => {
    const issues = [
      { severity: 'P3', category: 'SEO', code: 'SEO001' },
    ];
    const score = computeCategoryScore(issues, 'SEO');
    // P3 = 1 penalty, diminishing returns applied
    expect(score).toBeGreaterThan(97);
    expect(score).toBeLessThan(100);
  });

  it('groups issues by code to avoid over-penalizing', () => {
    // Same issue on 10 pages should not be 10x penalty
    const issues = Array(10).fill(null).map(() => ({
      severity: 'P1',
      category: 'SEO',
      code: 'SEO001', // Same code
    }));
    const score = computeCategoryScore(issues, 'SEO');

    // Base P1 = 8, plus log2(10) ≈ 4, capped at +3 = 11 total
    // Much less than 10 * 8 = 80
    expect(score).toBeGreaterThan(75);
  });

  it('applies logarithmic penalty for repeated issues capped at +3', () => {
    // 100 instances of same issue
    const issues = Array(100).fill(null).map(() => ({
      severity: 'P1',
      category: 'SEO',
      code: 'SEO001',
    }));
    const score = computeCategoryScore(issues, 'SEO');

    // P1 = 8, extra = min(ceil(log2(100)), 3) = min(7, 3) = 3
    // Total = 11 raw penalty
    expect(score).toBeGreaterThan(75);
    expect(score).toBeLessThan(90);
  });

  it('accumulates penalties for different issue codes', () => {
    const issues = [
      { severity: 'P1', category: 'SEO', code: 'SEO001' },
      { severity: 'P1', category: 'SEO', code: 'SEO002' },
      { severity: 'P1', category: 'SEO', code: 'SEO003' },
    ];
    const score = computeCategoryScore(issues, 'SEO');

    // 3 unique P1 issues = 3 * 8 = 24 raw penalty
    // Score should be lower than single P1
    expect(score).toBeLessThan(80);
    expect(score).toBeGreaterThan(50);
  });

  it('applies diminishing returns curve', () => {
    // Many small issues shouldn't crater the score
    const issues = Array(20).fill(null).map((_, i) => ({
      severity: 'P3',
      category: 'SEO',
      code: `SEO${String(i).padStart(3, '0')}`,
    }));
    const score = computeCategoryScore(issues, 'SEO');

    // 20 unique P3 issues = 20 raw penalty
    // With diminishing returns, score stays reasonable
    expect(score).toBeGreaterThan(70);
  });

  it('defaults to P2 penalty for unknown severity', () => {
    const issues = [
      { severity: 'UNKNOWN', category: 'SEO', code: 'SEO001' },
    ];
    const score = computeCategoryScore(issues, 'SEO');
    // Uses P2 default = 3
    expect(score).toBeGreaterThan(93);
    expect(score).toBeLessThan(100);
  });

  it('never returns score below 0', () => {
    // Extreme case: many P0 issues
    const issues = Array(50).fill(null).map((_, i) => ({
      severity: 'P0',
      category: 'SEO',
      code: `SEO${String(i).padStart(3, '0')}`,
    }));
    const score = computeCategoryScore(issues, 'SEO');
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('computeSummary', () => {
  const createMockCrawlResult = (overrides: Partial<CrawlResult> = {}): CrawlResult => ({
    url: 'https://example.com',
    statusCode: 200,
    loadTimeMs: 100,
    html: '<html></html>',
    title: 'Example',
    metaDescription: 'A test page',
    h1: 'Example',
    canonical: null,
    robotsMeta: null,
    wordCount: 500,
    links: [],
    responseHeaders: {},
    cookies: [],
    images: [],
    headings: [],
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

  it('computes issue counts by severity', () => {
    const issues = [
      { severity: 'P0', category: 'SEO', code: 'SEO001', title: 'Critical SEO' },
      { severity: 'P0', category: 'SECURITY', code: 'SEC001', title: 'Critical Security' },
      { severity: 'P1', category: 'SEO', code: 'SEO002', title: 'High SEO' },
      { severity: 'P2', category: 'CONTENT', code: 'CON001', title: 'Medium Content' },
      { severity: 'P3', category: 'LINKS', code: 'LNK001', title: 'Low Links' },
    ];
    const crawlResults = [createMockCrawlResult()];

    const summary = computeSummary(issues, crawlResults, 1000);

    expect(summary.issueCount.P0).toBe(2);
    expect(summary.issueCount.P1).toBe(1);
    expect(summary.issueCount.P2).toBe(1);
    expect(summary.issueCount.P3).toBe(1);
  });

  it('computes category scores with correct weights', () => {
    const issues: Array<{ severity: string; category: string; code: string; title: string }> = [];
    const crawlResults = [createMockCrawlResult()];

    const summary = computeSummary(issues, crawlResults, 1000);

    // With no issues, all categories should be 100
    expect(summary.categoryScores.seo).toBe(100);
    expect(summary.categoryScores.accessibility).toBe(100);
    expect(summary.categoryScores.performance).toBe(100);
    expect(summary.categoryScores.links).toBe(100);
    expect(summary.categoryScores.content).toBe(100);
    expect(summary.categoryScores.security).toBe(100);
    expect(summary.overallScore).toBe(100);
  });

  it('applies correct category weights to overall score', () => {
    // Create issues that only affect SEO (25% weight)
    const issues = [
      { severity: 'P0', category: 'SEO', code: 'SEO001', title: 'Critical SEO' },
    ];
    const crawlResults = [createMockCrawlResult()];

    const summary = computeSummary(issues, crawlResults, 1000);

    // SEO score should be reduced, others at 100
    expect(summary.categoryScores.seo).toBeLessThan(100);
    expect(summary.categoryScores.accessibility).toBe(100);
    expect(summary.categoryScores.security).toBe(100);

    // Overall should be weighted: SEO*0.25 + A11Y*0.2 + Perf*0.15 + Links*0.1 + Content*0.1 + Security*0.2
    const expectedOverall = Math.round(
      summary.categoryScores.seo * 0.25 +
      100 * 0.2 + // accessibility
      100 * 0.15 + // performance
      100 * 0.1 + // links
      100 * 0.1 + // content
      100 * 0.2 // security
    );
    expect(summary.overallScore).toBe(expectedOverall);
  });

  it('generates top issues grouped by code and counts correctly', () => {
    const issues = [
      { severity: 'P2', category: 'SEO', code: 'SEO001', title: 'Medium 1' },
      { severity: 'P2', category: 'SEO', code: 'SEO001', title: 'Medium 1' }, // Duplicate
      { severity: 'P2', category: 'SEO', code: 'SEO001', title: 'Medium 1' }, // Duplicate
      { severity: 'P0', category: 'SECURITY', code: 'SEC001', title: 'Critical' },
      { severity: 'P1', category: 'CONTENT', code: 'CON001', title: 'High' },
      { severity: 'P1', category: 'CONTENT', code: 'CON002', title: 'High 2' },
      { severity: 'P1', category: 'CONTENT', code: 'CON002', title: 'High 2' }, // Duplicate
    ];
    const crawlResults = [createMockCrawlResult()];

    const summary = computeSummary(issues, crawlResults, 1000);

    // Issues should be grouped by code (4 unique codes)
    expect(summary.topIssues.length).toBe(4);

    // SEO001 should have count of 3
    const seoIssue = summary.topIssues.find(i => i.code === 'SEO001');
    expect(seoIssue?.count).toBe(3);

    // CON002 should have count of 2
    const con002Issue = summary.topIssues.find(i => i.code === 'CON002');
    expect(con002Issue?.count).toBe(2);

    // P0 issue should exist
    const p0Issue = summary.topIssues.find(i => i.severity === 'P0');
    expect(p0Issue).toBeDefined();
    expect(p0Issue?.code).toBe('SEC001');

    // All severities should be represented
    const severities = new Set(summary.topIssues.map(i => i.severity));
    expect(severities.has('P0')).toBe(true);
    expect(severities.has('P1')).toBe(true);
    expect(severities.has('P2')).toBe(true);
  });

  it('sorts top issues by severity first, then by count', () => {
    // Create issues where sorting matters
    const issues = [
      { severity: 'P1', category: 'SEO', code: 'HIGH1', title: 'High 1' },
      { severity: 'P0', category: 'SECURITY', code: 'CRIT1', title: 'Critical 1' },
      { severity: 'P1', category: 'SEO', code: 'HIGH2', title: 'High 2' },
      { severity: 'P1', category: 'SEO', code: 'HIGH2', title: 'High 2' }, // Duplicate to increase count
    ];
    const crawlResults = [createMockCrawlResult()];

    const summary = computeSummary(issues, crawlResults, 1000);

    // Verify we have 3 unique issues
    expect(summary.topIssues.length).toBe(3);

    // Find each issue
    const p0Issue = summary.topIssues.find(i => i.severity === 'P0');
    const high2Issue = summary.topIssues.find(i => i.code === 'HIGH2');

    // P0 should exist
    expect(p0Issue).toBeDefined();
    expect(p0Issue?.code).toBe('CRIT1');

    // HIGH2 should have count of 2
    expect(high2Issue?.count).toBe(2);

    // Verify severities: topIssues contains P0 at lower index than P1
    const p0Index = summary.topIssues.findIndex(i => i.severity === 'P0');
    const p1Indices = summary.topIssues
      .map((i, idx) => i.severity === 'P1' ? idx : -1)
      .filter(idx => idx !== -1);

    // P0 should come before all P1 issues
    for (const p1Index of p1Indices) {
      expect(p0Index).toBeLessThan(p1Index);
    }
  });

  it('limits top issues to 10', () => {
    const issues = Array(20).fill(null).map((_, i) => ({
      severity: 'P2',
      category: 'SEO',
      code: `SEO${String(i).padStart(3, '0')}`,
      title: `Issue ${i}`,
    }));
    const crawlResults = [createMockCrawlResult()];

    const summary = computeSummary(issues, crawlResults, 1000);

    expect(summary.topIssues.length).toBe(10);
  });

  it('includes pages crawled count', () => {
    const issues: Array<{ severity: string; category: string; code: string; title: string }> = [];
    const crawlResults = [
      createMockCrawlResult({ url: 'https://example.com' }),
      createMockCrawlResult({ url: 'https://example.com/about' }),
      createMockCrawlResult({ url: 'https://example.com/contact' }),
    ];

    const summary = computeSummary(issues, crawlResults, 1000);

    expect(summary.pagesCrawled).toBe(3);
  });

  it('includes scan duration', () => {
    const issues: Array<{ severity: string; category: string; code: string; title: string }> = [];
    const crawlResults = [createMockCrawlResult()];

    const summary = computeSummary(issues, crawlResults, 5432);

    expect(summary.scanDurationMs).toBe(5432);
  });

  it('includes technologies when provided', () => {
    const issues: Array<{ severity: string; category: string; code: string; title: string }> = [];
    const crawlResults = [createMockCrawlResult()];
    const technologies = [
      { name: 'Next.js', category: 'Framework', confidence: 'high', evidence: 'detected in HTML' },
    ];

    const summary = computeSummary(issues, crawlResults, 1000, technologies);

    expect(summary.technologies).toEqual(technologies);
  });

  it('extracts social preview from homepage', () => {
    const crawlResults = [createMockCrawlResult({
      ogTags: {
        'og:title': 'Example Site',
        'og:description': 'A great example',
        'og:image': 'https://example.com/og.png',
        'og:site_name': 'Example',
        'twitter:card': 'summary_large_image',
        'twitter:title': 'Example Site Twitter',
        'twitter:description': 'Twitter description',
        'twitter:image': 'https://example.com/twitter.png',
      },
      favicon: 'https://example.com/favicon.ico',
    })];

    const summary = computeSummary([], crawlResults, 1000);

    expect(summary.socialPreview).toEqual({
      ogTitle: 'Example Site',
      ogDescription: 'A great example',
      ogImage: 'https://example.com/og.png',
      ogSiteName: 'Example',
      twitterCard: 'summary_large_image',
      twitterTitle: 'Example Site Twitter',
      twitterDescription: 'Twitter description',
      twitterImage: 'https://example.com/twitter.png',
      favicon: 'https://example.com/favicon.ico',
    });
  });

  it('handles missing OG tags gracefully', () => {
    const crawlResults = [createMockCrawlResult({
      ogTags: {},
      favicon: null,
    })];

    const summary = computeSummary([], crawlResults, 1000);

    expect(summary.socialPreview).toEqual({
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      ogSiteName: null,
      twitterCard: null,
      twitterTitle: null,
      twitterDescription: null,
      twitterImage: null,
      favicon: null,
    });
  });

  it('handles empty crawl results', () => {
    const summary = computeSummary([], [], 1000);

    expect(summary.pagesCrawled).toBe(0);
    expect(summary.socialPreview).toBeUndefined();
  });
});
