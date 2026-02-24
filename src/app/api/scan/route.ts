import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { CreateScanRequestSchema, ScanSettingsSchema } from '@/lib/types';
import { normalizeUrl } from '@/lib/url-utils';
import { runScan } from '@/lib/scanner';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const parsed = CreateScanRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { url, settings } = parsed.data;

    // Normalize URL
    let normalizedUrl: string;
    try {
      normalizedUrl = normalizeUrl(url);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Invalid URL' },
        { status: 400 }
      );
    }

    // Merge with defaults
    const finalSettings = ScanSettingsSchema.parse(settings ?? {});

    // Create scan run
    const id = crypto.randomUUID();
    const { data: scanRun, error: dbError } = await supabaseAdmin
      .from('ScanRun')
      .insert({
        id,
        inputUrl: url,
        normalizedUrl,
        status: 'QUEUED',
        settings: finalSettings,
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

    if (dbError) throw dbError;

    // Start the scan in the background (fire-and-forget for MVP)
    // In production, you'd use a proper job queue
    runScan({
      scanRunId: scanRun.id,
      settings: finalSettings,
    }).catch((err) => {
      console.error('Background scan failed:', err);
    });

    return NextResponse.json({
      id: scanRun.id,
      status: scanRun.status,
      inputUrl: scanRun.inputUrl,
      normalizedUrl: scanRun.normalizedUrl,
      progress: scanRun.progress,
      createdAt: scanRun.createdAt,
    });
  } catch (error: unknown) {
    console.error('Error creating scan:', error);
    const detail =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: string }).message)
          : typeof error === 'string'
            ? error
            : 'Unknown error: ' + JSON.stringify(error);
    return NextResponse.json(
      { error: 'Failed to create scan', detail },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 50);

    const { data: scans, error: dbError } = await supabaseAdmin
      .from('ScanRun')
      .select('id, status, inputUrl, normalizedUrl, progress, summary, createdAt, error')
      .order('createdAt', { ascending: false })
      .limit(limit);

    if (dbError) throw dbError;

    return NextResponse.json({ scans });
  } catch (error) {
    console.error('Error listing scans:', error);
    return NextResponse.json(
      { error: 'Failed to list scans' },
      { status: 500 }
    );
  }
}
