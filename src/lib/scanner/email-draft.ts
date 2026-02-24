import type { ScanSummary } from '../types';

interface IssueRow {
  code: string;
  severity: string;
  category: string;
  title: string;
  whyItMatters: string | null;
  howToFix: string | null;
  impact: number | null;
  effort: number | null;
}

/**
 * Generate a professional, client-friendly email draft summarizing the scan.
 */
export function generateEmailDraft(
  inputUrl: string,
  summary: ScanSummary,
  issues: IssueRow[],
  reportUrl: string
): string {
  const { overallScore, categoryScores, pagesCrawled } = summary;

  // Grade label
  const grade =
    overallScore >= 90
      ? 'Excellent'
      : overallScore >= 75
        ? 'Good'
        : overallScore >= 50
          ? 'Needs Improvement'
          : 'Critical';

  // Count P0/P1 (critical/high)
  const criticalCount = issues.filter((i) => i.severity === 'P0' || i.severity === 'P1').length;
  const totalCount = issues.length;

  // Top 5 most impactful issues
  const topFive = issues
    .sort((a, b) => {
      const severityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
      const sDiff = (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4);
      if (sDiff !== 0) return sDiff;
      return (b.impact ?? 0) - (a.impact ?? 0);
    })
    .slice(0, 5);

  // Format category scores
  const catLines = Object.entries(categoryScores)
    .map(([cat, score]) => {
      const emoji =
        score >= 80 ? '✅' : score >= 50 ? '⚠️' : '🔴';
      return `  ${emoji} ${cat.charAt(0).toUpperCase() + cat.slice(1)}: ${score}/100`;
    })
    .join('\n');

  // Format top issues
  const issueLines = topFive
    .map((issue, i) => {
      const effortLabel =
        issue.effort !== null
          ? issue.effort <= 2
            ? ' (Easy fix)'
            : issue.effort === 3
              ? ' (Medium effort)'
              : ' (Complex fix)'
          : '';
      return `  ${i + 1}. [${issue.severity}] ${issue.title}${effortLabel}`;
    })
    .join('\n');

  const emailDraft = `Hi [Client Name],

I ran a comprehensive QA audit on ${inputUrl} and wanted to share the results with you.

📊 Overall Score: ${overallScore}/100 (${grade})
📄 Pages Analyzed: ${pagesCrawled}
🔍 Issues Found: ${totalCount} total (${criticalCount} high-priority)

Category Breakdown:
${catLines}

Top Priority Issues:
${issueLines}

${criticalCount > 0 ? `There are ${criticalCount} high-priority issues that I'd recommend addressing first — these have the biggest impact on your site's performance, SEO, and user experience.` : 'Your site is in good shape overall. The issues found are minor improvements that can be addressed over time.'}

You can view the full report with detailed explanations and fix instructions here:
${reportUrl}

I can walk you through the findings and put together a plan to address these. Would you have time for a quick call this week?

Best regards,
[Your Name]`;

  return emailDraft;
}
