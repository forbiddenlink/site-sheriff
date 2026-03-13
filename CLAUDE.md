# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Site Sheriff is a website QA tool that crawls URLs (up to 500 pages, 10 levels deep) and generates comprehensive reports covering SEO, accessibility, security, performance, and content quality. It runs 100+ static checks and 80+ accessibility rules via axe-core.

**Live:** site-sheriff.vercel.app

## Commands

```bash
# Development
pnpm dev              # Start Next.js dev server (Turbopack)
pnpm build            # Generate Prisma client + build Next.js
pnpm lint             # ESLint

# Testing
pnpm test             # Vitest in watch mode
pnpm test:run         # Vitest single run
pnpm test -- src/lib/scanner/content-checker.test.ts  # Run single test file

# E2E
pnpm test:e2e         # Playwright tests (auto-starts dev server)
pnpm test:e2e:ui      # Playwright UI mode

# Database
pnpm prisma generate  # Regenerate Prisma client after schema changes
pnpm prisma db push   # Push schema changes to database
```

## Architecture

### Scan Pipeline

The scanner (`src/lib/scanner/index.ts`) orchestrates a 20-phase pipeline with deadline awareness (9-min max for Vercel):

1. **Crawl** - Playwright/fetch dual-mode crawler with screenshot capture
2. **SEO** - Meta tags, canonicals, hreflang, Open Graph, structured data
3. **Content** - Readability, word count, heading hierarchy, keyword stuffing
4. **E-E-A-T** - Author info, FAQ detection, trust signals
5. **AI Readiness** - llms.txt, AI crawler access, schema completeness
6. **Images** - Modern formats, lazy loading, dimensions, srcset
7. **Resources** - Render-blocking, preload hints, minification
8. **Security** - Headers (CSP, HSTS), cookie flags, mixed content
9. **Robots/Sitemap** - Validation and cross-referencing
10. **Tech Detection** - 34 frameworks/libraries fingerprinted
11. **Internal Linking** - Orphan pages, deep pages, dead ends
12. **Compression** - gzip/Brotli detection
13. **Broken Links** - 404s, redirect chains
14. **Accessibility** - axe-core WCAG 2.1 AA (desktop + mobile)
15. **Performance** - Core Web Vitals via CDP

Each phase can be skipped when approaching deadline; partial results are saved.

### Scoring System

Issues use severity P0-P3 with logarithmic penalty scaling. Category weights:
- SEO: 25%, Accessibility: 20%, Security: 20%, Performance: 15%, Links: 10%, Content: 10%

Core scoring logic in `src/lib/scanner/core/scoring.ts`.

### Key Files

| Path | Purpose |
|------|---------|
| `src/lib/scanner/index.ts` | Pipeline orchestrator |
| `src/lib/scanner/crawler.ts` | Playwright/fetch crawler with SSRF protection |
| `src/lib/scanner/core/` | Scoring, utils, types shared across checkers |
| `src/lib/scanner/seo-checker/` | Modular SEO checks (canonical, hreflang, OG, etc.) |
| `src/lib/types.ts` | Zod schemas for ScanSettings, Issue, etc. |
| `src/app/api/scan/route.ts` | POST to start scan |
| `src/app/api/scan/[id]/route.ts` | GET to poll status/results |
| `src/app/api/cron/route.ts` | Scheduled scan execution |
| `src/components/scan-results.tsx` | Report UI with filtering/grouping |
| `prisma/schema.prisma` | ScanRun, PageResult, Issue, ScanSchedule models |

### Checker Pattern

Each checker follows this pattern:
```typescript
export async function checkSomething(
  pages: CrawlResult[],    // Crawled page data
  normalizedUrl: string    // Base URL
): Promise<ScanIssue[]>
```

Issues returned use the `ScanIssue` type from `src/lib/scanner/core/types.ts`.

### API Flow

1. `POST /api/scan` - Creates ScanRun row (QUEUED), kicks off scan via `waitUntil`
2. Scan runs in background, updates status → RUNNING → SUCCEEDED/FAILED
3. `GET /api/scan/[id]` - Poll for status, returns results when done
4. `POST /api/scan/[id]/share` - Generate shareable token
5. `GET /api/shared/[token]` - Public report access

### Environment Setup

Copy `.env.example` to `.env`. Required:
- `DATABASE_URL` / `DIRECT_URL` - Supabase pooled/direct connections
- `OPENAI_API_KEY` - For AI email drafts (optional, has template fallback)
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL` - For scheduled scan alerts

## Testing Strategy

- **Unit tests** (`*.test.ts` next to source): Test individual checkers with mocked data
- **E2E tests** (`e2e/`): Playwright tests against running dev server

Example test pattern from `content-checker.test.ts`:
```typescript
describe('checkContentQuality', () => {
  it('detects thin content', async () => {
    const pages = [{ url: '...', html: '...', wordCount: 50 }];
    const issues = await checkContentQuality(pages, 'https://example.com');
    expect(issues.some(i => i.code === 'thin-content')).toBe(true);
  });
});
```
