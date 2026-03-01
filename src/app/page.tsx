'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { timeAgo } from '@/lib/utils';

// ── Types for recent scans ──────────────────────────────────────────────────
interface RecentScan {
  id: string;
  status: string;
  inputUrl: string;
  normalizedUrl: string;
  summary?: { overallScore: number } | null;
  createdAt: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function truncateUrl(url: string, max = 40): string {
  const cleaned = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return cleaned.length > max ? cleaned.slice(0, max) + '…' : cleaned;
}

const screenshotModeLabels: Record<'none' | 'above-fold' | 'full-page', string> = {
  'none': 'Off',
  'above-fold': 'Viewport',
  'full-page': 'Full Page',
};

// ── Feature data ────────────────────────────────────────────────────────────
const features = [
  {
    icon: (
      <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
    label: 'Broken Links',
    desc: 'Crawl internal & external links',
    accent: 'group-hover:shadow-emerald-500/20',
  },
  {
    icon: (
      <svg className="w-7 h-7 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    label: 'SEO',
    desc: 'Meta tags, OG, headings, sitemap',
    accent: 'group-hover:shadow-cyan-500/20',
  },
  {
    icon: (
      <svg className="w-7 h-7 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
    label: 'Accessibility',
    desc: 'WCAG compliance checks',
    accent: 'group-hover:shadow-purple-500/20',
  },
  {
    icon: (
      <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    label: 'Performance',
    desc: 'Speed & resource analysis',
    accent: 'group-hover:shadow-amber-500/20',
  },
  {
    icon: (
      <svg className="w-7 h-7 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    label: 'Security',
    desc: 'Headers, cookies, mixed content',
    accent: 'group-hover:shadow-rose-500/20',
  },
  {
    icon: (
      <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    label: 'Content',
    desc: 'Alt text, duplicates, thin pages',
    accent: 'group-hover:shadow-blue-500/20',
  },
  {
    icon: (
      <svg className="w-7 h-7 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21zM8.25 8.625a1.125 1.125 0 100-2.25 1.125 1.125 0 000 2.25z" />
      </svg>
    ),
    label: 'Images',
    desc: 'Alt text, sizing, formats',
    accent: 'group-hover:shadow-orange-500/20',
  },
  {
    icon: (
      <svg className="w-7 h-7 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
      </svg>
    ),
    label: 'Resources',
    desc: 'Scripts, bundles, blocking',
    accent: 'group-hover:shadow-teal-500/20',
  },
  {
    icon: (
      <svg className="w-7 h-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 6.75V15m6-6v8.25m.503-8.914l-2.253 1.69m0 0l-2.253-1.69M12.75 9.826l2.253 1.69M12.75 9.826V6.75m-2.253 4.766L8.244 9.826M10.497 11.516V15m0-3.484l2.253 1.69" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12.75 3v3.75m0 0h3.75m-3.75 0H9M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    label: 'Robots & Sitemap',
    desc: 'Robots.txt, XML sitemap',
    accent: 'group-hover:shadow-indigo-500/20',
  },
  {
    icon: (
      <svg className="w-7 h-7 text-lime-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
      </svg>
    ),
    label: 'Internal Linking',
    desc: 'Orphans, depth, structure',
    accent: 'group-hover:shadow-lime-500/20',
  },
];

// ── How-It-Works data ───────────────────────────────────────────────────────
const steps = [
  {
    num: '01',
    title: 'Drop your URL',
    desc: 'Paste any website URL — no signup required.',
    icon: (
      <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
  },
  {
    num: '02',
    title: 'Scans everything',
    desc: '160+ checks across 10 categories, page by page.',
    icon: (
      <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    num: '03',
    title: 'Get your report',
    desc: 'Prioritized fixes with evidence and scores.',
    icon: (
      <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [maxPages, setMaxPages] = useState(50);
  const [crawlAllPages, setCrawlAllPages] = useState(false);
  const [maxDepth, setMaxDepth] = useState(5);
  const [screenshotMode, setScreenshotMode] = useState<'none' | 'above-fold' | 'full-page'>('above-fold');
  const [includePerformance, setIncludePerformance] = useState(true);

  // Recent scans
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [scansLoaded, setScansLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/scan?limit=5')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to fetch'))))
      .then((data: { scans: RecentScan[] }) => {
        setRecentScans(data.scans ?? []);
        setScansLoaded(true);
      })
      .catch(() => setScansLoaded(true));
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          settings: { maxPages: crawlAllPages ? 2000 : maxPages, maxDepth, screenshotMode, includePerformance },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start scan');
      }

      // Redirect to the scan status page
      router.push(`/scan/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#030712] flex flex-col items-center p-8 overflow-hidden relative">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-200 h-200 bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none" />

      {/* ── Hero Section ────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-12 w-full max-w-6xl mt-16 mb-20">
        {/* Hero Text */}
        <div className="max-w-xl w-full text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/2 border border-white/6 text-emerald-400 text-sm font-medium mb-8 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            Free diagnostic audit
          </div>
          <h1 className="text-5xl lg:text-7xl font-semibold text-white mb-6 tracking-tight leading-[1.1]">
            Get your site&apos;s{' '}
            <span className="block text-transparent bg-clip-text bg-[linear-gradient(to_bottom,var(--color-emerald-400),var(--color-cyan-500))]">
              QA report
            </span>
            {' '}in 90 seconds
          </h1>
          <p className="text-lg text-slate-400 mb-10 max-w-lg mx-auto lg:mx-0 leading-relaxed font-normal">
            160+ checks across SEO, security, accessibility, performance, links,
            content, images, and more — prioritized, evidence-backed, and explained.
          </p>

          {/* URL Input Form */}
          <form onSubmit={handleSubmit} className="w-full">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <label htmlFor="scan-url" className="sr-only">Website URL to scan</label>
                <input
                  id="scan-url"
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-5 py-4 rounded-xl bg-white/2 border border-white/6 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 backdrop-blur-xl transition-all font-mono text-sm"
                  disabled={isLoading}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || !url.trim()}
                className="px-8 py-4 rounded-xl flex items-center justify-center bg-[linear-gradient(to_bottom,var(--color-emerald-500),var(--color-emerald-600))] text-white font-medium hover:bg-[linear-gradient(to_bottom,var(--color-emerald-400),var(--color-emerald-500))] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 active:scale-95 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Starting...
                  </span>
                ) : (
                  'Run Scan'
                )}
              </button>
            </div>

            {error && (
              <p className="mt-4 text-red-400 text-sm">{error}</p>
            )}

            {/* Advanced Settings Toggle */}
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className="mt-4 flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform ${showSettings ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Scan Settings
            </button>

            {showSettings && (
              <div className="mt-3 p-5 rounded-xl bg-white/2 border border-white/6 backdrop-blur-md space-y-5 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Max Pages */}
                  <div>
                    <label htmlFor="maxPages" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Max Pages
                    </label>
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={crawlAllPages}
                        onClick={() => setCrawlAllPages(!crawlAllPages)}
                        className={`relative w-9 h-5 rounded-full transition-colors ${
                          crawlAllPages ? 'bg-emerald-500' : 'bg-white/10'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                            crawlAllPages ? 'translate-x-4' : ''
                          }`}
                        />
                      </button>
                      <span className="text-xs text-slate-400">Crawl all pages (up to 2000)</span>
                    </div>
                    {!crawlAllPages && (
                      <div className="flex items-center gap-3">
                        <input
                          id="maxPages"
                          type="range"
                          min={1}
                          max={500}
                          value={maxPages}
                          onChange={(e) => setMaxPages(Number(e.target.value))}
                          className="flex-1 h-1.5 rounded-full appearance-none bg-white/6 accent-emerald-500 cursor-pointer"
                        />
                        <span className="text-sm font-mono text-slate-300 w-8 text-right">{maxPages}</span>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-600 mt-1">
                      {crawlAllPages ? 'Will crawl up to 2000 pages' : `Number of pages to crawl (1–500)`}
                    </p>
                  </div>

                  {/* Max Depth */}
                  <div>
                    <label htmlFor="maxDepth" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Crawl Depth
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        id="maxDepth"
                        type="range"
                        min={1}
                        max={10}
                        value={maxDepth}
                        onChange={(e) => setMaxDepth(Number(e.target.value))}
                        className="flex-1 h-1.5 rounded-full appearance-none bg-white/6 accent-emerald-500 cursor-pointer"
                      />
                      <span className="text-sm font-mono text-slate-300 w-4 text-right">{maxDepth}</span>
                    </div>
                    <p className="text-[10px] text-slate-600 mt-1">How many links deep to follow (1–10)</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Screenshot Mode */}
                  <fieldset>
                    <legend className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Screenshots
                    </legend>
                    <div className="flex gap-2">
                      {(['none', 'above-fold', 'full-page'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setScreenshotMode(mode)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            screenshotMode === mode
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-white/2 text-slate-500 border border-white/6 hover:text-slate-300'
                          }`}
                        >
                          {screenshotModeLabels[mode]}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  {/* Performance Check Toggle */}
                  <div>
                    <span id="performanceAuditLabel" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Performance Audit
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={includePerformance}
                      aria-labelledby="performanceAuditLabel"
                      onClick={() => setIncludePerformance(!includePerformance)}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                        includePerformance ? 'bg-emerald-500/30' : 'bg-white/6'
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                          includePerformance ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <p className="text-[10px] text-slate-600 mt-1">Lighthouse-style perf metrics</p>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Hero Image */}
        <div className="relative lg:w-1/2 w-full max-w-lg hidden sm:flex items-center justify-center">
          <div className="absolute inset-0 bg-emerald-500/10 rounded-3xl blur-3xl -z-10 mix-blend-screen" />
          <Image
            src="/hero-illustration.png"
            alt="SiteSheriff abstract app interface scan"
            width={600}
            height={600}
            className="rounded-2xl drop-shadow-2xl hover:scale-105 transition-transform duration-700 ease-out w-full h-auto"
            priority
          />
        </div>
      </div>

      {/* ── Features Grid (10 categories – 5 × 2) ──────────────────────── */}
      <section className="w-full max-w-5xl z-10 relative mb-24">
        <h2 className="text-center text-sm font-mono uppercase tracking-widest text-slate-500 mb-10">
          What it checks
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5">
          {features.map((f) => (
            <div
              key={f.label}
              className={`group flex flex-col items-center gap-3 p-6 rounded-2xl bg-white/2 border border-white/6 backdrop-blur-md hover:bg-white/4 transition-all duration-300 hover:shadow-lg ${f.accent}`}
            >
              <div className="mb-1 drop-shadow-md">{f.icon}</div>
              <span className="text-sm font-medium text-slate-100">{f.label}</span>
              <span className="text-xs text-slate-500 text-center leading-relaxed">{f.desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────────────── */}
      <section className="w-full max-w-4xl z-10 relative mb-24">
        <h2 className="text-center text-sm font-mono uppercase tracking-widest text-slate-500 mb-12">
          How it works
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {steps.map((step) => (
            <div key={step.num} className="relative flex flex-col items-center text-center">
              {/* Step number badge */}
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/3 border border-white/8 mb-5">
                {step.icon}
              </div>
              <span className="text-xs font-mono text-emerald-400/60 mb-2 tracking-wider">
                STEP {step.num}
              </span>
              <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed max-w-xs">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Recent Scans ────────────────────────────────────────────────── */}
      {scansLoaded && recentScans.length > 0 && (
        <section className="w-full max-w-3xl z-10 relative mb-24">
          <h2 className="text-center text-sm font-mono uppercase tracking-widest text-slate-500 mb-10">
            Recent scans
          </h2>

          <div className="rounded-2xl border border-white/6 bg-white/2 backdrop-blur-md overflow-hidden divide-y divide-white/5">
            {recentScans.map((scan) => (
              <a
                key={scan.id}
                href={`/scan/${scan.id}`}
                className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-white/3 transition-colors duration-200"
              >
                <span className="text-sm text-slate-300 font-mono truncate min-w-0">
                  {truncateUrl(scan.inputUrl)}
                </span>

                <div className="flex items-center gap-4 shrink-0">
                  {scan.status === 'SUCCEEDED' && scan.summary ? (
                    <span className={`text-sm font-semibold tabular-nums ${scoreColor(scan.summary.overallScore)}`}>
                      {scan.summary.overallScore}
                    </span>
                  ) : (
                    <span className="text-xs font-mono text-slate-500 uppercase">
                      {scan.status === 'RUNNING' ? 'scanning…' : scan.status.toLowerCase()}
                    </span>
                  )}

                  <span className="text-xs text-slate-600 tabular-nums whitespace-nowrap">
                    {timeAgo(scan.createdAt)}
                  </span>

                  <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </a>
            ))}
          </div>

          <div className="mt-4 text-center">
            <a
              href="/scans"
              className="text-xs font-mono uppercase tracking-widest text-slate-500 hover:text-emerald-400 transition-colors"
            >
              View all scans →
            </a>
          </div>
        </section>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="mt-auto pt-16 pb-8 flex flex-col items-center gap-3 z-10 relative">
        <p className="text-slate-500 text-sm">
          Built for freelancers &amp; agencies
        </p>
        <div className="flex items-center gap-4 flex-wrap justify-center">
          <span className="text-slate-600 text-xs font-mono uppercase tracking-widest">
            SYSTEM_STATUS: ONLINE
          </span>
          <span className="text-slate-700">·</span>
          <a
            href="https://github.com/forbiddenlink/site-sheriff"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-emerald-400 transition-colors font-mono"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              />
            </svg>
            GitHub
          </a>
          <span className="text-slate-700">·</span>
          <a
            href="/about"
            className="text-xs text-slate-500 hover:text-emerald-400 transition-colors font-mono"
          >
            About
          </a>
          <span className="text-slate-700">·</span>
          <a
            href="/contact"
            className="text-xs text-slate-500 hover:text-emerald-400 transition-colors font-mono"
          >
            Contact
          </a>
          <span className="text-slate-700">·</span>
          <a
            href="/scans"
            className="text-xs text-slate-500 hover:text-emerald-400 transition-colors font-mono"
          >
            Scans
          </a>
          <span className="text-slate-700">·</span>
          <a
            href="/privacy"
            className="text-xs text-slate-500 hover:text-emerald-400 transition-colors font-mono"
          >
            Privacy
          </a>
        </div>
      </footer>
    </main>
  );
}
