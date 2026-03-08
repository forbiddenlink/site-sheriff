import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-server';
import { isNotFoundError } from '@/lib/supabase-errors';
import { UpdateScheduleRequestSchema, ScanSettingsSchema } from '@/lib/types';
import { isSafeUrl } from '@/lib/url-utils';
import { logger } from '@/lib/logger';
import { calculateNextRunAt } from '@/lib/schedule-utils';

const ScheduleIdSchema = z.string().uuid().or(z.string().min(20).max(30).regex(/^[a-z0-9]+$/));

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const parsed = ScheduleIdSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid schedule ID format' }, { status: 400 });
    }
    const validId = parsed.data;

    // Get schedule
    const { data: schedule, error: scheduleError } = await supabaseAdmin
      .from('ScanSchedule')
      .select('*')
      .eq('id', validId)
      .single();

    if (scheduleError) {
      if (isNotFoundError(scheduleError)) {
        return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
      }
      throw scheduleError;
    }

    // Get recent scan runs for this schedule
    const { data: scanRuns } = await supabaseAdmin
      .from('ScanRun')
      .select('id, status, summary, createdAt, error')
      .eq('scheduleId', validId)
      .order('createdAt', { ascending: false })
      .limit(10);

    return NextResponse.json({
      ...schedule,
      recentRuns: scanRuns ?? [],
    });
  } catch (error) {
    logger.error('Error fetching schedule', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const parsed = ScheduleIdSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid schedule ID format' }, { status: 400 });
    }
    const validId = parsed.data;

    const body = await request.json();
    const parsedBody = UpdateScheduleRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const updates = parsedBody.data;

    // Validate Slack webhook URL if provided
    if (updates.alertSlack && !isSafeUrl(updates.alertSlack)) {
      return NextResponse.json(
        { error: 'Slack webhook URL not allowed: private or internal addresses are blocked' },
        { status: 400 }
      );
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (updates.frequency !== undefined) {
      updateData.frequency = updates.frequency;
      // Recalculate next run time when frequency changes
      updateData.nextRunAt = calculateNextRunAt(updates.frequency).toISOString();
    }
    if (updates.enabled !== undefined) updateData.enabled = updates.enabled;
    if (updates.settings !== undefined) updateData.settings = ScanSettingsSchema.parse(updates.settings);
    if (updates.alertEmail !== undefined) updateData.alertEmail = updates.alertEmail;
    if (updates.alertSlack !== undefined) updateData.alertSlack = updates.alertSlack;
    if (updates.alertOnScoreDrop !== undefined) updateData.alertOnScoreDrop = updates.alertOnScoreDrop;
    if (updates.alertOnNewP0 !== undefined) updateData.alertOnNewP0 = updates.alertOnNewP0;

    const { data: schedule, error: updateError } = await supabaseAdmin
      .from('ScanSchedule')
      .update(updateData)
      .eq('id', validId)
      .select()
      .single();

    if (updateError) {
      if (isNotFoundError(updateError)) {
        return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
      }
      throw updateError;
    }

    return NextResponse.json(schedule);
  } catch (error) {
    logger.error('Error updating schedule', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const parsed = ScheduleIdSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid schedule ID format' }, { status: 400 });
    }
    const validId = parsed.data;

    const { error: deleteError } = await supabaseAdmin
      .from('ScanSchedule')
      .delete()
      .eq('id', validId);

    if (deleteError) {
      if (isNotFoundError(deleteError)) {
        return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
      }
      throw deleteError;
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error('Error deleting schedule', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to delete schedule' }, { status: 500 });
  }
}
