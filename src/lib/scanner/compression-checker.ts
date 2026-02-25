export interface CompressionIssue {
  code: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  category: 'PERFORMANCE';
  title: string;
  whyItMatters: string;
  howToFix: string;
  evidence: {
    url: string;
    contentEncoding?: string;
    contentType?: string;
  };
  impact: number;
  effort: number;
}

/** Content types that should be compressed */
const TEXT_CONTENT_TYPES = [
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'application/json',
  'application/xml',
  'text/xml',
  'image/svg+xml',
  'text/plain',
];

function isTextContentType(contentType: string): boolean {
  const lower = contentType.toLowerCase();
  return TEXT_CONTENT_TYPES.some((t) => lower.includes(t));
}

/**
 * Check whether the server uses response compression (gzip, Brotli, deflate).
 */
export async function checkCompression(url: string): Promise<CompressionIssue[]> {
  const issues: CompressionIssue[] = [];

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept-Encoding': 'gzip, br, deflate',
      'User-Agent': 'SiteSheriff/1.0',
    },
    redirect: 'follow',
  });

  const contentType = response.headers.get('content-type') || '';
  const contentEncoding = response.headers.get('content-encoding') || '';

  // Only flag text-based responses — binary content (images, video) is already compressed
  if (!isTextContentType(contentType)) {
    return issues;
  }

  const hasCompression =
    contentEncoding.includes('gzip') ||
    contentEncoding.includes('br') ||
    contentEncoding.includes('deflate');

  if (!hasCompression) {
    issues.push({
      code: 'no_compression',
      severity: 'P2',
      category: 'PERFORMANCE',
      title: 'No response compression detected',
      whyItMatters:
        'Compression (gzip/Brotli) typically reduces transfer size by 60-80%. Without compression, pages load significantly slower.',
      howToFix:
        'Enable gzip or Brotli compression on your web server. Most modern servers and CDNs support this with a simple configuration change.',
      evidence: {
        url,
        contentEncoding: contentEncoding || 'none',
        contentType,
      },
      impact: 4,
      effort: 1,
    });
  }

  return issues;
}
