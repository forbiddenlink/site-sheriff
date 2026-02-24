# SiteSheriff 🛡️

**Drop a URL → get an agency-grade QA report in 90 seconds.**

SiteSheriff crawls up to 25 pages and delivers a prioritized report covering SEO, accessibility, broken links, performance, and content — with client-friendly explanations and a copy-paste email draft.

## Features

- **SEO Audit** — Title, meta description, H1, canonical, robots directives, word count
- **Accessibility** — axe-core analysis surfacing WCAG violations per page
- **Broken Links** — Internal + external link validation with HTTP status codes
- **Performance Snapshot** — Lighthouse scores on key pages
- **Content Analysis** *(optional)* — LLM-powered clarity, CTA, and consistency checks
- **Client Email Draft** — Copy-paste summary ready to send
- **Shareable Reports** — Public read-only link for each scan

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | Supabase (PostgreSQL) + Prisma ORM |
| Crawler | Playwright + Cheerio |
| Accessibility | axe-core via `@axe-core/playwright` |
| Validation | Zod |
| Styling | Tailwind CSS 4 |
| Hosting | Vercel |

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- A [Supabase](https://supabase.com) project

### Setup

```bash
# Clone the repo
git clone https://github.com/forbiddenlink/site-sheriff.git
cd site-sheriff

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Fill in your Supabase credentials in .env

# Generate Prisma client
pnpm prisma generate

# Push schema to database
pnpm prisma db push

# Start dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to start scanning.

## Environment Variables

See [`.env.example`](.env.example) for required variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase connection string (pooled) |
| `DIRECT_URL` | Supabase direct connection string |

## Project Structure

```
src/
├── app/
│   ├── api/scan/        # POST /api/scan — start a scan
│   │   └── [id]/        # GET  /api/scan/:id — poll scan status
│   ├── scan/[id]/       # Report page
│   └── page.tsx         # Landing / URL input
├── lib/
│   ├── scanner/         # Crawl + analysis pipeline
│   │   ├── crawler.ts   # Playwright-based page crawler
│   │   ├── seo-checker.ts
│   │   ├── a11y-checker.ts
│   │   ├── link-checker.ts
│   │   └── index.ts     # Pipeline orchestrator
│   ├── db.ts            # Prisma client
│   ├── types.ts         # Shared types
│   └── url-utils.ts     # URL normalization
prisma/
└── schema.prisma        # Data model
supabase/
└── migrations/          # SQL migrations (RLS, etc.)
```

## License

Private — all rights reserved.
