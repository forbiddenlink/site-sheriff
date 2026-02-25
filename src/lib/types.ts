import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Scan settings schema
// ─────────────────────────────────────────────────────────────────────────────
export const ScanSettingsSchema = z.object({
  maxPages: z.number().min(1).max(50).default(25),
  maxDepth: z.number().min(1).max(5).default(3),
  includeLLM: z.boolean().default(true),
  screenshotMode: z.enum(['none', 'above-fold', 'full-page']).default('above-fold'),
  includePerformance: z.boolean().default(true),
});

export type ScanSettings = z.infer<typeof ScanSettingsSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Scan progress
// ─────────────────────────────────────────────────────────────────────────────
export interface ScanProgress {
  pagesDiscovered: number;
  pagesScanned: number;
  checksCompleted: number;
  currentPage?: string;
  stage: 'crawling' | 'analyzing' | 'performance' | 'summarizing' | 'done';
}

// ─────────────────────────────────────────────────────────────────────────────
// Scan summary (final output)
// ─────────────────────────────────────────────────────────────────────────────
export interface ScanSummary {
  overallScore: number; // 0-100
  categoryScores: {
    seo: number;
    accessibility: number;
    performance: number;
    links: number;
    content: number;
    security: number;
  };
  issueCount: {
    P0: number;
    P1: number;
    P2: number;
    P3: number;
  };
  topIssues: {
    code: string;
    title: string;
    severity: string;
    category: string;
    count: number;
  }[];
  pagesCrawled: number;
  scanDurationMs: number;
  technologies?: Array<{
    name: string;
    category: string;
    confidence: string;
    evidence: string;
  }>;
  socialPreview?: {
    ogTitle: string | null;
    ogDescription: string | null;
    ogImage: string | null;
    ogSiteName: string | null;
    twitterCard: string | null;
    twitterTitle: string | null;
    twitterDescription: string | null;
    twitterImage: string | null;
    favicon: string | null;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Link data
// ─────────────────────────────────────────────────────────────────────────────
export interface LinkData {
  href: string;
  text: string;
  isInternal: boolean;
  statusCode?: number;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Issue evidence
// ─────────────────────────────────────────────────────────────────────────────
export interface IssueEvidence {
  url?: string;
  selector?: string;
  httpStatus?: number;
  snippet?: string;
  expected?: string;
  actual?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// API request/response types
// ─────────────────────────────────────────────────────────────────────────────
export const CreateScanRequestSchema = z.object({
  url: z.string().url('Please enter a valid URL'),
  settings: ScanSettingsSchema.optional(),
});

export type CreateScanRequest = z.infer<typeof CreateScanRequestSchema>;

export interface ScanRunResponse {
  id: string;
  status: string;
  inputUrl: string;
  normalizedUrl: string;
  progress: ScanProgress;
  summary: ScanSummary | null;
  createdAt: string;
  error?: string;
}
