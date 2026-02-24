export interface RobotsIssue {
  code: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  category: 'SEO';
  title: string;
  whyItMatters: string;
  howToFix: string;
  evidence: {
    url: string;
    expected?: string;
    actual?: string;
    snippet?: string;
  };
  impact: number;
  effort: number;
}

/**
 * Check robots.txt and sitemap.xml for a site
 */
export async function checkRobotsSitemap(baseUrl: string): Promise<RobotsIssue[]> {
  const issues: RobotsIssue[] = [];
  const origin = new URL(baseUrl).origin;

  // ── robots.txt check ──────────────────────────────────────────────────
  let robotsTxtContent = '';
  try {
    const robotsUrl = `${origin}/robots.txt`;
    const response = await fetch(robotsUrl, {
      headers: { 'User-Agent': 'SiteSheriffBot/1.0' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      issues.push({
        code: 'missing_robots_txt',
        severity: 'P2',
        category: 'SEO',
        title: 'Missing robots.txt file',
        whyItMatters:
          'robots.txt tells search engine crawlers which pages they can and cannot access. Without it, crawlers may waste budget on irrelevant pages.',
        howToFix:
          'Create a robots.txt file at the root of your site. Minimum: User-agent: *\\nAllow: /\\nSitemap: https://yoursite.com/sitemap.xml',
        evidence: { url: robotsUrl },
        impact: 3,
        effort: 1,
      });
    } else {
      robotsTxtContent = await response.text();

      // Check if robots.txt blocks all crawlers
      if (
        robotsTxtContent.includes('Disallow: /') &&
        !robotsTxtContent.includes('Allow:')
      ) {
        const lines = robotsTxtContent.split('\n');
        const disallowAll = lines.some(
          (line) => line.trim().toLowerCase() === 'disallow: /'
        );
        const hasAllow = lines.some(
          (line) => line.trim().toLowerCase().startsWith('allow:')
        );

        if (disallowAll && !hasAllow) {
          issues.push({
            code: 'robots_blocks_all',
            severity: 'P0',
            category: 'SEO',
            title: 'robots.txt blocks all crawlers',
            whyItMatters:
              'A blanket Disallow: / prevents search engines from indexing your entire site. No pages will appear in search results.',
            howToFix:
              'If this is production, change "Disallow: /" to "Allow: /" or remove the Disallow line. If pre-launch, this may be intentional.',
            evidence: {
              url: robotsUrl,
              snippet: robotsTxtContent.slice(0, 200),
            },
            impact: 5,
            effort: 1,
          });
        }
      }

      // Check if robots.txt references a sitemap
      if (
        !robotsTxtContent.toLowerCase().includes('sitemap:')
      ) {
        issues.push({
          code: 'robots_no_sitemap_ref',
          severity: 'P3',
          category: 'SEO',
          title: 'robots.txt does not reference a sitemap',
          whyItMatters:
            'Adding a Sitemap directive in robots.txt helps search engines discover your sitemap faster for better crawling.',
          howToFix:
            'Add "Sitemap: https://yoursite.com/sitemap.xml" to the end of your robots.txt file.',
          evidence: { url: robotsUrl },
          impact: 2,
          effort: 1,
        });
      }
    }
  } catch {
    // Network error — skip
  }

  // ── sitemap.xml check ─────────────────────────────────────────────────
  // Try common sitemap locations
  const sitemapUrls = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
  ];

  // Also check robots.txt for sitemap URL
  const sitemapMatch = robotsTxtContent.match(/^Sitemap:\s*(.+)$/im);
  if (sitemapMatch) {
    const sitemapFromRobots = sitemapMatch[1].trim();
    if (!sitemapUrls.includes(sitemapFromRobots)) {
      sitemapUrls.unshift(sitemapFromRobots);
    }
  }

  let sitemapFound = false;
  let sitemapContent = '';

  for (const sitemapUrl of sitemapUrls) {
    try {
      const response = await fetch(sitemapUrl, {
        headers: { 'User-Agent': 'SiteSheriffBot/1.0' },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        sitemapContent = await response.text();
        if (sitemapContent.includes('<urlset') || sitemapContent.includes('<sitemapindex')) {
          sitemapFound = true;
          break;
        }
      }
    } catch {
      // Try next URL
    }
  }

  if (!sitemapFound) {
    issues.push({
      code: 'missing_sitemap',
      severity: 'P2',
      category: 'SEO',
      title: 'Missing XML sitemap',
      whyItMatters:
        'An XML sitemap helps search engines discover and index your pages more efficiently, especially for larger sites or those with complex navigation.',
      howToFix:
        'Generate a sitemap.xml file listing all important pages. Most CMS platforms and frameworks have sitemap generation plugins.',
      evidence: { url: `${origin}/sitemap.xml` },
      impact: 3,
      effort: 2,
    });
  } else {
    // Validate sitemap has URLs
    const urlCount = (sitemapContent.match(/<loc>/g) || []).length;
    if (urlCount === 0) {
      issues.push({
        code: 'empty_sitemap',
        severity: 'P2',
        category: 'SEO',
        title: 'Sitemap exists but contains no URLs',
        whyItMatters: 'An empty sitemap provides no value to search engines.',
        howToFix: 'Populate the sitemap with <url><loc> entries for all indexable pages.',
        evidence: { url: sitemapUrls[0], actual: '0 URLs' },
        impact: 3,
        effort: 2,
      });
    }
  }

  return issues;
}
