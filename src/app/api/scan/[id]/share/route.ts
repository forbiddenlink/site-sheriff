import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-server';
import { isNotFoundError } from '@/lib/supabase-errors';
import { logger } from '@/lib/logger';
import { randomBytes } from 'node:crypto';

// Validate UUID or CUID format
const ScanIdSchema = z.string().uuid().or(z.string().min(20).max(30).regex(/^[a-z0-9]+$/));

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Validate ID format
    const parsed = ScanIdSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid scan ID format' }, { status: 400 });
    }
    const validId = parsed.data;

    // Check if scan exists
    const { data: scanRun, error: scanError } = await supabaseAdmin
      .from('ScanRun')
      .select('id, shareToken')
      .eq('id', validId)
      .single();

    if (scanError) {
      if (isNotFoundError(scanError)) {
        return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
      }
      throw scanError;
    }

    // If already has a share token, return it
    if (scanRun.shareToken) {
      return NextResponse.json({ shareToken: scanRun.shareToken });
    }

    // Generate a new share token
    const shareToken = randomBytes(16).toString('hex');

    const { error: updateError } = await supabaseAdmin
      .from('ScanRun')
      .update({ shareToken })
      .eq('id', validId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ shareToken });
  } catch (error) {
    logger.error('Error creating share link', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to create share link' },
      { status: 500 }
    );
  }
}
