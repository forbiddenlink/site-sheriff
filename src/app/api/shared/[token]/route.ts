import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;

    // Get scan run by share token
    const { data: scanRun, error: scanError } = await supabaseAdmin
      .from('ScanRun')
      .select('*')
      .eq('shareToken', token)
      .single();

    if (scanError) {
      if (scanError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Shared report not found' }, { status: 404 });
      }
      throw scanError;
    }

    // Get issues
    const { data: issues } = await supabaseAdmin
      .from('Issue')
      .select('*')
      .eq('scanRunId', scanRun.id)
      .order('severity', { ascending: true })
      .order('createdAt', { ascending: true });

    // Get page results
    const { data: pages } = await supabaseAdmin
      .from('PageResult')
      .select('id, url, statusCode, loadTimeMs, title, metaDescription, h1, screenshotPath')
      .eq('scanRunId', scanRun.id);

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
      issues: issues ?? [],
      pages: pages ?? [],
    });
  } catch (error) {
    console.error('Error fetching shared scan:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shared report' },
      { status: 500 }
    );
  }
}
