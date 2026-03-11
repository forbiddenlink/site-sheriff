import OpenAI from 'openai';
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

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

/**
 * Generate an AI-written client email draft using GPT-4o-mini.
 * Falls back to null if the API key is not configured, allowing the
 * caller to fall back to the template-based generateEmailDraft().
 */
export async function generateAIEmailDraft(
  inputUrl: string,
  summary: ScanSummary,
  issues: IssueRow[],
  reportUrl: string
): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  const grade =
    summary.overallScore >= 90
      ? 'Excellent'
      : summary.overallScore >= 75
        ? 'Good'
        : summary.overallScore >= 50
          ? 'Needs Improvement'
          : 'Critical';

  const criticalCount = issues.filter((i) => i.severity === 'P0' || i.severity === 'P1').length;

  // Top 7 issues sorted by severity + impact for the prompt
  const topIssues = [...issues]
    .sort((a, b) => {
      const order: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
      const sDiff = (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
      if (sDiff !== 0) return sDiff;
      return (b.impact ?? 0) - (a.impact ?? 0);
    })
    .slice(0, 7);

  const issueList = topIssues
    .map(
      (i) =>
        `- [${i.severity}] ${i.title}${i.whyItMatters ? `: ${i.whyItMatters}` : ''}${i.effort !== null ? ` (effort: ${i.effort}/5)` : ''}`
    )
    .join('\n');

  const categoryLines = Object.entries(summary.categoryScores)
    .map(([cat, score]) => `${cat}: ${score}/100`)
    .join(', ');

  const prompt = `You are writing a professional client-facing email on behalf of a web agency that just completed a site audit.

Site audited: ${inputUrl}
Overall score: ${summary.overallScore}/100 (${grade})
Pages analyzed: ${summary.pagesCrawled}
Total issues found: ${issues.length} (${criticalCount} high-priority)
Category scores: ${categoryLines}

Top issues found:
${issueList}

Full report URL: ${reportUrl}

Write a concise, professional email (200–300 words) that:
1. Opens warmly without being sycophantic
2. States the overall health and key findings in plain English
3. Briefly calls out 2-3 of the most important issues and why they matter to the business (not just technically)
4. Recommends a next step (reviewing the report together)
5. Ends with a soft call to action for a call
6. Uses placeholders [Client Name] and [Your Name] where appropriate
7. Does NOT use bullet point lists — write in flowing paragraphs
8. Does NOT include a subject line

Return only the email body text, nothing else.`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
      temperature: 0.7,
    });

    const text = response.choices[0]?.message?.content?.trim();
    return text ?? null;
  } catch (err) {
    console.warn('OpenAI email draft generation failed, falling back to template:', err);
    return null;
  }
}
