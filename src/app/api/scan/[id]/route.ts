import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-server';

// Validate CUID format (Prisma's default ID generator)
const ScanIdSchema = z.string().min(20).max(30).regex(/^[a-z0-9]+$/, 'Invalid scan ID format');

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
      if (scanError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
      }
      throw scanError;
    }

    // Get previous scan for trend comparison
    let previousScan: { id: string; score: number; createdAt: string } | null = null;
    if (scanRun.status === 'SUCCEEDED' && scanRun.normalizedUrl) {
      const { data: prevScans } = await supabaseAdmin
        .from('ScanRun')
        .select('id, summary, createdAt')
        .eq('normalizedUrl', scanRun.normalizedUrl)
        .eq('status', 'SUCCEEDED')
        .neq('id', validId)
        .order('createdAt', { ascending: false })
        .limit(1);

      if (prevScans && prevScans.length > 0 && prevScans[0].summary?.overallScore != null) {
        previousScan = {
          id: prevScans[0].id,
          score: prevScans[0].summary.overallScore,
          createdAt: prevScans[0].createdAt,
        };
      }
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
      clientEmailDraft: scanRun.clientEmailDraft,
      createdAt: scanRun.createdAt,
      updatedAt: scanRun.updatedAt,
      error: scanRun.error,
      previousScan,
      issues: issues ?? [],
      pages: pages ?? [],
    });
  } catch (error) {
    console.error('Error fetching scan:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scan' },
      { status: 500 }
    );
  }
}
