import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { supabaseAdmin } from '@/lib/supabase-server';
import { CreateScanRequestSchema, ScanSettingsSchema } from '@/lib/types';
import { normalizeUrl, isSafeUrl } from '@/lib/url-utils';
import { runScan } from '@/lib/scanner';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

// Allow up to 600 seconds (10 min) for the scan background work
export const maxDuration = 600;

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 scans per IP per 10 minutes
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    const limit = await rateLimit(ip, 10, 10 * 60 * 1000);

    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded. Please try again later.',
          retryAfterMs: limit.resetMs,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(limit.resetMs / 1000)),
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }

    const body = await request.json();

    // Validate request
    const parsed = CreateScanRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
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

    // SSRF protection: block private/internal addresses
    if (!isSafeUrl(normalizedUrl)) {
      return NextResponse.json(
        { error: 'URL not allowed: private or internal addresses are blocked' },
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

    // Run the scan in the background using waitUntil to keep the function alive
    // on Vercel serverless after the response is sent
    const scanPromise = runScan({
      scanRunId: scanRun.id,
      settings: finalSettings,
    }).catch(async (err) => {
      // Persist failure status so the scan doesn't stay RUNNING forever
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('Background scan failed', { scanId: scanRun.id, error: errorMessage });
      try {
        await supabaseAdmin
          .from('ScanRun')
          .update({
            status: 'FAILED',
            error: errorMessage.slice(0, 500), // Truncate to avoid DB issues
            updatedAt: new Date().toISOString(),
          })
          .eq('id', scanRun.id);
      } catch (dbErr) {
        logger.error('Failed to update scan status to FAILED', {
          scanId: scanRun.id,
          error: dbErr instanceof Error ? dbErr.message : String(dbErr),
        });
      }
    });

    waitUntil(scanPromise);

    return NextResponse.json({
      id: scanRun.id,
      status: scanRun.status,
      inputUrl: scanRun.inputUrl,
      normalizedUrl: scanRun.normalizedUrl,
      progress: scanRun.progress,
      createdAt: scanRun.createdAt,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error creating scan', { error: errorMessage });
    // Only expose error details in development to prevent information leakage
    const detail = process.env.NODE_ENV === 'development'
      ? errorMessage
      : 'An error occurred while processing your request';
    return NextResponse.json(
      { error: 'Failed to create scan', detail },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number.parseInt(searchParams.get('limit') ?? '10'), 50);
    const cursor = searchParams.get('cursor'); // Format: "timestamp_id"

    let query = supabaseAdmin
      .from('ScanRun')
      .select('id, status, inputUrl, normalizedUrl, progress, summary, createdAt, error')
      .order('createdAt', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1); // Fetch one extra to check if there's a next page

    // Apply cursor for pagination with format validation
    if (cursor) {
      // Validate cursor format: ISO timestamp + underscore + UUID
      // Example: 2024-01-15T10:30:00.000Z_a1b2c3d4-e5f6-7890-abcd-ef1234567890
      const cursorPattern = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)_([a-f0-9-]{36})$/i;
      const match = cursor.match(cursorPattern);
      if (match) {
        const [, timestamp, cursorId] = match;
        // Use composite cursor: createdAt < cursor OR (createdAt = cursor AND id < cursorId)
        query = query.or(`createdAt.lt.${timestamp},and(createdAt.eq.${timestamp},id.lt.${cursorId})`);
      }
      // Invalid cursor format is silently ignored (returns first page)
    }

    const { data: scans, error: dbError } = await query;

    if (dbError) throw dbError;

    // Determine if there's a next page
    const hasNextPage = scans && scans.length > limit;
    const results = scans?.slice(0, limit) ?? [];

    // Build next cursor from last item
    const lastItem = results[results.length - 1];
    const nextCursor = hasNextPage && lastItem
      ? `${lastItem.createdAt}_${lastItem.id}`
      : null;

    // Transform to reduce payload size - only include score from summary
    const transformedScans = results.map((scan) => ({
      id: scan.id,
      status: scan.status,
      inputUrl: scan.inputUrl,
      normalizedUrl: scan.normalizedUrl,
      progress: scan.progress,
      overallScore: scan.summary?.overallScore ?? null,
      issueCount: scan.summary?.issueCount ?? null,
      createdAt: scan.createdAt,
      error: scan.error,
    }));

    return NextResponse.json({
      scans: transformedScans,
      nextCursor,
      hasNextPage,
    });
  } catch (error) {
    logger.error('Error listing scans', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to list scans' },
      { status: 500 }
    );
  }
}
