import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-server';
import { isNotFoundError } from '@/lib/supabase-errors';
import { logger } from '@/lib/logger';

// Validate UUID or CUID format
const ScanIdSchema = z.string().uuid().or(z.string().min(20).max(30).regex(/^[a-z0-9]+$/));

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Validate ID format
    const parsed = ScanIdSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid scan ID format' }, { status: 400 });
    }
    const validId = parsed.data;

    // Get scan run
    const { data: scanRun, error: scanError } = await supabaseAdmin
      .from('ScanRun')
      .select('*')
      .eq('id', validId)
      .single();

    if (scanError) {
      if (isNotFoundError(scanError)) {
        return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
      }
      throw scanError;
    }

    // Get previous scans for trend comparison and sparkline (up to 9 prior + current)
    let previousScan: { id: string; score: number; createdAt: string } | null = null;
    let scoreHistory: Array<{ id: string; score: number; createdAt: string }> = [];
    if (scanRun.status === 'SUCCEEDED' && scanRun.normalizedUrl && scanRun.summary?.overallScore != null) {
      const { data: prevScans } = await supabaseAdmin
        .from('ScanRun')
        .select('id, summary, createdAt')
        .eq('normalizedUrl', scanRun.normalizedUrl)
        .eq('status', 'SUCCEEDED')
        .neq('id', validId)
        .order('createdAt', { ascending: false })
        .limit(9);

      if (prevScans && prevScans.length > 0) {
        const valid = prevScans.filter((s) => s.summary?.overallScore != null);
        if (valid.length > 0) {
          previousScan = {
            id: valid[0].id,
            score: valid[0].summary.overallScore,
            createdAt: valid[0].createdAt,
          };
          // Build history oldest→newest then append current as final point
          scoreHistory = valid
            .reverse()
            .map((s) => ({ id: s.id, score: s.summary.overallScore as number, createdAt: s.createdAt as string }));
        }
      }
      // Always include current scan as last point
      scoreHistory.push({ id: scanRun.id, score: scanRun.summary.overallScore as number, createdAt: scanRun.createdAt as string });
    }

    // Get issues (ordered by severity asc, createdAt asc)
    const { data: issues } = await supabaseAdmin
      .from('Issue')
      .select('*')
      .eq('scanRunId', validId)
      .order('severity', { ascending: true })
      .order('createdAt', { ascending: true });

    // Get page results
    const { data: pages } = await supabaseAdmin
      .from('PageResult')
      .select('id, url, statusCode, loadTimeMs, title, metaDescription, h1, screenshotPath, links')
      .eq('scanRunId', validId);

    return NextResponse.json({
      id: scanRun.id,
      status: scanRun.status,
      inputUrl: scanRun.inputUrl,
      normalizedUrl: scanRun.normalizedUrl,
      progress: scanRun.progress,
      summary: scanRun.summary,
      settings: scanRun.settings,
      clientEmailDraft: scanRun.clientEmailDraft,
      createdAt: scanRun.createdAt,
      updatedAt: scanRun.updatedAt,
      error: scanRun.error,
      previousScan,
      scoreHistory: scoreHistory.length >= 2 ? scoreHistory : [],
      issues: issues ?? [],
      pages: pages ?? [],
    });
  } catch (error) {
    logger.error('Error fetching scan', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to fetch scan' },
      { status: 500 }
    );
  }
}
