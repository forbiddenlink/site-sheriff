import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { CreateScanRequestSchema, ScanSettingsSchema } from '@/lib/types';
import { normalizeUrl } from '@/lib/url-utils';

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
    const scanRun = await prisma.scanRun.create({
      data: {
        inputUrl: url,
        normalizedUrl,
        status: 'QUEUED',
        settings: finalSettings,
        progress: {
          pagesDiscovered: 0,
          pagesScanned: 0,
          checksCompleted: 0,
          stage: 'crawling',
        },
      },
    });

    // TODO: Queue the actual scan job (for now, we'll run it inline in development)
    // In production, this would push to a queue (e.g., Inngest, QStash, or BullMQ)

    return NextResponse.json({
      id: scanRun.id,
      status: scanRun.status,
      inputUrl: scanRun.inputUrl,
      normalizedUrl: scanRun.normalizedUrl,
      progress: scanRun.progress,
      createdAt: scanRun.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('Error creating scan:', error);
    return NextResponse.json(
      { error: 'Failed to create scan' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 50);

    const scans = await prisma.scanRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        inputUrl: true,
        normalizedUrl: true,
        progress: true,
        summary: true,
        createdAt: true,
        error: true,
      },
    });

    return NextResponse.json({ scans });
  } catch (error) {
    console.error('Error listing scans:', error);
    return NextResponse.json(
      { error: 'Failed to list scans' },
      { status: 500 }
    );
  }
}
