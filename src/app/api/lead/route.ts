import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const LeadRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
  source: z.string().optional().default('scan_gate'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, source } = LeadRequestSchema.parse(body);

    // Check if lead exists
    const { data: existingLead } = await supabaseAdmin
      .from('Lead')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (existingLead) {
      // Existing lead - check if they have scans remaining
      if (existingLead.scansUnlocked <= 0) {
        return NextResponse.json({
          success: false,
          error: 'limit_reached',
          message: 'You have used all your free scans. Upgrade to Pro for unlimited access.',
          lead: {
            email: existingLead.email,
            scansUnlocked: existingLead.scansUnlocked,
            totalScans: existingLead.totalScans,
          },
        });
      }

      return NextResponse.json({
        success: true,
        lead: {
          email: existingLead.email,
          scansUnlocked: existingLead.scansUnlocked,
          totalScans: existingLead.totalScans,
        },
      });
    }

    // Create new lead
    const { data: newLead, error } = await supabaseAdmin
      .from('Lead')
      .insert({
        email: email.toLowerCase(),
        source,
        scansUnlocked: 3,
        totalScans: 0,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.info('New lead captured', { email: email.toLowerCase(), source });

    return NextResponse.json({
      success: true,
      isNew: true,
      lead: {
        email: newLead.email,
        scansUnlocked: newLead.scansUnlocked,
        totalScans: newLead.totalScans,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.issues[0].message }, { status: 400 });
    }
    logger.error('Lead capture failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: 'Failed to process request' }, { status: 500 });
  }
}

// Decrement scan count when a report is viewed
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = z.object({ email: z.string().email() }).parse(body);

    const { data: currentLead } = await supabaseAdmin
      .from('Lead')
      .select('scansUnlocked, totalScans')
      .eq('email', email.toLowerCase())
      .single();

    if (currentLead) {
      await supabaseAdmin
        .from('Lead')
        .update({
          scansUnlocked: Math.max(0, currentLead.scansUnlocked - 1),
          totalScans: currentLead.totalScans + 1,
          lastScanAt: new Date().toISOString(),
        })
        .eq('email', email.toLowerCase());
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to update lead usage', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: 'Failed to update usage' }, { status: 500 });
  }
}
