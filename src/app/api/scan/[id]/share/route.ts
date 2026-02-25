import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { randomBytes } from 'node:crypto';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Check if scan exists
    const { data: scanRun, error: scanError } = await supabaseAdmin
      .from('ScanRun')
      .select('id, shareToken')
      .eq('id', id)
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
      .eq('id', id);

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
