import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-server';
import { randomBytes } from 'node:crypto';

// Validate CUID format (Prisma's default ID generator)
const ScanIdSchema = z.string().min(20).max(30).regex(/^[a-z0-9]+$/, 'Invalid scan ID format');

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
      if (scanError.code === 'PGRST116') {
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
    console.error('Error creating share link:', error);
    return NextResponse.json(
      { error: 'Failed to create share link' },
      { status: 500 }
    );
  }
}
