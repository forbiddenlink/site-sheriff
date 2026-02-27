import { supabaseAdmin } from '../../supabase-server';
import type { CrawlResult } from '../crawler';
import type { ScanProgress } from '../../types';

/**
 * Update scan progress in the database.
 */
export async function updateProgress(scanRunId: string, progress: ScanProgress): Promise<void> {
  await supabaseAdmin
    .from('ScanRun')
    .update({ progress, updatedAt: new Date().toISOString() })
    .eq('id', scanRunId);
}

/**
 * Deduplicate issues by code + url.
 */
export function dedupeIssues<T extends { code: string; evidence: { url?: string } }>(issues: T[]): T[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${(issue.evidence as { url?: string }).url || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Determine if a crawl result is an HTML page (not JSON API, redirect, etc.).
 */
export function isHtmlPage(r: CrawlResult): boolean {
  if (r.error) return false;
  const ct = r.contentType?.toLowerCase() ?? '';
  // Must have text/html content type (or be empty, which typically means HTML)
  const isHtmlContentType = !ct || ct.includes('text/html') || ct.includes('application/xhtml+xml');
  if (!isHtmlContentType) return false;
  // Skip pages with very low word count that look like JSON/API responses
  return !(r.wordCount === 0 && r.html.trim().startsWith('{'));
}

/**
 * Normalize URL for comparison (remove trailing slash, lowercase).
 */
export function normalizeForCompare(u: string): string {
  try {
    const parsed = new URL(u);
    return (parsed.origin + parsed.pathname).replace(/\/+$/, '').toLowerCase();
  } catch {
    return u.replace(/\/+$/, '').toLowerCase();
  }
}
