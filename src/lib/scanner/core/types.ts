import type { ScanSettings } from '../../types';

/**
 * Context passed to the scan runner.
 */
export interface ScanContext {
  scanRunId: string;
  settings: ScanSettings;
  /** Maximum wall-clock time for the entire scan in ms. Default 540 000 (9 min). */
  maxScanTimeMs?: number;
}

/**
 * Issue structure used during scan processing.
 */
export interface ScanIssue {
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

/**
 * All phase names for tracking completion.
 */
export const ALL_PHASE_NAMES = [
  'crawl', 'seo', 'content', 'eeat', 'ai-readiness', 'images', 'resources', 'security',
  'robots-sitemap', 'tech-duplicates', 'internal-linking', 'compression',
  'sitemap-xref', 'ttfb', 'console-errors', 'broken-links',
  'error-page-links', 'accessibility', 'performance', 'service-worker',
] as const;

export type PhaseName = typeof ALL_PHASE_NAMES[number];
