import { chromium } from 'playwright';

export interface PerfResult {
  url: string;
  metrics: {
    firstContentfulPaint: number | null;
    largestContentfulPaint: number | null;
    interactionToNextPaint: number | null;
    timeToInteractive: number | null;
    totalBlockingTime: number | null;
    cumulativeLayoutShift: number | null;
    domContentLoaded: number | null;
    loadTime: number | null;
    transferSize: number | null;
    resourceCount: number | null;
  };
  score: number; // 0-100
  error?: string;
}

export interface PerfCheckOptions {
  viewport?: { width: number; height: number };
  userAgent?: string;
}

export async function checkPerformance(url: string, options?: PerfCheckOptions): Promise<PerfResult> {
  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const context = await browser.newContext({
      ...(options?.viewport ? { viewport: options.viewport } : {}),
      ...(options?.userAgent ? { userAgent: options.userAgent } : {}),
    });
    const page = await context.newPage();

    // Enable CDP session for performance metrics
    const cdpSession = await context.newCDPSession(page);
    await cdpSession.send('Performance.enable');

    const startTime = Date.now();
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    const loadTime = Date.now() - startTime;

    // Get performance timing via JS
    const perfTiming = await page.evaluate(() => {
      const timing = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const paint = performance.getEntriesByType('paint');
      const fcp = paint.find(e => e.name === 'first-contentful-paint');

      // Get resource info
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const totalTransferSize = resources.reduce((sum, r) => sum + (r.transferSize || 0), 0);

      // CLS via layout-shift entries
      const layoutShifts = performance.getEntriesByType('layout-shift') as (PerformanceEntry & { value?: number })[];
      const cls = layoutShifts.reduce((sum, e) => sum + (e.value || 0), 0);

      return {
        domContentLoaded: timing ? Math.round(timing.domContentLoadedEventEnd - timing.startTime) : null,
        fcp: fcp ? Math.round(fcp.startTime) : null,
        transferSize: Math.round(totalTransferSize),
        resourceCount: resources.length,
        cls: Math.round(cls * 1000) / 1000, // 3 decimal places
      };
    });

    // Get LCP via CDP
    let lcp: number | null = null;
    try {
      // Wait a moment for LCP to settle
      await page.waitForTimeout(1000);
      const lcpEntries = await page.evaluate(() => {
        return new Promise<number | null>((resolve) => {
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const last = entries.at(-1);
            resolve(last ? Math.round(last.startTime) : null);
            observer.disconnect();
          });
          observer.observe({ type: 'largest-contentful-paint', buffered: true });
          // Timeout fallback
          setTimeout(() => resolve(null), 2000);
        });
      });
      lcp = lcpEntries;
    } catch {
      // LCP not available
    }

    // Get INP (Interaction to Next Paint) via PerformanceObserver
    // INP measures responsiveness - the latency of all interactions during page lifecycle
    let inp: number | null = null;
    try {
      inp = await page.evaluate(() => {
        return new Promise<number | null>((resolve) => {
          let maxINP = 0;
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (entry.entryType === 'event') {
                maxINP = Math.max(maxINP, (entry as PerformanceEventTiming).duration);
              }
            }
          });
          try {
            observer.observe({ type: 'event', buffered: true });
          } catch {
            resolve(null);
            return;
          }
          // Sample for 5 seconds to capture interaction events
          setTimeout(() => {
            observer.disconnect();
            resolve(maxINP > 0 ? Math.round(maxINP) : null);
          }, 5000);
        });
      });
    } catch {
      // INP not available
    }

    const metrics = {
      firstContentfulPaint: perfTiming.fcp,
      largestContentfulPaint: lcp,
      interactionToNextPaint: inp,
      timeToInteractive: null, // Would need Lighthouse for true TTI
      totalBlockingTime: null, // Would need Lighthouse
      cumulativeLayoutShift: perfTiming.cls,
      domContentLoaded: perfTiming.domContentLoaded,
      loadTime,
      transferSize: perfTiming.transferSize,
      resourceCount: perfTiming.resourceCount,
    };

    // Simple scoring based on Core Web Vitals thresholds
    // FCP: good under 1.8s, needs work under 3s, poor above 3s
    // LCP: good under 2.5s, needs work under 4s, poor above 4s
    // CLS: good under 0.1, needs work under 0.25, poor above 0.25
    // INP: good under 200ms, needs work under 500ms, poor above 500ms
    let score = 100;

    if (metrics.firstContentfulPaint) {
      if (metrics.firstContentfulPaint > 3000) score -= 30;
      else if (metrics.firstContentfulPaint > 1800) score -= 15;
    }

    if (metrics.largestContentfulPaint) {
      if (metrics.largestContentfulPaint > 4000) score -= 30;
      else if (metrics.largestContentfulPaint > 2500) score -= 15;
    }

    if (metrics.cumulativeLayoutShift !== null) {
      if (metrics.cumulativeLayoutShift > 0.25) score -= 20;
      else if (metrics.cumulativeLayoutShift > 0.1) score -= 10;
    }

    // INP scoring: good <200ms, needs improvement 200-500ms, poor >500ms
    if (metrics.interactionToNextPaint !== null) {
      if (metrics.interactionToNextPaint > 500) score -= 20;
      else if (metrics.interactionToNextPaint > 200) score -= 10;
    }

    if (loadTime > 5000) score -= 20;
    else if (loadTime > 3000) score -= 10;

    score = Math.max(0, score);

    return { url, metrics, score };
  } catch (error) {
    return {
      url,
      metrics: {
        firstContentfulPaint: null,
        largestContentfulPaint: null,
        interactionToNextPaint: null,
        timeToInteractive: null,
        totalBlockingTime: null,
        cumulativeLayoutShift: null,
        domContentLoaded: null,
        loadTime: null,
        transferSize: null,
        resourceCount: null,
      },
      score: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  } finally {
    if (browser) await browser.close();
  }
}
