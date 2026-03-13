import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { isNotFoundError } from '@/lib/supabase-errors';

interface RouteContext {
  params: Promise<{ token: string }>;
}

function getScoreColor(score: number): string {
  if (score >= 90) return '#22c55e'; // green-500
  if (score >= 75) return '#84cc16'; // lime-500
  if (score >= 50) return '#eab308'; // yellow-500
  if (score >= 25) return '#f97316'; // orange-500
  return '#ef4444'; // red-500
}

function getGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function generateBadgeSvg(score: number, style: 'flat' | 'flat-square' | 'for-the-badge' = 'flat'): string {
  const color = getScoreColor(score);
  const grade = getGrade(score);
  const labelWidth = 75;
  const valueWidth = 45;
  const totalWidth = labelWidth + valueWidth;
  const height = style === 'for-the-badge' ? 28 : 20;
  const fontSize = style === 'for-the-badge' ? 10 : 11;
  const radius = style === 'flat-square' ? 0 : 3;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}">
  <title>Site Sheriff Score: ${score}/100 (${grade})</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="${height}" rx="${radius}" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="${height}" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="${height}" fill="${color}"/>
    <rect width="${totalWidth}" height="${height}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="${fontSize}">
    <text x="${labelWidth / 2}" y="${height * 0.72}" fill="#010101" fill-opacity=".3">Site Sheriff</text>
    <text x="${labelWidth / 2}" y="${height * 0.68}">Site Sheriff</text>
    <text x="${labelWidth + valueWidth / 2}" y="${height * 0.72}" fill="#010101" fill-opacity=".3">${score}</text>
    <text x="${labelWidth + valueWidth / 2}" y="${height * 0.68}">${score}</text>
  </g>
</svg>`;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const { searchParams } = new URL(request.url);
    const style = (searchParams.get('style') as 'flat' | 'flat-square' | 'for-the-badge') || 'flat';

    // Get scan run by share token
    const { data: scanRun, error: scanError } = await supabaseAdmin
      .from('ScanRun')
      .select('summary')
      .eq('shareToken', token)
      .single();

    if (scanError) {
      if (isNotFoundError(scanError)) {
        // Return a "not found" badge
        return new NextResponse(
          `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="20">
            <rect width="120" height="20" fill="#999"/>
            <text x="60" y="14" fill="#fff" text-anchor="middle" font-family="sans-serif" font-size="11">Not Found</text>
          </svg>`,
          {
            status: 200,
            headers: {
              'Content-Type': 'image/svg+xml',
              'Cache-Control': 'no-cache',
            },
          }
        );
      }
      throw scanError;
    }

    const score = scanRun.summary?.overallScore ?? 0;
    const svg = generateBadgeSvg(score, style);

    return new NextResponse(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch {
    // Return an error badge
    return new NextResponse(
      `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="20">
        <rect width="120" height="20" fill="#e5534b"/>
        <text x="60" y="14" fill="#fff" text-anchor="middle" font-family="sans-serif" font-size="11">Error</text>
      </svg>`,
      {
        status: 200,
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'no-cache',
        },
      }
    );
  }
}
