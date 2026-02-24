import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const scanRun = await prisma.scanRun.findUnique({
      where: { id },
      include: {
        issues: {
          orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
        },
        pageResults: {
          select: {
            id: true,
            url: true,
            statusCode: true,
            loadTimeMs: true,
            title: true,
            metaDescription: true,
            h1: true,
            screenshotPath: true,
          },
        },
      },
    });

    if (!scanRun) {
      return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: scanRun.id,
      status: scanRun.status,
      inputUrl: scanRun.inputUrl,
      normalizedUrl: scanRun.normalizedUrl,
      progress: scanRun.progress,
      summary: scanRun.summary,
      clientEmailDraft: scanRun.clientEmailDraft,
      createdAt: scanRun.createdAt.toISOString(),
      updatedAt: scanRun.updatedAt.toISOString(),
      error: scanRun.error,
      issues: scanRun.issues,
      pages: scanRun.pageResults,
    });
  } catch (error) {
    console.error('Error fetching scan:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scan' },
      { status: 500 }
    );
  }
}
