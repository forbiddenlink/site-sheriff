import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { CreateScheduleRequestSchema, ScanSettingsSchema } from '@/lib/types';
import { normalizeUrl, isSafeUrl } from '@/lib/url-utils';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { calculateNextRunAt } from '@/lib/schedule-utils';

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 schedule creations per IP per hour
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    const limit = await rateLimit(`schedule:${ip}`, 5, 60 * 60 * 1000);

    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.', retryAfterMs: limit.resetMs },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.resetMs / 1000)) } }
      );
    }

    const body = await request.json();

    // Validate request
    const parsed = CreateScheduleRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { url, frequency, settings, alertEmail, alertSlack, alertOnScoreDrop, alertOnNewP0 } = parsed.data;

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

    // SSRF protection
    if (!isSafeUrl(normalizedUrl)) {
      return NextResponse.json(
        { error: 'URL not allowed: private or internal addresses are blocked' },
        { status: 400 }
      );
    }

    // Validate Slack webhook URL (block internal IPs)
    if (alertSlack && !isSafeUrl(alertSlack)) {
      return NextResponse.json(
        { error: 'Slack webhook URL not allowed: private or internal addresses are blocked' },
        { status: 400 }
      );
    }

    const finalSettings = ScanSettingsSchema.parse(settings ?? {});
    const nextRunAt = calculateNextRunAt(frequency);

    // Create schedule
    const id = crypto.randomUUID();
    const { data: schedule, error: dbError } = await supabaseAdmin
      .from('ScanSchedule')
      .insert({
        id,
        url: normalizedUrl,
        frequency,
        enabled: true,
        nextRunAt: nextRunAt.toISOString(),
        settings: finalSettings,
        alertEmail: alertEmail ?? null,
        alertSlack: alertSlack ?? null,
        alertOnScoreDrop: alertOnScoreDrop ?? 5,
        alertOnNewP0: alertOnNewP0 ?? true,
        updatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (dbError) throw dbError;

    return NextResponse.json(schedule, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error creating schedule', { error: errorMessage });
    return NextResponse.json(
      { error: 'Failed to create schedule' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number.parseInt(searchParams.get('limit') ?? '20'), 100);
    const enabledOnly = searchParams.get('enabled') === 'true';

    let query = supabaseAdmin
      .from('ScanSchedule')
      .select('*')
      .order('createdAt', { ascending: false })
      .limit(limit);

    if (enabledOnly) {
      query = query.eq('enabled', true);
    }

    const { data: schedules, error: dbError } = await query;

    if (dbError) throw dbError;

    return NextResponse.json({ schedules: schedules ?? [] });
  } catch (error) {
    logger.error('Error listing schedules', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to list schedules' },
      { status: 500 }
    );
  }
}
