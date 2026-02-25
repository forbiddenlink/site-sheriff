import { chromium, Browser } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

export interface A11yViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  description: string;
  help: string;
  helpUrl: string;
  nodes: Array<{
    html: string;
    target: string[];
    failureSummary?: string;
  }>;
}

export interface A11yResult {
  url: string;
  violations: A11yViolation[];
  passes: number;
  incomplete: number;
  error?: string;
}

export interface A11yCheckOptions {
  viewport?: { width: number; height: number };
  userAgent?: string;
}

/**
 * Run accessibility checks on a URL using axe-core
 */
export async function checkAccessibility(
  url: string,
  browserOrOptions?: Browser | A11yCheckOptions,
  options?: A11yCheckOptions
): Promise<A11yResult> {
  // Support both (url, browser) and (url, options) and (url, browser, options)
  let browser: Browser | undefined;
  let opts: A11yCheckOptions = {};
  if (browserOrOptions && 'newPage' in browserOrOptions) {
    browser = browserOrOptions;
    opts = options ?? {};
  } else if (browserOrOptions) {
    opts = browserOrOptions;
  }

  const ownBrowser = !browser;
  browser ??= await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage({
    ...(opts.viewport ? { viewport: opts.viewport } : {}),
    ...(opts.userAgent ? { userAgent: opts.userAgent } : {}),
  });

  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Run axe-core with WCAG 2.2 support (includes Focus Not Obscured, Dragging Movements, Target Size)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();

    const violations: A11yViolation[] = results.violations.map((v) => ({
      id: v.id,
      impact: v.impact ?? null,
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes.map((n) => ({
        html: n.html.slice(0, 200),
        target: n.target as string[],
        failureSummary: n.failureSummary,
      })),
    }));

    return {
      url,
      violations,
      passes: results.passes.length,
      incomplete: results.incomplete.length,
    };
  } catch (error) {
    return {
      url,
      violations: [],
      passes: 0,
      incomplete: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  } finally {
    await page.close();
    if (ownBrowser) {
      await browser.close();
    }
  }
}

/**
 * Map axe impact to our severity levels
 */
export function mapImpactToSeverity(impact: A11yViolation['impact']): 'P0' | 'P1' | 'P2' | 'P3' {
  switch (impact) {
    case 'critical':
      return 'P0';
    case 'serious':
      return 'P1';
    case 'moderate':
      return 'P2';
    case 'minor':
    default:
      return 'P3';
  }
}
