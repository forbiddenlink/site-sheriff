import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-server';

// Validate CUID format (Prisma's default ID generator)
const ScanIdSchema = z.string().min(20).max(30).regex(/^[a-z0-9]+$/, 'Invalid scan ID format');

interface RouteContext {
  params: Promise<{ id: string }>;
}

function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Validate ID format
    const parsed = ScanIdSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid scan ID format' }, { status: 400 });
    }
    const validId = parsed.data;

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';

    if (format !== 'json' && format !== 'csv') {
      return NextResponse.json(
        { error: 'Invalid format. Use "json" or "csv".' },
        { status: 400 }
      );
    }

    // Verify scan exists
    const { error: scanError } = await supabaseAdmin
      .from('ScanRun')
      .select('id, inputUrl')
      .eq('id', validId)
      .single();

    if (scanError) {
      if (scanError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
      }
      throw scanError;
    }

    // Get issues
    const { data: issues } = await supabaseAdmin
      .from('Issue')
      .select('code, severity, category, title, whyItMatters, howToFix, impact, effort')
      .eq('scanRunId', validId)
      .order('severity', { ascending: true })
      .order('createdAt', { ascending: true });

    const issueList = issues ?? [];

    if (format === 'json') {
      const body = JSON.stringify(issueList, null, 2);
      return new NextResponse(body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="site-sheriff-${validId}.json"`,
        },
      });
    }

    // CSV format
    const columns = ['code', 'severity', 'category', 'title', 'whyItMatters', 'howToFix', 'impact', 'effort'] as const;
    const header = columns.join(',');
    const rows = issueList.map((issue) =>
      columns.map((col) => escapeCsvField(issue[col])).join(',')
    );
    const csv = [header, ...rows].join('\r\n');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="site-sheriff-${validId}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting scan:', error);
    return NextResponse.json(
      { error: 'Failed to export scan data' },
      { status: 500 }
    );
  }
}
