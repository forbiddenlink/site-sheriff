# SiteSheriff (QA Bot) — MVP Design (2026-02-19)

## Product summary
**One-liner:** Drop a URL → get an agency-grade QA report (SEO, a11y, performance snapshot, broken links, optional copy consistency) with a prioritized fix list and a shareable client-friendly report.

**Target user:** freelancers + small agencies.

**Primary JTBD:** “Tell me what’s wrong with this site, show proof, and tell me what to fix first.”

## MVP decisions (locked)
- **Lane:** Monetizable-first.
- **Auth:** **No-auth MVP** (fastest time-to-value).
- **Report style:** Hybrid: client-friendly grade + checklist by default, with expandable technical details.
- **Crawl depth:** Up to **25 internal pages** (bounded).
- **LLM:** Yes, but only on structured extracts; include a clear toggle for copy analysis.
- **Share links:** Public, read-only.

## UX flow (v1)
1. Landing → URL input → Run scan
2. Running state with progress
3. Report page:
   - Overall score + category scores
   - Top issues (P0/P1/P2), impact + effort, evidence
   - Expandable technical details per issue
   - **Client email draft block** (copy/paste)
4. Share report link (read-only)

## Checks (v1)
### Links
- Crawl internal links (bounded) and flag:
  - 404/410
  - 5xx
  - redirect chains/loops (basic)

### SEO basics
- Title presence + length
- Meta description presence + length
- H1 count
- Canonical presence
- noindex detection (meta robots)

### Accessibility
- axe-core run per page
- Summarize top recurring a11y issues

### Performance snapshot
- Lighthouse on homepage + up to 2 additional pages (representative)

### Content / copy (LLM toggle)
- Use **structured extracts only** (headings, key CTA blocks, short text snippets)
- Output: clarity issues, CTA strength, inconsistencies

## Architecture
### Scanner pipeline (server-side)
- Normalize URL
- Crawl up to 25 internal pages (same hostname, depth cap)
- For each page:
  - load with Playwright (SPA-safe)
  - extract structured SEO fields and links
  - run axe-core
  - take screenshot (configurable: above-the-fold default)
- Run broken-link validation (HEAD/GET) with timeouts + retries
- Run Lighthouse on bounded set
- Generate findings
- Optional LLM summarizer:
  - prioritization (impact/effort)
  - client-friendly explanations
  - client email draft

### Data model
**ScanRun**
- id, createdAt
- status: queued | running | succeeded | failed
- inputUrl, normalizedUrl
- settings (json)
- progress (json)
- summary (json)
- error (nullable)

**PageResult**
- scanRunId, url
- title/meta/h1/canonical/wordCount
- links (json)
- axeFindings (json)
- screenshotPath (nullable)

**Issue**
- scanRunId
- code, severity (P0/P1/P2), category
- title, whyItMatters, howToFix
- evidence (json)

## Non-goals (v1)
- Full Screaming Frog replacement
- Auto-fixing user websites
- Deep authenticated crawling

## Risks / mitigations
- **Runtime cost:** cap pages, cap Lighthouse pages, timeouts.
- **Privacy:** LLM only on structured extracts; explicit toggle.
- **Crawler traps:** strict bounds and URL dedupe.

## Next implementation steps
1. Scaffold Next.js app + UI skeleton (landing, running, report)
2. DB (Prisma + SQLite for dev) + storage paths for screenshots
3. Implement crawl + extraction
4. axe-core integration
5. broken-link validation
6. Lighthouse snapshot
7. issue synthesis + scoring
8. Optional LLM summarizer + email draft
9. Deploy + demo video
