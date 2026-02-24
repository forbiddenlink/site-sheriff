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
      {/* Ambient Glow */}
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
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          className="text-white/4"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={getColor(score)}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
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
    <span
      className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-full border ${badgeStyle}`}
    >
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
    <span
      className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-full border ${badgeStyle}`}
    >
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

export default function ScanPage() {
  const params = useParams();
  const id = params?.id as string;
  const [data, setData] = useState<ScanData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
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

  const handleShareReport = async () => {
    await navigator.clipboard.writeText(globalThis.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPDF = () => {
    globalThis.print();
  };

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/scan/${id}`);
        if (!res.ok) {
          throw new Error('Scan not found');
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load scan');
      }
    };

    fetchData();

    // Poll if still running
    const interval = setInterval(() => {
      if (data?.status === 'QUEUED' || data?.status === 'RUNNING') {
        fetchData();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [id, data?.status]);

  if (error) {
    return (
      <main className="min-h-screen bg-[#030712] flex items-center justify-center p-8">
        <div className="text-center p-8 bg-white/2 border border-red-500/20 rounded-2xl backdrop-blur-md">
          <h1 className="text-xl font-medium text-red-400 mb-2">Diagnostic Error</h1>
          <p className="text-slate-400 text-sm mb-6">{error}</p>
          <Link
            href="/"
            className="text-xs font-mono text-emerald-400 hover:text-emerald-300 transition-colors uppercase tracking-widest"
          >
            ← Return to scanner
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
           <div className="text-xs font-mono text-slate-500 tracking-widest uppercase">Initializing Telemetry...</div>
        </div>
      </main>
    );
  }

  const isComplete = data.status === 'SUCCEEDED';
  const isFailed = data.status === 'FAILED';
  const isRunning = data.status === 'QUEUED' || data.status === 'RUNNING';

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
      <style jsx global>{`
        @media print {
          body { background: white !important; color: black !important; }
          .no-print { display: none !important; }
          * { color: black !important; border-color: #e5e7eb !important; background: white !important; }
        }
      `}</style>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-12">
          <div>
            <Link
              href="/"
              className="no-print text-slate-500 hover:text-white transition-colors text-xs font-mono uppercase tracking-widest mb-4 inline-block"
            >
              ← System core
            </Link>
            <h1 className="text-3xl font-semibold text-white tracking-tight break-all max-w-2xl">
              {data.inputUrl}
            </h1>
            <p className="text-slate-500 text-xs font-mono mt-2">
              SESSION_ID: {data.id.split('-')[0]} • {new Date(data.createdAt).toLocaleTimeString()}
            </p>
          </div>

          {isComplete && (
            <div className="no-print flex items-center gap-3">
              <button
                onClick={handleDownloadPDF}
                className="px-5 py-2.5 rounded-xl bg-white/4 border border-white/8 text-slate-300 hover:bg-white/8 hover:text-white transition-all text-sm font-medium backdrop-blur-md active:scale-95"
              >
                Download PDF
              </button>
              <button
                onClick={handleShareReport}
                className="px-5 py-2.5 rounded-xl bg-white/4 border border-white/8 text-slate-300 hover:bg-white/8 hover:text-white transition-all text-sm font-medium backdrop-blur-md active:scale-95"
              >
                {copied ? 'Copied!' : 'Share Report'}
              </button>
            </div>
          )}
        </div>

        {/* Progress / Running state */}
        {isRunning && (
          <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl p-8 mb-12 relative overflow-hidden">
            {/* The Scanning Laser Effect */}
            <div className="absolute top-0 left-0 w-full h-px bg-[linear-gradient(to_right,transparent,rgba(52,211,153,0.8),transparent)] animate-[pulse_2s_ease-in-out_infinite]" />
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8 mb-10">
              <div className="flex items-center gap-5">
                <div className="relative flex items-center justify-center w-12 h-12">
                   <div className="absolute inset-0 rounded-full border border-emerald-500/30 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]" />
                   <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,1)]" />
                </div>
                <div>
                  <h2 className="text-sm font-medium text-white uppercase tracking-widest mb-1">
                    Telemetry Active
                  </h2>
                  <p className="text-emerald-400/80 text-xs font-mono">
                    [{data.progress.stage}] {data.progress.currentPage && `› ${data.progress.currentPage.substring(0,40)}...`}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl bg-white/2 border border-white/4">
                <div className="text-3xl font-bold tracking-tighter text-transparent bg-clip-text bg-[linear-gradient(to_bottom,#fff,#94a3b8)]">
                  {data.progress.pagesDiscovered}
                </div>
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mt-1">Nodes Discovered</div>
              </div>
              <div className="p-5 rounded-2xl bg-white/2 border border-white/4">
                <div className="text-3xl font-bold tracking-tighter text-transparent bg-clip-text bg-[linear-gradient(to_bottom,#fff,#94a3b8)]">
                  {data.progress.pagesScanned}
                </div>
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mt-1">Nodes Scanned</div>
              </div>
              <div className="p-5 rounded-2xl bg-white/2 border border-white/4">
                <div className="text-3xl font-bold tracking-tighter text-transparent bg-clip-text bg-[linear-gradient(to_bottom,#fff,#94a3b8)]">
                  {data.progress.checksCompleted}
                </div>
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mt-1">Audits Run</div>
              </div>
            </div>
          </div>
        )}

        {/* Error state */}
        {isFailed && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-3xl p-8 mb-12 backdrop-blur-md">
            <h2 className="text-sm font-bold text-red-500 uppercase tracking-widest mb-2">
              Critical Failure
            </h2>
            <p className="text-slate-300 font-mono text-sm">{data.error || 'Unknown error code returned from engine.'}</p>
          </div>
        )}

        {/* Results */}
        {isComplete && data.summary && (
          <>
            {/* Score Bento Box */}
            <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 mb-8">
              {/* Overall Score Card */}
              <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl p-8 flex flex-col items-center justify-center">
                 <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 block w-full text-center">
                    System Health
                 </h2>
                 <ScoreRing score={data.summary.overallScore} size={160} />
              </div>
              
              {/* Category Matrix */}
              <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl p-8">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-8">
                    Diagnostic Vectors
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-6">
                    {Object.entries(data.summary.categoryScores).map(
                      ([cat, score]) => (
                        <div key={cat} className="flex flex-col">
                          <div className="text-3xl font-bold tracking-tighter text-transparent bg-clip-text bg-[linear-gradient(to_bottom,#fff,#94a3b8)]">
                            {score}
                          </div>
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                            {cat}
                          </div>
                        </div>
                      )
                    )}
                  </div>
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

            {/* Issues list (The Ghost Rows) */}
            <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl overflow-hidden mb-20">
              <div className="px-8 py-6 border-b border-white/6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-white tracking-wide">
                    Identified Anomalies
                  </h2>
                  <span className="text-xs font-mono text-slate-500 bg-white/4 px-2.5 py-1 rounded-lg">
                    COUNT: {filteredIssues.length}{activeCategory ? ` / ${data.issues.length}` : ''}
                  </span>
                </div>
                <div className="no-print flex flex-wrap items-center gap-2">
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
                  <div className="flex justify-center mb-4">
                    <svg className="w-10 h-10 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  {activeCategory ? `No ${activeCategory} issues found` : 'SYSTEM.STATUS == PERFECT'}
                </div>
              ) : (
                <div className="divide-y divide-white/4">
                  {filteredIssues.map((issue) => {
                    const isExpanded = expandedIssues.has(issue.id);
                    return (
                      <div key={issue.id} className="hover:bg-white/2 transition-colors duration-300 group">
                        <button
                          type="button"
                          className="p-6 sm:p-8 cursor-pointer select-none w-full text-left"
                          onClick={() => toggleIssue(issue.id)}
                        >
                          <div className="flex flex-col sm:flex-row items-start gap-5">
                            <div className="mt-1 shrink-0 flex items-center gap-3">
                              <svg
                                className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                              <SeverityBadge severity={issue.severity} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2 flex-wrap">
                                <h3 className="text-slate-200 text-base font-medium leading-tight">
                                  {issue.title}
                                </h3>
                                <CategoryBadge category={issue.category} />
                              </div>
                              
                              {issue.whyItMatters && (
                                <p className="text-slate-400 text-sm leading-relaxed max-w-3xl">
                                  {issue.whyItMatters}
                                </p>
                              )}
                              
                              <div className="flex items-center gap-4 mt-4 text-xs font-mono text-slate-500 opacity-60 group-hover:opacity-100 transition-opacity">
                                <span className="bg-white/4 px-2 py-1 rounded">
                                  CODE: {issue.code}
                                </span>
                                {issue.impact && (
                                  <span>
                                    IMPACT:{' '}
                                    <span className="text-slate-300">{issue.impact}/5</span>
                                  </span>
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
                                <p className="text-slate-300 text-sm leading-relaxed max-w-3xl">
                                  {issue.howToFix}
                                </p>
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
                                    const display = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
                                    return (
                                      <div key={key} className="flex gap-3">
                                        <span className="text-slate-500 shrink-0">{key}:</span>
                                        <span className="text-slate-300 break-all whitespace-pre-wrap">{display}</span>
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

            {/* Pages with Screenshots */}
            {data.pages.length > 0 && (
              <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl overflow-hidden mb-20">
                <div className="px-8 py-6 border-b border-white/6 flex items-center justify-between">
                  <h2 className="text-sm font-medium text-white tracking-wide">
                    Crawled Pages
                  </h2>
                  <span className="text-xs font-mono text-slate-500 bg-white/4 px-2.5 py-1 rounded-lg">
                    COUNT: {data.pages.length}
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-6">
                  {data.pages.map((pg) => (
                    <div
                      key={pg.id}
                      className="bg-white/2 border border-white/4 rounded-2xl overflow-hidden hover:border-white/10 transition-colors"
                    >
                      {pg.screenshotPath && (
                        <button
                          type="button"
                          className="w-full cursor-pointer"
                          onClick={() => setExpandedScreenshot(pg.screenshotPath!)}
                        >
                          <img
                            src={pg.screenshotPath}
                            alt={`Screenshot of ${pg.title || pg.url}`}
                            className="w-full h-44 object-cover object-top border-b border-white/4"
                            loading="lazy"
                          />
                        </button>
                      )}
                      <div className="p-4">
                        <h3 className="text-sm font-medium text-slate-200 truncate mb-1">
                          {pg.title || pg.url}
                        </h3>
                        <p className="text-xs font-mono text-slate-500 truncate mb-2">
                          {pg.url}
                        </p>
                        {pg.statusCode && (() => {
                          let badgeStyle = 'bg-red-500/10 text-red-400 border-red-500/20';
                          if (pg.statusCode >= 200 && pg.statusCode < 300) {
                            badgeStyle = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                          } else if (pg.statusCode >= 300 && pg.statusCode < 400) {
                            badgeStyle = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                          }
                          return (
                            <span
                              className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-full border ${badgeStyle}`}
                            >
                              {pg.statusCode}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Screenshot Lightbox */}
            {expandedScreenshot && (
              <div
                className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-8"
              >
                <div className="relative max-w-4xl max-h-[90vh] overflow-auto rounded-2xl border border-white/10">
                  <img
                    src={expandedScreenshot}
                    alt="Full screenshot"
                    className="w-full h-auto"
                  />
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
