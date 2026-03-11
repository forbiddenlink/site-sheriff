/**
 * Sends a formatted alert email via Resend when a scheduled scan detects issues.
 */
import { Resend } from 'resend';
import type { ScanComparison } from './types';
import { logger } from './logger';

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn('RESEND_API_KEY not set — email alerts disabled');
    return null;
  }
  return new Resend(apiKey);
}

function getFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL ?? 'Site Sheriff <alerts@sitesheriff.io>';
}

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL ?? 'https://sitesheriff.io';
}

function buildSubject(url: string, comparison: ScanComparison, reasons: string[]): string {
  const domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
  const deltaStr =
    comparison.scoreDelta > 0
      ? `+${comparison.scoreDelta}`
      : String(comparison.scoreDelta);
  const reasonSummary =
    comparison.newP0Issues.length > 0
      ? `${comparison.newP0Issues.length} new critical issue${comparison.newP0Issues.length > 1 ? 's' : ''}`
      : reasons[0] ?? 'score change';
  return `🚨 Site Sheriff: ${domain} score ${deltaStr} — ${reasonSummary}`;
}

function buildHtml(
  url: string,
  comparison: ScanComparison,
  reasons: string[],
  scanRunId: string,
): string {
  const baseUrl = getBaseUrl();
  const delta = comparison.scoreDelta;
  const deltaStr = delta > 0 ? `+${delta}` : String(delta);
  const deltaColor = delta < 0 ? '#ef4444' : delta > 0 ? '#22c55e' : '#71717a';
  const deltaEmoji = delta < 0 ? '📉' : delta > 0 ? '📈' : '➡️';

  const newP0Rows =
    comparison.newP0Issues.length > 0
      ? comparison.newP0Issues
          .map(
            (issue) =>
              `<tr>
                <td style="padding:8px 0;border-bottom:1px solid #f4f4f5;">
                  <span style="display:inline-block;background:#fef2f2;color:#dc2626;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:600;margin-right:8px;">P0</span>
                  <span style="color:#18181b;font-size:13px;">${escapeHtml(issue.title)}</span>
                  <span style="color:#a1a1aa;font-size:12px;margin-left:6px;">[${escapeHtml(issue.category)}]</span>
                </td>
              </tr>`,
          )
          .join('')
      : '';

  const resolvedRows =
    comparison.resolvedIssues.length > 0
      ? comparison.resolvedIssues
          .map(
            (issue) =>
              `<tr>
                <td style="padding:8px 0;border-bottom:1px solid #f4f4f5;">
                  <span style="margin-right:8px;">✅</span>
                  <span style="color:#18181b;font-size:13px;">${escapeHtml(issue.title)}</span>
                  <span style="color:#a1a1aa;font-size:12px;margin-left:6px;">[${escapeHtml(issue.category)}]</span>
                </td>
              </tr>`,
          )
          .join('')
      : '';

  const newP0Section =
    comparison.newP0Issues.length > 0
      ? `<h3 style="font-size:14px;font-weight:600;color:#dc2626;margin:24px 0 8px;">New Critical Issues</h3>
         <table style="width:100%;border-collapse:collapse;">${newP0Rows}</table>`
      : '';

  const resolvedSection =
    comparison.resolvedIssues.length > 0
      ? `<h3 style="font-size:14px;font-weight:600;color:#16a34a;margin:24px 0 8px;">Resolved Issues ✅</h3>
         <table style="width:100%;border-collapse:collapse;">${resolvedRows}</table>`
      : '';

  const unchangedNote =
    comparison.unchangedP0Count > 0
      ? `<p style="margin:16px 0 0;font-size:13px;color:#71717a;">
           ${comparison.unchangedP0Count} existing critical issue${comparison.unchangedP0Count > 1 ? 's' : ''} still open.
         </p>`
      : '';

  const reasonsList = reasons
    .map((r) => `<li style="margin-bottom:4px;">${escapeHtml(r)}</li>`)
    .join('');

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Site Sheriff Alert</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f5;margin:0;padding:24px;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="background:#18181b;padding:24px 32px;">
      <p style="color:#a1a1aa;margin:0 0 4px;font-size:12px;letter-spacing:0.05em;text-transform:uppercase;">Site Sheriff</p>
      <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">Scan Alert ${deltaEmoji}</h1>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px;">
      <p style="margin:0 0 20px;color:#71717a;font-size:13px;">Scanned URL</p>
      <p style="margin:0 0 24px;color:#18181b;font-size:15px;font-weight:600;word-break:break-all;">${escapeHtml(url)}</p>

      <!-- Score delta -->
      <div style="display:inline-block;background:#f4f4f5;border-radius:8px;padding:12px 20px;margin-bottom:20px;">
        <p style="margin:0;font-size:12px;color:#71717a;">Score change</p>
        <p style="margin:4px 0 0;font-size:32px;font-weight:700;color:${deltaColor};">${deltaStr}</p>
      </div>

      <!-- Reasons -->
      <div style="background:#fafafa;border-left:3px solid #e4e4e7;border-radius:0 4px 4px 0;padding:14px 18px;margin-bottom:20px;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;">Why you're receiving this</p>
        <ul style="margin:0;padding-left:18px;color:#3f3f46;font-size:13px;">${reasonsList}</ul>
      </div>

      ${newP0Section}
      ${resolvedSection}
      ${unchangedNote}

      <!-- CTA -->
      <div style="margin-top:28px;padding-top:24px;border-top:1px solid #f4f4f5;">
        <a href="${baseUrl}/scan/${scanRunId}"
           style="display:inline-block;background:#18181b;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">
          View Full Report →
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;border-top:1px solid #f4f4f5;">
      <p style="margin:0;font-size:11px;color:#a1a1aa;">
        You received this because you set up a scheduled scan alert on
        <a href="${baseUrl}" style="color:#71717a;">${baseUrl.replace(/^https?:\/\//, '')}</a>.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Sends an alert email via Resend.
 * Silently skips (with a log warning) if RESEND_API_KEY is not configured.
 */
export async function sendAlertEmail(
  to: string,
  url: string,
  comparison: ScanComparison,
  reasons: string[],
  scanRunId: string,
): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const subject = buildSubject(url, comparison, reasons);
  const html = buildHtml(url, comparison, reasons, scanRunId);

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to,
    subject,
    html,
  });

  if (error) {
    logger.error('Failed to send alert email via Resend', {
      to,
      url,
      error: error.message,
    });
    return;
  }

  logger.info('Alert email sent', { to, url, scanRunId });
}
