import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { supabaseAdmin } from '@/lib/supabase-server';
import { runScan } from '@/lib/scanner';
import { logger } from '@/lib/logger';
import { calculateNextRunAfterCompletion } from '@/lib/schedule-utils';
import { compareScans, shouldTriggerAlert } from '@/lib/scan-comparison';
import { sendAlertEmail } from '@/lib/alert-email';
import type { ScanSettings, ScheduleFrequency } from '@/lib/types';

// Allow up to 600 seconds for cron processing
export const maxDuration = 600;

// Verify request is from Vercel Cron
function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // In development, allow without secret
    return process.env.NODE_ENV === 'development';
  }
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${cronSecret}`;
}

export async function POST(request: NextRequest) {
  // Verify cron secret
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date().toISOString();

    // Find schedules that are due to run
    const { data: dueSchedules, error: queryError } = await supabaseAdmin
      .from('ScanSchedule')
      .select('*')
      .eq('enabled', true)
      .lte('nextRunAt', now)
      .limit(10); // Process up to 10 at a time to avoid timeouts

    if (queryError) throw queryError;

    if (!dueSchedules || dueSchedules.length === 0) {
      return NextResponse.json({ message: 'No schedules due', processed: 0 });
    }

    logger.info('Processing scheduled scans', { count: dueSchedules.length });

    const results: Array<{ scheduleId: string; scanId: string; status: string }> = [];

    for (const schedule of dueSchedules) {
      try {
        // Create a new scan run linked to this schedule
        const scanId = crypto.randomUUID();
        const settings = (schedule.settings as ScanSettings) ?? {};

        const { data: scanRun, error: insertError } = await supabaseAdmin
          .from('ScanRun')
          .insert({
            id: scanId,
            inputUrl: schedule.url,
            normalizedUrl: schedule.url,
            status: 'QUEUED',
            settings,
            scheduleId: schedule.id,
            updatedAt: new Date().toISOString(),
            progress: {
              pagesDiscovered: 0,
              pagesScanned: 0,
              checksCompleted: 0,
              stage: 'crawling',
            },
          })
          .select()
          .single();

        if (insertError) {
          logger.error('Failed to create scheduled scan run', {
            scheduleId: schedule.id,
            error: insertError.message,
          });
          results.push({ scheduleId: schedule.id, scanId: '', status: 'failed_to_create' });
          continue;
        }

        // Update schedule: set lastRunAt and calculate nextRunAt
        const nextRunAt = calculateNextRunAfterCompletion(schedule.frequency as ScheduleFrequency);
        await supabaseAdmin
          .from('ScanSchedule')
          .update({
            lastRunAt: new Date().toISOString(),
            nextRunAt: nextRunAt.toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .eq('id', schedule.id);

        // Run the scan in background
        const scanPromise = runScheduledScan(scanRun.id, settings, schedule);
        waitUntil(scanPromise);

        results.push({ scheduleId: schedule.id, scanId: scanRun.id, status: 'started' });
      } catch (err) {
        logger.error('Error processing schedule', {
          scheduleId: schedule.id,
          error: err instanceof Error ? err.message : String(err),
        });
        results.push({ scheduleId: schedule.id, scanId: '', status: 'error' });
      }
    }

    return NextResponse.json({
      message: `Processed ${results.length} scheduled scans`,
      processed: results.length,
      results,
    });
  } catch (error) {
    logger.error('Cron handler error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to process scheduled scans' }, { status: 500 });
  }
}

interface Schedule {
  id: string;
  url: string;
  alertEmail: string | null;
  alertSlack: string | null;
  alertOnScoreDrop: number;
  alertOnNewP0: boolean;
}

async function runScheduledScan(scanRunId: string, settings: ScanSettings, schedule: Schedule) {
  try {
    await runScan({ scanRunId, settings });

    // After scan completes, check for alerts
    await checkAndSendAlerts(scanRunId, schedule);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('Scheduled scan failed', { scanId: scanRunId, error: errorMessage });

    await supabaseAdmin
      .from('ScanRun')
      .update({
        status: 'FAILED',
        error: errorMessage.slice(0, 500),
        updatedAt: new Date().toISOString(),
      })
      .eq('id', scanRunId);
  }
}

async function checkAndSendAlerts(scanRunId: string, schedule: Schedule) {
  try {
    // Get current scan with issues
    const { data: currentScan } = await supabaseAdmin
      .from('ScanRun')
      .select('summary')
      .eq('id', scanRunId)
      .single();

    const { data: currentIssues } = await supabaseAdmin
      .from('Issue')
      .select('code, title, category, severity')
      .eq('scanRunId', scanRunId);

    // Get previous scan for comparison
    const { data: previousScans } = await supabaseAdmin
      .from('ScanRun')
      .select('id, summary')
      .eq('scheduleId', schedule.id)
      .eq('status', 'SUCCEEDED')
      .neq('id', scanRunId)
      .order('createdAt', { ascending: false })
      .limit(1);

    if (!previousScans || previousScans.length === 0) {
      // No previous scan to compare - skip alerting
      return;
    }

    const previousScan = previousScans[0];
    const { data: previousIssues } = await supabaseAdmin
      .from('Issue')
      .select('code, title, category, severity')
      .eq('scanRunId', previousScan.id);

    // Compare scans
    const comparison = compareScans(
      { summary: currentScan?.summary, issues: currentIssues ?? [] },
      { summary: previousScan.summary, issues: previousIssues ?? [] }
    );

    const { shouldAlert, reasons } = shouldTriggerAlert(
      comparison,
      schedule.alertOnScoreDrop,
      schedule.alertOnNewP0
    );

    if (shouldAlert) {
      logger.info('Alert triggered for schedule', {
        scheduleId: schedule.id,
        scanId: scanRunId,
        reasons: reasons.join('; '),
      });

      // Send alerts (email and/or Slack)
      if (schedule.alertEmail) {
        await sendAlertEmail(schedule.alertEmail, schedule.url, comparison, reasons, scanRunId);
      }
      if (schedule.alertSlack) {
        await sendSlackAlert(schedule.alertSlack, schedule.url, comparison, reasons);
      }
    }
  } catch (err) {
    logger.error('Failed to check/send alerts', {
      scanId: scanRunId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function sendSlackAlert(
  webhookUrl: string,
  url: string,
  comparison: ReturnType<typeof compareScans>,
  reasons: string[]
) {
  try {
    const scoreEmoji = comparison.scoreDelta < 0 ? '📉' : comparison.scoreDelta > 0 ? '📈' : '➡️';
    const alertEmoji = comparison.newP0Issues.length > 0 ? '🚨' : '⚠️';
    const reasonsText = reasons.map(r => `• ${r}`).join('\n');
    const scoreChange = `${comparison.scoreDelta > 0 ? '+' : ''}${comparison.scoreDelta}`;

    const message = {
      text: `${alertEmoji} Site Sheriff Alert for ${url}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `${alertEmoji} Site Sheriff Alert`, emoji: true },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*URL:* ${url}\n*Reasons:*\n${reasonsText}`,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Score Change:* ${scoreEmoji} ${scoreChange}` },
            { type: 'mrkdwn', text: `*New P0 Issues:* ${comparison.newP0Issues.length}` },
          ],
        },
      ],
    };

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    logger.info('Slack alert sent', { url });
  } catch (err) {
    logger.error('Failed to send Slack alert', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Also support GET for manual testing in development
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }
  return POST(request);
}
