import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const a = searchParams.get('a');
  const b = searchParams.get('b');

  if (!a || !b) {
    return NextResponse.json(
      { error: 'Both scan IDs (a and b) are required' },
      { status: 400 }
    );
  }

  try {
    const [resultA, resultB] = await Promise.all([
      supabaseAdmin
        .from('ScanRun')
        .select('id, inputUrl, normalizedUrl, summary, createdAt')
        .eq('id', a)
        .eq('status', 'SUCCEEDED')
        .single(),
      supabaseAdmin
        .from('ScanRun')
        .select('id, inputUrl, normalizedUrl, summary, createdAt')
        .eq('id', b)
        .eq('status', 'SUCCEEDED')
        .single(),
    ]);

    if (resultA.error || !resultA.data) {
      return NextResponse.json(
        { error: `Scan A not found or not succeeded (id: ${a})` },
        { status: 404 }
      );
    }

    if (resultB.error || !resultB.data) {
      return NextResponse.json(
        { error: `Scan B not found or not succeeded (id: ${b})` },
        { status: 404 }
      );
    }

    const [issuesA, issuesB] = await Promise.all([
      supabaseAdmin
        .from('Issue')
        .select('code, title, severity, category')
        .eq('scanRunId', a)
        .order('severity', { ascending: true }),
      supabaseAdmin
        .from('Issue')
        .select('code, title, severity, category')
        .eq('scanRunId', b)
        .order('severity', { ascending: true }),
    ]);

    return NextResponse.json({
      scanA: resultA.data,
      scanB: resultB.data,
      issuesA: issuesA.data ?? [],
      issuesB: issuesB.data ?? [],
    });
  } catch (error) {
    logger.error('Error comparing scans', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to compare scans' },
      { status: 500 }
    );
  }
}
