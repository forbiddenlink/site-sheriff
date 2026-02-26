import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About Site Sheriff — Free Website QA & Audit Tool',
  description: 'Site Sheriff: free website audits with 160+ checks for SEO, security, accessibility, and performance. Built for freelancers and agencies.',
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 px-4 py-16">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/"
          className="text-slate-500 hover:text-white transition-colors text-xs font-mono uppercase tracking-widest mb-8 inline-block"
        >
          ← Back to Site Sheriff
        </Link>

        <h1 className="text-3xl font-bold mb-8">About Site Sheriff</h1>

        <div className="space-y-6 text-slate-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">What is Site Sheriff?</h2>
            <p>
              Site Sheriff is a free, comprehensive website auditing tool designed for freelancers, agencies, and developers who need quick, actionable insights about their websites. Just drop a URL and get an instant QA report with 160+ checks across 10 categories.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">What We Check</h2>
            <p className="mb-4">
              Our audits cover everything that matters for a modern website:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li><strong>SEO</strong> — Meta tags, headings, structured data, Open Graph, canonical URLs, sitemap validation</li>
              <li><strong>Security</strong> — HTTP headers, CSP, HSTS, mixed content, cookie security, HTTPS redirects</li>
              <li><strong>Accessibility</strong> — WCAG 2.1/2.2 AA compliance via axe-core, color contrast, ARIA attributes</li>
              <li><strong>Performance</strong> — Core Web Vitals (LCP, CLS, FCP), TTFB, resource optimization</li>
              <li><strong>Links</strong> — Broken links, redirect chains, internal link analysis</li>
              <li><strong>Content</strong> — Readability scores, thin content detection, heading hierarchy</li>
              <li><strong>Images</strong> — Alt text, modern formats (WebP/AVIF), lazy loading, sizing</li>
              <li><strong>Resources</strong> — Render-blocking resources, compression, preload hints</li>
              <li><strong>Robots & Sitemap</strong> — robots.txt validation, sitemap cross-referencing</li>
              <li><strong>AI Readiness</strong> — SearchGPT, Perplexity, and Claude compatibility checks</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">Why We Built This</h2>
            <p className="mb-4">
              We believe every website deserves a thorough health check, regardless of budget. Existing tools are either expensive (enterprise pricing) or limited (free tiers with caps). Site Sheriff provides agency-grade audits completely free, with no signup required.
            </p>
            <p>
              Whether you&apos;re a solo developer launching a side project, a freelancer reviewing client sites, or an agency managing dozens of properties, Site Sheriff gives you the insights you need to ship with confidence.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">Technology</h2>
            <p>
              Site Sheriff is built with modern web technologies: Next.js, React, TypeScript, Playwright for browser automation, and axe-core for accessibility testing. We use Supabase for data storage and deploy on Vercel for fast, reliable performance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">Open Source</h2>
            <p>
              Site Sheriff is open source and available on{' '}
              <a
                href="https://github.com/forbiddenlink/site-sheriff"
                className="text-emerald-400 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
              . Contributions, bug reports, and feature requests are welcome!
            </p>
          </section>
        </div>

        <footer className="mt-16 pt-8 border-t border-slate-800 flex flex-col items-center gap-3">
          <div className="flex items-center gap-4 flex-wrap justify-center text-sm">
            <Link
              href="/"
              className="text-slate-500 hover:text-emerald-400 transition-colors"
            >
              Home
            </Link>
            <span className="text-slate-700">·</span>
            <Link
              href="/scans"
              className="text-slate-500 hover:text-emerald-400 transition-colors"
            >
              Scans
            </Link>
            <span className="text-slate-700">·</span>
            <Link
              href="/contact"
              className="text-slate-500 hover:text-emerald-400 transition-colors"
            >
              Contact
            </Link>
            <span className="text-slate-700">·</span>
            <Link
              href="/privacy"
              className="text-slate-500 hover:text-emerald-400 transition-colors"
            >
              Privacy
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
