import type { CrawlResult } from './crawler';

export interface TechDetection {
  name: string;
  category: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string;
}

interface TechPattern {
  name: string;
  category: string;
  // Check patterns: header values, HTML snippets, meta tags, script sources
  headerPatterns?: Array<{ header: string; pattern: RegExp }>;
  htmlPatterns?: RegExp[];
  metaPatterns?: Array<{ name: string; pattern?: RegExp }>;
  scriptPatterns?: RegExp[];
}

const TECH_PATTERNS: TechPattern[] = [
  // ── Frameworks ─────────────────────────────────────────────────────
  {
    name: 'React',
    category: 'JavaScript Framework',
    htmlPatterns: [/data-reactroot/i, /data-reactid/i, /__NEXT_DATA__/],
    scriptPatterns: [/react\.production\.min\.js/, /react-dom/],
  },
  {
    name: 'Next.js',
    category: 'JavaScript Framework',
    htmlPatterns: [/__NEXT_DATA__/, /_next\/static/],
    headerPatterns: [{ header: 'x-powered-by', pattern: /Next\.js/i }],
  },
  {
    name: 'Nuxt.js',
    category: 'JavaScript Framework',
    htmlPatterns: [/__NUXT__/, /_nuxt\//],
  },
  {
    name: 'Vue.js',
    category: 'JavaScript Framework',
    htmlPatterns: [/data-v-[a-f0-9]/i, /vue\.runtime/],
    scriptPatterns: [/vue\.min\.js/, /vue\.global/],
  },
  {
    name: 'Angular',
    category: 'JavaScript Framework',
    htmlPatterns: [/ng-version/, /ng-app/, /\[ngClass\]/, /\(click\)/],
    scriptPatterns: [/angular\.min\.js/, /@angular\/core/],
  },
  {
    name: 'Svelte',
    category: 'JavaScript Framework',
    htmlPatterns: [/svelte-[a-z0-9]/i, /__sveltekit/],
  },
  {
    name: 'Gatsby',
    category: 'JavaScript Framework',
    htmlPatterns: [/___gatsby/, /gatsby-image/],
  },
  {
    name: 'Astro',
    category: 'JavaScript Framework',
    htmlPatterns: [/astro-island/, /astro-slot/],
    headerPatterns: [{ header: 'x-astro', pattern: /./ }],
  },

  // ── CMS ────────────────────────────────────────────────────────────
  {
    name: 'WordPress',
    category: 'CMS',
    htmlPatterns: [/wp-content\//, /wp-includes\//, /wp-json\//],
    metaPatterns: [{ name: 'generator', pattern: /WordPress/i }],
  },
  {
    name: 'Drupal',
    category: 'CMS',
    htmlPatterns: [/sites\/default\/files/, /drupal\.js/],
    headerPatterns: [{ header: 'x-drupal-cache', pattern: /./ }],
    metaPatterns: [{ name: 'generator', pattern: /Drupal/i }],
  },
  {
    name: 'Shopify',
    category: 'E-commerce',
    htmlPatterns: [/cdn\.shopify\.com/, /Shopify\.theme/],
    headerPatterns: [{ header: 'x-shopid', pattern: /./ }],
  },
  {
    name: 'Squarespace',
    category: 'CMS',
    htmlPatterns: [/squarespace\.com/, /sqsp/],
  },
  {
    name: 'Wix',
    category: 'CMS',
    htmlPatterns: [/wix\.com/, /wixsite\.com/, /_wix_browser_sess/],
  },
  {
    name: 'Webflow',
    category: 'CMS',
    htmlPatterns: [/webflow\.com/, /w-webflow/],
    metaPatterns: [{ name: 'generator', pattern: /Webflow/i }],
  },

  // ── CSS Frameworks ─────────────────────────────────────────────────
  {
    name: 'Tailwind CSS',
    category: 'CSS Framework',
    htmlPatterns: [/class="[^"]*(?:flex|grid|bg-|text-|p-|m-|w-|h-)[^"]*"/],
  },
  {
    name: 'Bootstrap',
    category: 'CSS Framework',
    htmlPatterns: [/class="[^"]*(?:container|row|col-|btn |navbar)[^"]*"/, /bootstrap\.min/],
    scriptPatterns: [/bootstrap\.min\.js/, /bootstrap\.bundle/],
  },

  // ── Analytics ──────────────────────────────────────────────────────
  {
    name: 'Google Analytics',
    category: 'Analytics',
    htmlPatterns: [/google-analytics\.com/, /gtag\/js/, /GoogleAnalyticsObject/, /ga\.js/],
    scriptPatterns: [/googletagmanager\.com\/gtag/, /google-analytics\.com\/analytics/],
  },
  {
    name: 'Google Tag Manager',
    category: 'Analytics',
    htmlPatterns: [/googletagmanager\.com\/gtm/, /GTM-[A-Z0-9]+/],
  },
  {
    name: 'Plausible',
    category: 'Analytics',
    scriptPatterns: [/plausible\.io\/js/],
  },
  {
    name: 'Vercel Analytics',
    category: 'Analytics',
    scriptPatterns: [/vercel-analytics/, /va\.vercel-scripts\.com/],
    htmlPatterns: [/vercel-insights/],
  },
  {
    name: 'Hotjar',
    category: 'Analytics',
    htmlPatterns: [/hotjar\.com/, /hj\('identify'\)/],
    scriptPatterns: [/static\.hotjar\.com/],
  },

  // ── Hosting / CDN ──────────────────────────────────────────────────
  {
    name: 'Vercel',
    category: 'Hosting',
    headerPatterns: [
      { header: 'x-vercel-id', pattern: /./ },
      { header: 'server', pattern: /Vercel/i },
    ],
  },
  {
    name: 'Netlify',
    category: 'Hosting',
    headerPatterns: [{ header: 'server', pattern: /Netlify/i }],
  },
  {
    name: 'Cloudflare',
    category: 'CDN',
    headerPatterns: [
      { header: 'server', pattern: /cloudflare/i },
      { header: 'cf-ray', pattern: /./ },
    ],
  },
  {
    name: 'AWS CloudFront',
    category: 'CDN',
    headerPatterns: [
      { header: 'x-amz-cf-id', pattern: /./ },
      { header: 'server', pattern: /CloudFront/i },
    ],
  },
  {
    name: 'Nginx',
    category: 'Web Server',
    headerPatterns: [{ header: 'server', pattern: /nginx/i }],
  },
  {
    name: 'Apache',
    category: 'Web Server',
    headerPatterns: [{ header: 'server', pattern: /Apache/i }],
  },

  // ── Other tools ────────────────────────────────────────────────────
  {
    name: 'jQuery',
    category: 'JavaScript Library',
    scriptPatterns: [/jquery\.min\.js/, /jquery-[0-9]/],
    htmlPatterns: [/jQuery/],
  },
  {
    name: 'Font Awesome',
    category: 'Icon Library',
    htmlPatterns: [/font-awesome/, /fontawesome/],
    scriptPatterns: [/fontawesome/],
  },
  {
    name: 'Google Fonts',
    category: 'Font Service',
    htmlPatterns: [/fonts\.googleapis\.com/, /fonts\.gstatic\.com/],
  },
  {
    name: 'reCAPTCHA',
    category: 'Security',
    htmlPatterns: [/recaptcha/, /google\.com\/recaptcha/],
    scriptPatterns: [/recaptcha/],
  },
  {
    name: 'Stripe',
    category: 'Payment',
    scriptPatterns: [/js\.stripe\.com/],
    htmlPatterns: [/stripe/],
  },
  {
    name: 'Intercom',
    category: 'Customer Support',
    htmlPatterns: [/intercom/],
    scriptPatterns: [/widget\.intercom\.io/],
  },
  {
    name: 'Crisp',
    category: 'Customer Support',
    scriptPatterns: [/client\.crisp\.chat/],
  },
];

/**
 * Detect technologies used on the page from HTML content and response headers
 */
export function detectTechnologies(result: CrawlResult): TechDetection[] {
  const detections: TechDetection[] = [];
  const found = new Set<string>();

  for (const tech of TECH_PATTERNS) {
    let detected = false;
    let evidence = '';

    // Check header patterns
    if (tech.headerPatterns) {
      for (const hp of tech.headerPatterns) {
        const headerValue = result.responseHeaders[hp.header];
        if (headerValue && hp.pattern.test(headerValue)) {
          detected = true;
          evidence = `Header: ${hp.header}: ${headerValue}`;
          break;
        }
      }
    }

    // Check HTML patterns
    if (!detected && tech.htmlPatterns) {
      for (const pattern of tech.htmlPatterns) {
        if (pattern.test(result.html)) {
          detected = true;
          evidence = `HTML pattern: ${pattern.source.slice(0, 50)}`;
          break;
        }
      }
    }

    // Check meta tag patterns
    if (!detected && tech.metaPatterns) {
      for (const mp of tech.metaPatterns) {
        // Look for meta generator or other named meta tags
        const metaRegex = new RegExp(
          `<meta[^>]*name=["']${mp.name}["'][^>]*content=["']([^"']+)["']`,
          'i'
        );
        const match = result.html.match(metaRegex);
        if (match) {
          if (!mp.pattern || mp.pattern.test(match[1])) {
            detected = true;
            evidence = `Meta ${mp.name}: ${match[1]}`;
            break;
          }
        }
      }
    }

    // Check script patterns
    if (!detected && tech.scriptPatterns) {
      for (const pattern of tech.scriptPatterns) {
        if (pattern.test(result.html)) {
          detected = true;
          evidence = `Script: ${pattern.source.slice(0, 50)}`;
          break;
        }
      }
    }

    if (detected && !found.has(tech.name)) {
      found.add(tech.name);
      detections.push({
        name: tech.name,
        category: tech.category,
        confidence: tech.headerPatterns ? 'high' : 'medium',
        evidence,
      });
    }
  }

  return detections;
}
