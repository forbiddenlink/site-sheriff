import type { CrawlResult } from './crawler';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LinkingIssue {
  code: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  category: 'SEO';
  title: string;
  whyItMatters: string;
  howToFix: string;
  evidence: {
    url: string;
    depth?: number;
    incomingLinks?: number;
    outgoingLinks?: number;
  };
  impact: number;
  effort: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Link graph node
// ─────────────────────────────────────────────────────────────────────────────

interface LinkGraphNode {
  /** Set of normalized URLs that link TO this page. */
  incomingUrls: Set<string>;
  /** Set of normalized internal URLs this page links to. */
  outgoingUrls: Set<string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// URL helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a URL for comparison: lowercase hostname, strip trailing slash,
 * strip fragment (#...), and remove default ports.
 */
function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    // Lowercase the hostname (URL constructor already does this, but be explicit)
    u.hostname = u.hostname.toLowerCase();
    // Strip fragment
    u.hash = '';
    // Build a canonical string
    let normalized = u.origin + u.pathname;
    // Strip trailing slash (but keep root "/")
    if (normalized.endsWith('/') && u.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }
    // Preserve search params if any
    if (u.search) {
      normalized += u.search;
    }
    return normalized;
  } catch {
    return null;
  }
}

/**
 * Return the hostname of a URL, or null if unparseable.
 */
function getHostname(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Link-graph builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seed the graph with one node per crawled page.
 */
function seedGraph(results: CrawlResult[]): Map<string, LinkGraphNode> {
  const graph = new Map<string, LinkGraphNode>();
  for (const result of results) {
    const norm = normalizeUrl(result.url);
    if (norm && !graph.has(norm)) {
      graph.set(norm, { incomingUrls: new Set(), outgoingUrls: new Set() });
    }
  }
  return graph;
}

/**
 * Process a single outgoing link: resolve it and, if it's an internal
 * cross-page link, record the edge in both directions.
 */
function recordEdge(
  link: { href: string },
  sourceNorm: string,
  sourceNode: LinkGraphNode,
  crawledUrls: Set<string>,
  graph: Map<string, LinkGraphNode>,
  baseHostname: string,
): void {
  const linkHost = getHostname(link.href);
  if (!linkHost || linkHost !== baseHostname) return;

  const targetNorm = normalizeUrl(link.href);
  if (!targetNorm || targetNorm === sourceNorm) return;

  sourceNode.outgoingUrls.add(targetNorm);

  if (crawledUrls.has(targetNorm)) {
    graph.get(targetNorm)!.incomingUrls.add(sourceNorm);
  }
}

/**
 * Build an in-memory directed graph of internal links across all crawled pages.
 *
 * Keys are normalized URLs of crawled pages.
 * Each node tracks which other crawled pages link TO it (incoming) and which
 * crawled pages it links OUT to (outgoing).
 */
function buildLinkGraph(
  results: CrawlResult[],
  baseHostname: string,
): Map<string, LinkGraphNode> {
  const graph = seedGraph(results);
  const crawledUrls = new Set(graph.keys());

  for (const result of results) {
    const sourceNorm = normalizeUrl(result.url);
    if (!sourceNorm || !crawledUrls.has(sourceNorm)) continue;
    const sourceNode = graph.get(sourceNorm)!;

    for (const link of result.links) {
      recordEdge(link, sourceNorm, sourceNode, crawledUrls, graph, baseHostname);
    }
  }

  return graph;
}

// ─────────────────────────────────────────────────────────────────────────────
// BFS click-depth calculation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate the minimum click depth from the homepage to every crawled page
 * using breadth-first traversal of internal links.
 *
 * Returns a Map of normalizedUrl → depth (0 = homepage).
 * Pages unreachable via internal links get depth = Infinity.
 */
function computeClickDepths(
  graph: Map<string, LinkGraphNode>,
  homepageUrl: string,
): Map<string, number> {
  const depths = new Map<string, number>();

  // Initialize all crawled pages to Infinity
  for (const url of graph.keys()) {
    depths.set(url, Infinity);
  }

  const homeNorm = normalizeUrl(homepageUrl);
  if (!homeNorm || !graph.has(homeNorm)) return depths;

  // BFS from homepage
  depths.set(homeNorm, 0);
  const queue: string[] = [homeNorm];
  let head = 0;

  while (head < queue.length) {
    const current = queue[head++];
    const currentDepth = depths.get(current)!;
    const node = graph.get(current);
    if (!node) continue;

    for (const outUrl of node.outgoingUrls) {
      if (depths.get(outUrl)! <= currentDepth + 1) continue; // already visited at equal/lesser depth
      depths.set(outUrl, currentDepth + 1);
      queue.push(outUrl);
    }
  }

  return depths;
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual checks
// ─────────────────────────────────────────────────────────────────────────────

/** Check 1: Orphan pages – zero incoming internal links. */
function checkOrphanPages(
  graph: Map<string, LinkGraphNode>,
  homepageUrl: string,
): LinkingIssue[] {
  const issues: LinkingIssue[] = [];
  const homeNorm = normalizeUrl(homepageUrl);

  for (const [url, node] of graph) {
    // Skip the homepage – it's expected to have no internal links pointing to it in many cases
    if (url === homeNorm) continue;

    if (node.incomingUrls.size === 0) {
      issues.push({
        code: 'orphan_page',
        severity: 'P1',
        category: 'SEO',
        title: 'Orphan page (no internal links pointing to it)',
        whyItMatters:
          'Search engines discover pages primarily through internal links. ' +
          'A page with zero incoming internal links may not be indexed or may lose ranking potential.',
        howToFix:
          'Add contextual internal links from related pages to this URL. ' +
          'Consider including it in your navigation, footer, or related-content sections.',
        evidence: { url },
        impact: 4,
        effort: 2,
      });
    }
  }

  return issues;
}

/** Check 2: Deep pages – more than 3 clicks from homepage. */
function checkDeepPages(depths: Map<string, number>): LinkingIssue[] {
  const issues: LinkingIssue[] = [];
  const DEPTH_THRESHOLD = 3;

  for (const [url, depth] of depths) {
    if (depth > DEPTH_THRESHOLD && depth !== Infinity) {
      issues.push({
        code: 'deep_page',
        severity: 'P2',
        category: 'SEO',
        title: 'Page is too deep in site architecture',
        whyItMatters:
          `This page requires ${depth} clicks from the homepage to reach. ` +
          'Pages buried deep in the site hierarchy receive less crawl frequency and link equity from search engines.',
        howToFix:
          'Flatten the site architecture by linking to this page from higher-level pages. ' +
          'Aim for all important pages to be reachable within 3 clicks of the homepage.',
        evidence: { url, depth },
        impact: 3,
        effort: 2,
      });
    }
  }

  return issues;
}

/** Check 3: Low internal links – fewer than 2 incoming links. */
function checkLowInternalLinks(
  graph: Map<string, LinkGraphNode>,
  homepageUrl: string,
): LinkingIssue[] {
  const issues: LinkingIssue[] = [];
  const homeNorm = normalizeUrl(homepageUrl);
  const LOW_LINK_THRESHOLD = 2;

  for (const [url, node] of graph) {
    // Skip homepage
    if (url === homeNorm) continue;

    // Orphan pages are already flagged separately (0 links); this catches 1-link pages
    if (node.incomingUrls.size > 0 && node.incomingUrls.size < LOW_LINK_THRESHOLD) {
      issues.push({
        code: 'low_internal_links',
        severity: 'P2',
        category: 'SEO',
        title: 'Page has very few internal links pointing to it',
        whyItMatters:
          `Only ${node.incomingUrls.size} other page(s) link to this URL. ` +
          'Low internal link count means reduced PageRank flow and lower crawl priority.',
        howToFix:
          'Add internal links from topically related pages. ' +
          'Consider adding this page to category listings, breadcrumbs, or "related content" sections.',
        evidence: { url, incomingLinks: node.incomingUrls.size },
        impact: 3,
        effort: 2,
      });
    }
  }

  return issues;
}

/** Check 4: Excessive outgoing internal links (> 100). */
function checkExcessiveOutgoingLinks(
  graph: Map<string, LinkGraphNode>,
): LinkingIssue[] {
  const issues: LinkingIssue[] = [];
  const OUTGOING_THRESHOLD = 100;

  for (const [url, node] of graph) {
    if (node.outgoingUrls.size > OUTGOING_THRESHOLD) {
      issues.push({
        code: 'excessive_outgoing_links',
        severity: 'P3',
        category: 'SEO',
        title: 'Page has too many outgoing internal links',
        whyItMatters:
          `This page contains ${node.outgoingUrls.size} internal outgoing links. ` +
          'Excessive links dilute the PageRank passed to each linked page and can overwhelm crawlers.',
        howToFix:
          'Reduce the number of on-page links by consolidating navigation, ' +
          'using pagination, or trimming low-value links. Aim for under 100 internal links per page.',
        evidence: { url, outgoingLinks: node.outgoingUrls.size },
        impact: 2,
        effort: 3,
      });
    }
  }

  return issues;
}

/** Check 5: Dead-end pages – no outgoing internal links at all. */
function checkNoOutgoingInternalLinks(
  graph: Map<string, LinkGraphNode>,
): LinkingIssue[] {
  const issues: LinkingIssue[] = [];

  for (const [url, node] of graph) {
    if (node.outgoingUrls.size === 0) {
      issues.push({
        code: 'no_outgoing_internal_links',
        severity: 'P2',
        category: 'SEO',
        title: 'Dead-end page with no outgoing internal links',
        whyItMatters:
          'This page contains zero internal links to other pages on the site. ' +
          'Dead-end pages trap both users and search engine crawlers, reducing overall crawlability.',
        howToFix:
          'Add contextual internal links, breadcrumbs, or a related-content section ' +
          'so visitors and crawlers can continue navigating the site.',
        evidence: { url },
        impact: 3,
        effort: 1,
      });
    }
  }

  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyze the internal linking structure across all crawled pages.
 *
 * Unlike per-page checkers, this function operates on the **entire** set of
 * crawl results to build a site-wide link graph, compute click depths via BFS,
 * and flag structural SEO issues such as orphan pages, deep pages, dead ends,
 * and poor internal link distribution.
 *
 * @param results - Array of CrawlResult objects from the crawler.
 * @param baseUrl - The root URL of the site being scanned (used to identify
 *                  the homepage and determine which links are internal).
 * @returns An array of LinkingIssue objects describing all detected problems.
 */
export function analyzeInternalLinking(
  results: CrawlResult[],
  baseUrl: string,
): LinkingIssue[] {
  if (results.length === 0) return [];

  const baseHostname = getHostname(baseUrl);
  if (!baseHostname) return [];

  // 1. Build directed link graph
  const graph = buildLinkGraph(results, baseHostname);

  // 2. Compute BFS click depth from homepage
  const depths = computeClickDepths(graph, baseUrl);

  // 3. Run all checks
  const issues: LinkingIssue[] = [
    ...checkOrphanPages(graph, baseUrl),
    ...checkDeepPages(depths),
    ...checkLowInternalLinks(graph, baseUrl),
    ...checkExcessiveOutgoingLinks(graph),
    ...checkNoOutgoingInternalLinks(graph),
  ];

  return issues;
}
