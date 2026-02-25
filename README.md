# Site Sheriff 🛡️

**Drop a URL → get an agency-grade website QA report in under two minutes.**

Site Sheriff crawls up to 500 pages (10 levels deep) and delivers a prioritized, severity-weighted report covering **100+ static checks** and **80+ dynamic accessibility rules** — with fix instructions, effort estimates, and a copy-paste client email.

**Live → [site-sheriff.vercel.app](https://site-sheriff.vercel.app)**

---

## What It Checks

### SEO — 30 checks
Title tag validation (missing / too short / too long), meta description, H1, canonical URL validation (relative / cross-domain / broken), viewport & responsive meta, Open Graph (`og:title`, `og:image`, `og:description`, broken OG image), Twitter Cards, JSON-LD structured data validation, favicon, `lang` attribute, hreflang (self-reference & language codes), SPA rendering detection, thin content, duplicate titles & descriptions across pages

### Security — 14 checks
Content-Security-Policy, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, `security.txt`, `rel="noopener"` on external links, mixed content, HTTPS redirect validation, cookie flags (`Secure`, `HttpOnly`, `SameSite`)

### Accessibility — 80+ rules
WCAG 2.0/2.1 AA violations via **axe-core** (color contrast, ARIA, keyboard navigation, landmarks, form labels, and more). Desktop + mobile viewport testing. Additional checks: missing `lang` attribute, form inputs without labels, iframes without titles

### Performance — 11 checks
Core Web Vitals (FCP, LCP, CLS) via Playwright CDP — desktop + mobile. Load time, TTFB (Time to First Byte) per page, JavaScript console error detection

### Links — 3 checks
Broken links with smart severity (404 vs soft-fail), redirect chains (2+ hops), internal links to error pages. Validates up to 100 internal + 20 external links per scan with source-page tracking

### Content — 13 checks
Thin/very-thin content, readability scoring (Flesch-Kincaid), alt text coverage, heading hierarchy (skipped levels, multiple H1), keyword stuffing, deprecated HTML tags, form accessibility, iframe titles

### Images — 6 checks
Modern format adoption (WebP/AVIF), lazy loading, oversized images, missing dimensions (CLS), responsive images (`srcset`/`<picture>`), heavy inline SVGs

### Resources — 6 checks
Render-blocking CSS/JS, missing preload/preconnect hints, excessive HTTP requests, missing `font-display: swap`, unminified inline code

### Robots & Sitemap — 8 checks
Missing/blocking `robots.txt`, sitemap presence & validity, sitemap cross-referencing (broken URLs, uncrawled pages, pages missing from sitemap)

### Internal Linking — 5 checks
Orphan pages, deep pages (>3 clicks from homepage), low incoming links, excessive outgoing links, dead-end pages

### Compression
gzip/Brotli/deflate detection on text resources

### Technology Detection — 34 technologies
Identifies frameworks (React, Next.js, Vue, Angular, Svelte, Astro, Gatsby, Nuxt), CMS (WordPress, Drupal, Squarespace, Wix, Webflow, Shopify), CSS frameworks (Tailwind, Bootstrap), analytics (GA, GTM, Plausible, Vercel Analytics, Hotjar), hosting/CDN (Vercel, Netlify, Cloudflare, AWS CloudFront, Nginx, Apache), libraries (jQuery, Font Awesome, Google Fonts, reCAPTCHA, Stripe), and customer support tools (Intercom, Crisp)

---

## Features

- **100+ static checks + 80+ accessibility rules** across 10 categories
- **Severity-weighted scoring** — P0–P3 with diminishing returns so repeated issues don't disproportionately tank a score
- **Category scores** — SEO (25%), Accessibility (20%), Security (20%), Performance (15%), Links (10%), Content (10%)
- **Search, filter & group** — search issues by keyword, filter by severity/category, group by page
- **Expand/collapse all issues** — with fix instructions, effort estimates, and clickable evidence URLs
- **Technology detection** — fingerprints 34 frameworks, libraries, and services
- **Shareable reports** — tokenized public links for sharing with clients
- **CSV export** — download full issue list as a spreadsheet
- **Scan comparison** — side-by-side before/after comparison of two scans
- **Client email draft** — copy-paste summary with top issues and report link
- **Page screenshots** — above-fold captures during crawl
- **Scan history** — browse past scans with scores and metadata
- **Crawl map** — visual site structure from the crawl
- **Configurable limits** — up to 500 pages, 10 levels deep
- **SSRF protection** — blocks private IPs, localhost, cloud metadata endpoints
- **Rate limiting** — Supabase-backed sliding window per IP
- **Graceful timeout** — completes as many checks as possible within the time limit, reports partial results
- **Background execution** — scans run via `waitUntil` so the API responds immediately
- **Retry logic** — automatic retries with backoff on network errors
- **Print-optimized** — clean layout for PDF/print export

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Database | Supabase (PostgreSQL) |
| Schema | Prisma 5 (generate only) |
| Crawler | Playwright + Cheerio |
| Accessibility | axe-core via @axe-core/playwright |
| Validation | Zod 4 |
| Styling | Tailwind CSS 4 |
| Hosting | Vercel (serverless, 10-min max duration) |

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- A [Supabase](https://supabase.com) project

### Setup

```bash
git clone https://github.com/forbiddenlink/site-sheriff.git
cd site-sheriff
pnpm install

cp .env.example .env
# Fill in your Supabase credentials

pnpm prisma generate
pnpm prisma db push
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to start scanning.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase pooled connection string |
| `DIRECT_URL` | Supabase direct connection string |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── scan/              # POST — start scan
│   │   │   └── [id]/          # GET — poll status + results
│   │   │       ├── export/    # GET — CSV export
│   │   │       └── share/     # POST — generate share token
│   │   ├── scans/compare/     # POST — compare two scans
│   │   └── shared/[token]/    # GET — public shared report data
│   ├── scan/[id]/             # Report page (live polling → results)
│   ├── scans/                 # Scan history
│   │   └── compare/           # Side-by-side comparison
│   ├── shared/[token]/        # Public shared report
│   └── page.tsx               # Landing page with scan configurator
├── components/
│   └── scan-results.tsx       # Shared report UI (search, filter, scoring)
├── lib/
│   ├── scanner/
│   │   ├── index.ts           # 17-phase pipeline orchestrator + scoring
│   │   ├── crawler.ts         # Playwright/fetch dual-mode crawler
│   │   ├── seo-checker.ts     # 30 SEO checks + structured data
│   │   ├── security-checker.ts # 14 security header + cookie checks
│   │   ├── a11y-checker.ts    # axe-core WCAG 2.1 AA analysis
│   │   ├── perf-checker.ts    # Core Web Vitals via CDP
│   │   ├── compression-checker.ts
│   │   ├── link-checker.ts    # Broken links + redirect chains
│   │   ├── image-checker.ts   # 6 image optimization checks
│   │   ├── resource-checker.ts # 6 resource loading checks
│   │   ├── linking-analyzer.ts # Internal link graph analysis
│   │   ├── content-checker.ts # 13 content quality checks
│   │   ├── robots-checker.ts  # robots.txt + sitemap validation
│   │   ├── tech-detector.ts   # 34-technology fingerprinting
│   │   └── email-draft.ts     # Client email generator
│   ├── rate-limit.ts          # Supabase-backed rate limiter
│   ├── supabase-server.ts     # Supabase admin client
│   ├── types.ts               # Zod schemas + TypeScript types
│   ├── url-utils.ts           # URL normalization + SSRF protection
│   └── utils.ts               # Shared utilities
├── prisma/
│   └── schema.prisma
└── supabase/
    └── migrations/
```

---

## Scoring

Issues are grouped by code. Base penalty per unique issue type:

| Severity | Base Penalty | Examples |
|----------|-------------|----------|
| P0 (Critical) | 20 | Missing title, robots blocking all |
| P1 (High) | 8 | Missing meta description, broken canonical, slow LCP |
| P2 (Medium) | 3 | Missing canonical, thin content, redirect chains |
| P3 (Low) | 1 | Missing Twitter Card, heading level skip |

Additional instances of the same issue add logarithmic extra penalty (capped at +3). Raw penalties are converted through a diminishing-returns curve so no single category can produce extreme scores.

**Overall score** = weighted average of category scores:

| Category | Weight |
|----------|--------|
| SEO | 25% |
| Accessibility | 20% |
| Security | 20% |
| Performance | 15% |
| Links | 10% |
| Content | 10% |

---

## License

Private — all rights reserved.
