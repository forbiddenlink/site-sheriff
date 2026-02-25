# SiteSheriff 🛡️

**Drop a URL → get an agency-grade QA report in 90 seconds.**

SiteSheriff crawls up to 25 pages and delivers a prioritized, severity-weighted report across 6 categories — with fix instructions, evidence links, and a copy-paste client email.

**Live → [site-sheriff.vercel.app](https://site-sheriff.vercel.app)**

## What It Checks

### SEO (20+ checks)
Title, meta description, H1, canonical URL validation (relative/cross-domain), viewport, Open Graph (`og:title`, `og:image`, `og:description`), Twitter Cards, structured data (JSON-LD), favicon, `lang` attribute, word count / thin content, duplicate titles & descriptions

### Security (9 checks)
Content-Security-Policy, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, `security.txt`, `rel="noopener"` on `target="_blank"` links, mixed content, cookie flags

### Accessibility
WCAG violations via axe-core — per page, mapped to severity levels

### Performance
Core Web Vitals via Playwright CDP, response compression detection (gzip/Brotli)

### Links
Internal links (up to 100) + external links (sample of 20), HTTP status codes, redirect chains

### Content
Thin page detection, duplicate content analysis

## Features

- **Severity-weighted scoring** — P0–P3 with diminishing returns so one repeated issue doesn't tank a score
- **Category scores** — SEO, Security, Accessibility, Performance, Links, Content — weighted into an overall score
- **Expand/collapse all issues** — with fix instructions, effort level, and clickable evidence URLs
- **Category filters + sort** — by severity or category
- **Technology detection** — identifies 25+ frameworks, libraries, and services
- **Summary stats** — pages crawled, total issues, critical/high count, quick wins
- **Client email draft** — copy-paste summary with top issues and report link
- **Page screenshots** — captured during crawl via Playwright
- **Scan history** — browse all past scans with scores and metadata
- **Rate limiting** — in-memory sliding window per IP
- **Background execution** — scans run via `waitUntil` so the API responds immediately

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Database | Supabase (PostgreSQL) |
| Schema | Prisma 5 (generate only) |
| Crawler | Playwright + Cheerio |
| Accessibility | axe-core via `@axe-core/playwright` |
| Validation | Zod 4 |
| Styling | Tailwind CSS 4 |
| Hosting | Vercel |

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

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase pooled connection string |
| `DIRECT_URL` | Supabase direct connection string |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |

## Project Structure

```
src/
├── app/
│   ├── api/scan/             # POST — start scan, GET — list scans
│   │   └── [id]/             # GET — poll scan status + results
│   ├── scan/[id]/            # Report page (live polling → results)
│   ├── scans/                # Scan history page
│   └── page.tsx              # Landing page
├── lib/
│   ├── scanner/
│   │   ├── index.ts          # Pipeline orchestrator + scoring engine
│   │   ├── crawler.ts        # Playwright/fetch crawler
│   │   ├── seo-checker.ts    # 20+ SEO checks + structured data
│   │   ├── security-checker.ts # Header + cookie + mixed content checks
│   │   ├── a11y-checker.ts   # axe-core WCAG analysis
│   │   ├── perf-checker.ts   # Core Web Vitals via CDP
│   │   ├── compression-checker.ts # gzip/Brotli detection
│   │   ├── link-checker.ts   # Broken links + redirect chains
│   │   ├── robots-checker.ts # robots.txt + sitemap validation
│   │   ├── tech-detector.ts  # Technology fingerprinting
│   │   └── email-draft.ts    # Client email generator
│   ├── rate-limit.ts         # Sliding window rate limiter
│   ├── supabase-server.ts    # Supabase admin client
│   ├── types.ts              # Zod schemas + TypeScript types
│   └── url-utils.ts          # URL normalization
prisma/
└── schema.prisma
supabase/
└── migrations/
```

## Scoring

Issues are grouped by code. Base penalty per unique issue type:

| Severity | Base Penalty |
|----------|-------------|
| P0 (Critical) | 20 |
| P1 (High) | 8 |
| P2 (Medium) | 3 |
| P3 (Low) | 1 |

Additional instances of the same issue add logarithmic extra penalty (capped at +3). Raw penalties are converted through a diminishing returns curve so no single category can produce absurd scores. Overall score is a weighted average: SEO 25%, Accessibility 20%, Security 20%, Performance 15%, Links 10%, Content 10%.

## License

Private — all rights reserved.
