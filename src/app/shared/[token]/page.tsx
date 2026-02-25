'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface ScanData {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  inputUrl: string;
  normalizedUrl: string;
  progress: {
    pagesDiscovered: number;
    pagesScanned: number;
    checksCompleted: number;
    stage: string;
    currentPage?: string;
  };
  summary: {
    overallScore: number;
    categoryScores: Record<string, number>;
    issueCount: Record<string, number>;
    topIssues: Array<{
      code: string;
      title: string;
      severity: string;
      category: string;
      count: number;
    }>;
    technologies?: Array<{
      name: string;
      category: string;
      confidence: string;
      evidence: string;
    }>;
    socialPreview?: {
      ogTitle: string | null;
      ogDescription: string | null;
      ogImage: string | null;
      ogSiteName: string | null;
      twitterCard: string | null;
      twitterTitle: string | null;
      twitterDescription: string | null;
      twitterImage: string | null;
      favicon: string | null;
    };
  } | null;
  issues: Array<{
    id: string;
    code: string;
    severity: string;
    category: string;
    title: string;
    whyItMatters: string | null;
    howToFix: string | null;
    evidence: Record<string, unknown> | null;
    impact: number | null;
    effort: number | null;
  }>;
  pages: Array<{
    id: string;
    url: string;
    statusCode: number | null;
    title: string | null;
    screenshotPath?: string | null;
  }>;
  error?: string;
  clientEmailDraft?: string | null;
  createdAt: string;
}

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;

  const getColor = (s: number) => {
    if (s >= 80) return 'url(#emeraldGrad)';
    if (s >= 50) return 'url(#amberGrad)';
    return 'url(#redGrad)';
  };

  return (
    <div className="relative flex items-center justify-center">
      <div className="absolute inset-0 bg-white/5 blur-2xl rounded-full" />
      <svg className="transform -rotate-90 relative z-10" width={size} height={size}>
        <defs>
          <linearGradient id="emeraldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
          <linearGradient id="amberGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id="redGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" className="text-white/4" />
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={getColor(score)} strokeWidth={strokeWidth} fill="transparent" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
        <span className="text-4xl font-bold tracking-tighter text-transparent bg-clip-text bg-[linear-gradient(to_bottom,#fff,#94a3b8)]">
          {score}
        </span>
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    P0: 'bg-red-500/10 text-red-500 border-red-500/20',
    P1: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    P2: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    P3: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  };
  const badgeStyle = styles[severity] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  return (
    <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-full border ${badgeStyle}`}>
      {severity}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const styles: Record<string, string> = {
    SEO: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    SECURITY: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    ACCESSIBILITY: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    PERFORMANCE: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    LINKS: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    CONTENT: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  };
  const badgeStyle = styles[category] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  return (
    <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-full border ${badgeStyle}`}>
      {category}
    </span>
  );
}

function getEffortLabel(effort: number): string {
  if (effort <= 2) return 'Easy';
  if (effort === 3) return 'Medium';
  return 'Hard';
}

function EffortBadge({ effort }: { effort: number | null }) {
  if (effort === null) return null;
  const label = getEffortLabel(effort);
  const styles: Record<string, string> = {
    Easy: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    Medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    Hard: 'bg-red-500/10 text-red-400 border-red-500/20',
  };
  return (
    <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-full border ${styles[label]}`}>
      {label}
    </span>
  );
}

export default function SharedScanPage() {
  const params = useParams();
  const token = params?.token as string;
  const [data, setData] = useState<ScanData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());
  const [expandedScreenshot, setExpandedScreenshot] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'severity' | 'category'>('severity');

  const toggleIssue = (issueId: string) => {
    setExpandedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(issueId)) {
        next.delete(issueId);
      } else {
        next.add(issueId);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/shared/${token}`);
        if (!res.ok) throw new Error('Shared report not found');
        const json = await res.json();
        if (cancelled) return;
        setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load shared report');
        }
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [token]);

  if (error) {
    return (
      <main className="min-h-screen bg-[#030712] flex items-center justify-center p-8">
        <div className="text-center p-8 bg-white/2 border border-red-500/20 rounded-2xl backdrop-blur-md">
          <h1 className="text-xl font-medium text-red-400 mb-2">Report Not Found</h1>
          <p className="text-slate-400 text-sm mb-6">{error}</p>
          <Link
            href="/"
            className="text-xs font-mono text-emerald-400 hover:text-emerald-300 transition-colors uppercase tracking-widest"
          >
            ← Run your own scan
          </Link>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-[#030712] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          <div className="text-xs font-mono text-slate-500 tracking-widest uppercase">Loading shared report...</div>
        </div>
      </main>
    );
  }

  const isComplete = data.status === 'SUCCEEDED';
  const isFailed = data.status === 'FAILED';

  const filteredIssues = data?.issues
    ?.filter((i) => !activeCategory || i.category === activeCategory)
    .sort((a, b) => {
      if (sortBy === 'severity') {
        const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
        return (order[a.severity as keyof typeof order] ?? 4) - (order[b.severity as keyof typeof order] ?? 4);
      }
      return a.category.localeCompare(b.category);
    }) ?? [];

  const categoryFilters = ['SEO', 'SECURITY', 'PERFORMANCE', 'ACCESSIBILITY', 'LINKS', 'CONTENT'];

  return (
    <main className="min-h-screen bg-[#030712] p-8 lg:p-12 selection:bg-emerald-500/30">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-12">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Link
                href="/"
                className="text-slate-500 hover:text-white transition-colors text-xs font-mono uppercase tracking-widest"
              >
                ← Run your own scan
              </Link>
              <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                Shared Report
              </span>
            </div>
            <h1 className="text-3xl font-semibold text-white tracking-tight break-all max-w-2xl">
              {data.inputUrl}
            </h1>
            <p className="text-slate-500 text-xs font-mono mt-2">
              Scanned on {new Date(data.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Error state */}
        {isFailed && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-3xl p-8 mb-12 backdrop-blur-md">
            <h2 className="text-sm font-bold text-red-500 uppercase tracking-widest mb-2">
              Scan Failed
            </h2>
            <p className="text-slate-300 font-mono text-sm">{data.error || 'Unknown error.'}</p>
          </div>
        )}

        {/* Results */}
        {isComplete && data.summary && (
          <>
            {/* Score */}
            <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 mb-8">
              <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl p-8 flex flex-col items-center justify-center">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 block w-full text-center">
                  System Health
                </h2>
                <ScoreRing score={data.summary.overallScore} size={160} />
              </div>

              <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl p-8">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-8">
                  Diagnostic Vectors
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-6">
                  {Object.entries(data.summary.categoryScores).map(([cat, score]) => (
                    <div key={cat} className="flex flex-col">
                      <div className="text-3xl font-bold tracking-tighter text-transparent bg-clip-text bg-[linear-gradient(to_bottom,#fff,#94a3b8)]">
                        {score}
                      </div>
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{cat}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-2xl p-5 text-center">
                <div className="text-2xl font-bold tracking-tighter text-transparent bg-clip-text bg-[linear-gradient(to_bottom,#fff,#94a3b8)]">
                  {data.pages.length}
                </div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Pages Crawled</div>
              </div>
              <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-2xl p-5 text-center">
                <div className="text-2xl font-bold tracking-tighter text-transparent bg-clip-text bg-[linear-gradient(to_bottom,#fff,#94a3b8)]">
                  {data.issues.length}
                </div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Issues Found</div>
              </div>
              <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-2xl p-5 text-center">
                <div className="text-2xl font-bold tracking-tighter text-red-400">
                  {data.issues.filter((i) => i.severity === 'P0' || i.severity === 'P1').length}
                </div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Critical / High</div>
              </div>
              <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-2xl p-5 text-center">
                <div className="text-2xl font-bold tracking-tighter text-emerald-400">
                  {data.issues.filter((i) => i.effort !== null && i.effort <= 2).length}
                </div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Quick Wins</div>
              </div>
            </div>

            {/* Tech Stack */}
            {data.summary.technologies && data.summary.technologies.length > 0 && (
              <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl p-8 mb-8">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">
                  Detected Technologies
                </h2>
                <div className="flex flex-wrap gap-3">
                  {data.summary.technologies.map((tech) => (
                    <div key={tech.name} className="px-4 py-2 bg-white/4 border border-white/8 rounded-xl">
                      <span className="text-sm font-medium text-slate-200">{tech.name}</span>
                      <span className="text-xs text-slate-500 ml-2">{tech.category}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Issues List */}
            <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl overflow-hidden mb-20">
              <div className="px-8 py-6 border-b border-white/6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-white tracking-wide">
                    Identified Anomalies
                  </h2>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        if (expandedIssues.size === filteredIssues.length) {
                          setExpandedIssues(new Set());
                        } else {
                          setExpandedIssues(new Set(filteredIssues.map((i) => i.id)));
                        }
                      }}
                      className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-white transition-colors"
                    >
                      {expandedIssues.size === filteredIssues.length && filteredIssues.length > 0 ? 'Collapse All' : 'Expand All'}
                    </button>
                    <span className="text-xs font-mono text-slate-500 bg-white/4 px-2.5 py-1 rounded-lg">
                      COUNT: {filteredIssues.length}{activeCategory ? ` / ${data.issues.length}` : ''}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setActiveCategory(null)}
                    className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-full border transition-all ${
                      activeCategory === null
                        ? 'bg-white/10 text-white border-white/20'
                        : 'bg-white/2 text-slate-400 border-white/6 hover:bg-white/6'
                    }`}
                  >
                    All
                  </button>
                  {categoryFilters.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                      className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-full border transition-all ${
                        activeCategory === cat
                          ? 'bg-white/10 text-white border-white/20'
                          : 'bg-white/2 text-slate-400 border-white/6 hover:bg-white/6'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                  <div className="ml-auto flex items-center gap-1">
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest mr-2">Sort:</span>
                    <button
                      onClick={() => setSortBy('severity')}
                      className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-full border transition-all ${
                        sortBy === 'severity'
                          ? 'bg-white/10 text-white border-white/20'
                          : 'bg-white/2 text-slate-400 border-white/6 hover:bg-white/6'
                      }`}
                    >
                      Severity
                    </button>
                    <button
                      onClick={() => setSortBy('category')}
                      className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-full border transition-all ${
                        sortBy === 'category'
                          ? 'bg-white/10 text-white border-white/20'
                          : 'bg-white/2 text-slate-400 border-white/6 hover:bg-white/6'
                      }`}
                    >
                      Category
                    </button>
                  </div>
                </div>
              </div>

              {filteredIssues.length === 0 ? (
                <div className="p-12 text-center text-slate-500 font-mono text-sm">
                  {activeCategory ? `No ${activeCategory} issues found` : 'No issues found'}
                </div>
              ) : (
                <div className="divide-y divide-white/4">
                  {filteredIssues.map((issue) => {
                    const isExpanded = expandedIssues.has(issue.id);
                    return (
                      <div key={issue.id} id={`issue-${issue.id}`} className="hover:bg-white/2 transition-colors duration-300 group">
                        <button
                          type="button"
                          className="p-6 sm:p-8 cursor-pointer select-none w-full text-left"
                          onClick={() => toggleIssue(issue.id)}
                        >
                          <div className="flex flex-col sm:flex-row items-start gap-5">
                            <div className="mt-1 shrink-0 flex items-center gap-3">
                              <svg
                                className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                              <SeverityBadge severity={issue.severity} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2 flex-wrap">
                                <h3 className="text-slate-200 text-base font-medium leading-tight">{issue.title}</h3>
                                <CategoryBadge category={issue.category} />
                              </div>
                              {issue.whyItMatters && (
                                <p className="text-slate-400 text-sm leading-relaxed max-w-3xl">{issue.whyItMatters}</p>
                              )}
                              <div className="flex items-center gap-4 mt-4 text-xs font-mono text-slate-500 opacity-60 group-hover:opacity-100 transition-opacity">
                                <span className="bg-white/4 px-2 py-1 rounded">CODE: {issue.code}</span>
                                {issue.impact && (
                                  <span>IMPACT: <span className="text-slate-300">{issue.impact}/5</span></span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-6 sm:px-8 pb-6 sm:pb-8 pt-0 ml-0 sm:ml-17 space-y-5">
                            {issue.howToFix && (
                              <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">How to Fix</h4>
                                <p className="text-slate-300 text-sm leading-relaxed max-w-3xl">{issue.howToFix}</p>
                              </div>
                            )}
                            {issue.effort !== null && (
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Effort</span>
                                <EffortBadge effort={issue.effort} />
                              </div>
                            )}
                            {issue.evidence && Object.keys(issue.evidence).length > 0 && (
                              <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Evidence</h4>
                                <div className="bg-white/2 border border-white/6 rounded-xl p-4 font-mono text-xs text-slate-300 space-y-1.5 overflow-x-auto">
                                  {Object.entries(issue.evidence).map(([key, value]) => {
                                    if (value === null || value === undefined) return null;
                                    const isUrl = key === 'url' && typeof value === 'string' && value.startsWith('http');
                                    const display = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
                                    return (
                                      <div key={key} className="flex gap-3">
                                        <span className="text-slate-500 shrink-0">{key}:</span>
                                        {isUrl ? (
                                          <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 break-all transition-colors">
                                            {display}
                                          </a>
                                        ) : (
                                          <span className="text-slate-300 break-all whitespace-pre-wrap">{display}</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pages */}
            {data.pages.length > 0 && (
              <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl overflow-hidden mb-20">
                <div className="px-8 py-6 border-b border-white/6 flex items-center justify-between">
                  <h2 className="text-sm font-medium text-white tracking-wide">Crawled Pages</h2>
                  <span className="text-xs font-mono text-slate-500 bg-white/4 px-2.5 py-1 rounded-lg">COUNT: {data.pages.length}</span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-6">
                  {data.pages.map((pg) => (
                    <div key={pg.id} className="bg-white/2 border border-white/4 rounded-2xl overflow-hidden hover:border-white/10 transition-colors">
                      {pg.screenshotPath && (
                        <button type="button" className="w-full cursor-pointer" onClick={() => setExpandedScreenshot(pg.screenshotPath!)}>
                          <img src={pg.screenshotPath} alt={`Screenshot of ${pg.title || pg.url}`} className="w-full h-44 object-cover object-top border-b border-white/4" loading="lazy" />
                        </button>
                      )}
                      <div className="p-4">
                        <h3 className="text-sm font-medium text-slate-200 truncate mb-1">{pg.title || pg.url}</h3>
                        <p className="text-xs font-mono text-slate-500 truncate mb-2">{pg.url}</p>
                        {pg.statusCode && (() => {
                          let badgeStyle = 'bg-red-500/10 text-red-400 border-red-500/20';
                          if (pg.statusCode >= 200 && pg.statusCode < 300) badgeStyle = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                          else if (pg.statusCode >= 300 && pg.statusCode < 400) badgeStyle = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                          return <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-full border ${badgeStyle}`}>{pg.statusCode}</span>;
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Screenshot Lightbox */}
            {expandedScreenshot && (
              <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-8">
                <div className="relative max-w-4xl max-h-[90vh] overflow-auto rounded-2xl border border-white/10">
                  <img src={expandedScreenshot} alt="Full screenshot" className="w-full h-auto" />
                  <button
                    type="button"
                    className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                    onClick={() => setExpandedScreenshot(null)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
