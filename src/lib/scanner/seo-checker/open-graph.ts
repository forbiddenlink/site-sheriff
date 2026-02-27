import type { CrawlResult } from '../crawler';
import type { SEOIssue } from './types';

/**
 * Check Open Graph meta tags.
 */
export function checkOpenGraph(result: CrawlResult): SEOIssue[] {
  const issues: SEOIssue[] = [];

  if (!result.ogTags['og:title']) {
    issues.push({
      code: 'missing_og_title',
      severity: 'P2',
      category: 'SEO',
      title: 'Missing og:title meta tag',
      whyItMatters: 'Open Graph title controls how the page appears when shared on social media. Without it, platforms guess the title and often get it wrong.',
      howToFix: 'Add <meta property="og:title" content="Your Page Title"> to the <head>.',
      evidence: { url: result.url },
      impact: 3,
      effort: 1,
    });
  }

  if (!result.ogTags['og:description']) {
    issues.push({
      code: 'missing_og_description',
      severity: 'P3',
      category: 'SEO',
      title: 'Missing og:description meta tag',
      whyItMatters: 'Controls the description shown when shared on Facebook, LinkedIn, etc.',
      howToFix: 'Add <meta property="og:description" content="..."> to the <head>.',
      evidence: { url: result.url },
      impact: 2,
      effort: 1,
    });
  }

  if (!result.ogTags['og:image']) {
    issues.push({
      code: 'missing_og_image',
      severity: 'P2',
      category: 'SEO',
      title: 'Missing og:image meta tag',
      whyItMatters: 'Pages shared on social media without an og:image show a blank preview, dramatically reducing click-through rates.',
      howToFix: 'Add <meta property="og:image" content="https://..."> with an image at least 1200x630px.',
      evidence: { url: result.url },
      impact: 3,
      effort: 2,
    });
  } else if (result.ogTags['og:image'] && !result.ogTags['og:image'].startsWith('http')) {
    issues.push({
      code: 'og_image_relative',
      severity: 'P2',
      category: 'SEO',
      title: 'Open Graph image URL is relative',
      whyItMatters: 'Relative og:image URLs may not be resolved correctly by social media platforms, resulting in missing or broken preview images.',
      howToFix: 'Use an absolute URL for og:image including protocol and domain.',
      evidence: { url: result.url, actual: result.ogTags['og:image'] },
      impact: 3,
      effort: 1,
    });
  }

  return issues;
}

/**
 * Check Twitter Card meta tags.
 */
export function checkTwitterCard(result: CrawlResult): SEOIssue[] {
  const issues: SEOIssue[] = [];

  if (!result.ogTags['twitter:card']) {
    issues.push({
      code: 'missing_twitter_card',
      severity: 'P3',
      category: 'SEO',
      title: 'Missing twitter:card meta tag',
      whyItMatters: 'Without a Twitter Card meta tag, links shared on X/Twitter show minimal previews.',
      howToFix: 'Add <meta name="twitter:card" content="summary_large_image"> to the <head>.',
      evidence: { url: result.url },
      impact: 2,
      effort: 1,
    });
  }

  return issues;
}

/**
 * Validate that og:image and twitter:image URLs actually resolve to valid images.
 * This is a cross-page check that deduplicates image URLs before checking.
 */
export async function validateOgImages(results: CrawlResult[]): Promise<Array<{
  code: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  category: 'SEO';
  title: string;
  whyItMatters: string;
  howToFix: string;
  evidence: object;
  impact: number;
  effort: number;
}>> {
  const issues: Array<{
    code: string;
    severity: 'P0' | 'P1' | 'P2' | 'P3';
    category: 'SEO';
    title: string;
    whyItMatters: string;
    howToFix: string;
    evidence: object;
    impact: number;
    effort: number;
  }> = [];

  // Collect unique image URLs and track which pages reference them
  const imageUrlToPages = new Map<string, string[]>();
  for (const result of results) {
    if (result.error) continue;
    const ogImage = result.ogTags['og:image'];
    const twitterImage = result.ogTags['twitter:image'];
    for (const imgUrl of [ogImage, twitterImage]) {
      if (imgUrl?.startsWith('http')) {
        if (!imageUrlToPages.has(imgUrl)) imageUrlToPages.set(imgUrl, []);
        imageUrlToPages.get(imgUrl)!.push(result.url);
      }
    }
  }

  const uniqueUrls = Array.from(imageUrlToPages.keys());
  const BATCH_SIZE = 5;

  for (let i = 0; i < uniqueUrls.length; i += BATCH_SIZE) {
    const batch = uniqueUrls.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (imgUrl) => {
        const pages = imageUrlToPages.get(imgUrl)!;
        const pageUrl = pages[0];

        let response: Response | null = null;
        let errorMessage: string | null = null;

        // Try HEAD first, fall back to GET
        for (const method of ['HEAD', 'GET'] as const) {
          try {
            response = await fetch(imgUrl, {
              method,
              signal: AbortSignal.timeout(5000),
              headers: { 'User-Agent': 'SiteSheriffBot/1.0' },
              redirect: 'follow',
            });
            break;
          } catch (err) {
            errorMessage = err instanceof Error ? err.message : String(err);
            if (method === 'HEAD') {
              // HEAD failed, try GET
              continue;
            }
          }
        }

        if (!response) {
          // Both HEAD and GET failed
          issues.push({
            code: 'og_image_broken',
            severity: 'P1',
            category: 'SEO',
            title: `Open Graph image returns error`,
            whyItMatters:
              'The og:image URL does not resolve to a valid image. When this page is shared on social media, it will show a broken or missing preview image.',
            howToFix:
              'Fix the image URL or upload the image to the correct location. Verify the URL is accessible publicly (not behind auth).',
            evidence: { url: pageUrl, ogImageUrl: imgUrl, httpStatus: null, error: errorMessage },
            impact: 4,
            effort: 1,
          });
          return;
        }

        if (response.status >= 400) {
          issues.push({
            code: 'og_image_broken',
            severity: 'P1',
            category: 'SEO',
            title: `Open Graph image returns ${response.status}`,
            whyItMatters:
              'The og:image URL does not resolve to a valid image. When this page is shared on social media, it will show a broken or missing preview image.',
            howToFix:
              'Fix the image URL or upload the image to the correct location. Verify the URL is accessible publicly (not behind auth).',
            evidence: { url: pageUrl, ogImageUrl: imgUrl, httpStatus: response.status, error: null },
            impact: 4,
            effort: 1,
          });
          return;
        }

        // Check Content-Type for 200 responses
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.startsWith('image/')) {
          issues.push({
            code: 'og_image_not_image',
            severity: 'P2',
            category: 'SEO',
            title: 'Open Graph image URL is not an image',
            whyItMatters:
              'The og:image URL points to a resource that is not an image file. Social media platforms may not display it correctly.',
            howToFix:
              'Ensure the og:image URL points to an actual image file (JPEG, PNG, WebP).',
            evidence: { url: pageUrl, ogImageUrl: imgUrl, contentType },
            impact: 3,
            effort: 1,
          });
        }
      }),
    );

    // Log any unexpected rejections (shouldn't happen since we catch inside)
    for (const r of batchResults) {
      if (r.status === 'rejected') {
        console.warn('OG image validation batch error:', r.reason);
      }
    }
  }

  return issues;
}
