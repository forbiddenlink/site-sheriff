import type { ScanComparison, ScanSummary } from './types';

interface Issue {
  code: string;
  title: string;
  category: string;
  severity: string;
}

interface ScanData {
  summary: ScanSummary | null;
  issues: Issue[];
}

/**
 * Compare two scan results to identify changes.
 *
 * @param current - The most recent scan
 * @param previous - The previous scan to compare against
 * @returns Comparison data including score delta, new/resolved issues
 */
export function compareScans(current: ScanData, previous: ScanData): ScanComparison {
  const currentScore = current.summary?.overallScore ?? 0;
  const previousScore = previous.summary?.overallScore ?? 0;
  const scoreDelta = currentScore - previousScore;

  // Create sets of issue codes for comparison
  const currentP0Codes = new Set(
    current.issues
      .filter(i => i.severity === 'P0')
      .map(i => `${i.code}:${i.category}`)
  );

  const previousP0Codes = new Set(
    previous.issues
      .filter(i => i.severity === 'P0')
      .map(i => `${i.code}:${i.category}`)
  );

  // Find new P0 issues (in current but not in previous)
  const newP0Issues = current.issues
    .filter(i => i.severity === 'P0')
    .filter(i => !previousP0Codes.has(`${i.code}:${i.category}`))
    .map(i => ({ code: i.code, title: i.title, category: i.category }));

  // Find resolved issues (in previous but not in current)
  const resolvedIssues = previous.issues
    .filter(i => i.severity === 'P0')
    .filter(i => !currentP0Codes.has(`${i.code}:${i.category}`))
    .map(i => ({ code: i.code, title: i.title, category: i.category }));

  // Count unchanged P0s
  const unchangedP0Count = current.issues
    .filter(i => i.severity === 'P0')
    .filter(i => previousP0Codes.has(`${i.code}:${i.category}`))
    .length;

  // Calculate category deltas
  const categoryDeltas: Record<string, number> = {};
  const currentCategories = current.summary?.categoryScores ?? {};
  const previousCategories = previous.summary?.categoryScores ?? {};

  for (const category of Object.keys({ ...currentCategories, ...previousCategories })) {
    const currentCatScore = currentCategories[category as keyof typeof currentCategories] ?? 0;
    const previousCatScore = previousCategories[category as keyof typeof previousCategories] ?? 0;
    categoryDeltas[category] = currentCatScore - previousCatScore;
  }

  return {
    scoreDelta,
    newP0Issues,
    resolvedIssues,
    unchangedP0Count,
    categoryDeltas,
  };
}

/**
 * Check if an alert should be triggered based on comparison and schedule settings.
 */
export function shouldTriggerAlert(
  comparison: ScanComparison,
  alertOnScoreDrop: number,
  alertOnNewP0: boolean
): { shouldAlert: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // Check score drop
  if (comparison.scoreDelta < 0 && Math.abs(comparison.scoreDelta) >= alertOnScoreDrop) {
    reasons.push(`Score dropped by ${Math.abs(comparison.scoreDelta)} points`);
  }

  // Check new P0 issues
  if (alertOnNewP0 && comparison.newP0Issues.length > 0) {
    reasons.push(`${comparison.newP0Issues.length} new critical issue(s) detected`);
  }

  return {
    shouldAlert: reasons.length > 0,
    reasons,
  };
}
