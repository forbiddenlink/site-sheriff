'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ScanData {
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
    links?: Array<{ href: string; text: string; isInternal: boolean }> | null;
  }>;
  previousScan?: {
    id: string;
    score: number;
    createdAt: string;
  } | null;
  error?: string;
  clientEmailDraft?: string | null;
  createdAt: string;
}

export interface ScanResultsViewProps {
  data: ScanData | null;
  error: string | null;
  variant?: 'full' | 'shared';
  renderCrawlMap?: (pages: ScanData['pages'], baseUrl: string) => ReactNode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small Reusable Components
// ─────────────────────────────────────────────────────────────────────────────

export function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;

  const [displayScore, setDisplayScore] = useState(0);
  const [mounted, setMounted] = useState(false);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));

    const duration = 1500;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(eased * score));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [score]);

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
          strokeDashoffset={mounted ? offset : circumference}
          strokeLinecap="round"
          className="transition-all duration-[1500ms] ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
        <span className="text-4xl font-bold tracking-tighter text-transparent bg-clip-text bg-[linear-gradient(to_bottom,#fff,#94a3b8)] print:text-black print:bg-none print:bg-clip-border print:[-webkit-text-fill-color:#111]">
          {displayScore}
        </span>
      </div>
    </div>
  );
}

export function CategoryScoreBar({ cat, score, barColor, bgGlow }: { cat: string; score: number; barColor: string; bgGlow: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  return (
    <div className="flex flex-col">
      <div className="text-3xl font-bold tracking-tighter text-transparent bg-clip-text bg-[linear-gradient(to_bottom,#fff,#94a3b8)] print:text-black print:bg-none print:bg-clip-border print:[-webkit-text-fill-color:#111]">
        {score}
      </div>
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1 mb-2">
        {cat}
      </div>
      <div className="w-full h-1.5 rounded-full bg-white/6 overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barColor} shadow-md ${bgGlow} transition-all duration-[1200ms] ease-out`}
          style={{ width: mounted ? `${score}%` : '0%' }}
        />
      </div>
    </div>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
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

export function CategoryBadge({ category }: { category: string }) {
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

export function getEffortLabel(effort: number): string {
  if (effort <= 2) return 'Easy';
  if (effort === 3) return 'Medium';
  return 'Hard';
}

export function EffortBadge({ effort }: { effort: number | null }) {
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

// ─────────────────────────────────────────────────────────────────────────────
// Main Scan Results View
// ─────────────────────────────────────────────────────────────────────────────

export function ScanResultsView({
  data,
  error,
  variant = 'full',
  renderCrawlMap,
}: ScanResultsViewProps) {
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());
  const [expandedScreenshot, setExpandedScreenshot] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'severity' | 'category'>('severity');
  const [copied, setCopied] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [groupByPage, setGroupByPage] = useState(false);

  const isFull = variant === 'full';

  // ── Computed values (must be before any early returns — Rules of Hooks) ──
  const sortedIssues = useMemo(() => {
    if (!data?.issues) return [];
    return [...data.issues]
      .filter((i) => !activeCategory || i.category === activeCategory)
      .sort((a, b) => {
        if (sortBy === 'severity') {
          const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
          return (order[a.severity as keyof typeof order] ?? 4) - (order[b.severity as keyof typeof order] ?? 4);
        }
        return a.category.localeCompare(b.category);
      });
  }, [data?.issues, activeCategory, sortBy]);

  const filteredIssues = useMemo(() => {
    let result = sortedIssues.filter((issue) => {
      const matchesSearch = !searchQuery ||
        issue.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        issue.whyItMatters?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        issue.code?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || issue.category === selectedCategory;
      const matchesSeverity = selectedSeverity === 'all' || issue.severity === selectedSeverity;
      return matchesSearch && matchesCategory && matchesSeverity;
    });
    if (groupByPage) {
      result = [...result].sort((a, b) => {
        const urlA = (a.evidence?.url as string) || 'General';
        const urlB = (b.evidence?.url as string) || 'General';
        return urlA.localeCompare(urlB);
      });
    }
    return result;
  }, [sortedIssues, searchQuery, selectedCategory, selectedSeverity, groupByPage]);

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
    if (!data) return;
    setShareLoading(true);
    try {
      const res = await fetch(`/api/scan/${data.id}/share`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to create share link');
      const { shareToken } = await res.json();
      const shareUrl = `${globalThis.location.origin}/shared/${shareToken}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      await navigator.clipboard.writeText(globalThis.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } finally {
      setShareLoading(false);
    }
  };

  const handleExport = (format: 'csv' | 'json') => {
    if (!data) return;
    setShowExportMenu(false);
    globalThis.open(`/api/scan/${data.id}/export?format=${format}`, '_blank');
  };

  const handleCopyEmail = async () => {
    if (data?.clientEmailDraft) {
      await navigator.clipboard.writeText(data.clientEmailDraft);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    }
  };

  const handleDownloadPDF = () => {
    if (data?.issues) {
      setExpandedIssues(new Set(data.issues.map((i) => i.id)));
    }
    setTimeout(() => globalThis.print(), 100);
  };

  // ── Error state ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <main className="min-h-screen bg-[#030712] flex items-center justify-center p-8">
        <div className="text-center p-8 bg-white/2 border border-red-500/20 rounded-2xl backdrop-blur-md">
          <h1 className="text-xl font-medium text-red-400 mb-2">
            {isFull ? 'Diagnostic Error' : 'Report Not Found'}
          </h1>
          <p className="text-slate-400 text-sm mb-6">{error}</p>
          <Link
            href="/"
            className="text-xs font-mono text-emerald-400 hover:text-emerald-300 transition-colors uppercase tracking-widest"
          >
            {isFull ? '← Return to scanner' : '← Run your own scan'}
          </Link>
        </div>
      </main>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (!data) {
    return (
      <main className="min-h-screen bg-[#030712] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
           <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
           <div className="text-xs font-mono text-slate-500 tracking-widest uppercase">
             {isFull ? 'Initializing Telemetry...' : 'Loading shared report...'}
           </div>
        </div>
      </main>
    );
  }

  // ── Data-derived values ────────────────────────────────────────────────────

  const isComplete = data.status === 'SUCCEEDED';
  const isFailed = data.status === 'FAILED';
  const isRunning = data.status === 'QUEUED' || data.status === 'RUNNING';

  const categoryFilters = ['SEO', 'SECURITY', 'PERFORMANCE', 'ACCESSIBILITY', 'LINKS', 'CONTENT'];

  return (
    <main className="min-h-screen bg-[#030712] p-8 lg:p-12 selection:bg-emerald-500/30 print:bg-white print:p-0 print:min-h-0">
      <div className="max-w-5xl mx-auto">
        {/* Print-only header */}
        {isFull && (
          <div className="print-header mb-8 pb-4 border-b-2 border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Site Sheriff — Website Audit Report</h1>
                <p className="text-sm text-gray-500 mt-1">{data.inputUrl}</p>
              </div>
              <div className="text-right text-sm text-gray-500">
                <p>Generated {new Date(data.createdAt + 'Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                <p>site-sheriff.vercel.app</p>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-12">
          <div>
            {isFull ? (
              <>
                <Link
                  href="/"
                  className="no-print print:hidden text-slate-500 hover:text-white transition-colors text-xs font-mono uppercase tracking-widest mb-4 inline-block"
                >
                  ← System core
                </Link>
                <h1 className="text-3xl font-semibold text-white tracking-tight break-all max-w-2xl">
                  {data.inputUrl}
                </h1>
                <p className="text-slate-500 text-xs font-mono mt-2">
                  SESSION_ID: {data.id.split('-')[0]} • {new Date(data.createdAt).toLocaleTimeString()}
                </p>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>

          {isFull && isComplete && (
            <div className="no-print print:hidden flex items-center gap-3">
              <button
                onClick={handleDownloadPDF}
                className="px-5 py-2.5 rounded-xl bg-white/4 border border-white/8 text-slate-300 hover:bg-white/8 hover:text-white transition-all text-sm font-medium backdrop-blur-md active:scale-95"
              >
                Download PDF
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="px-5 py-2.5 rounded-xl bg-white/4 border border-white/8 text-slate-300 hover:bg-white/8 hover:text-white transition-all text-sm font-medium backdrop-blur-md active:scale-95 flex items-center gap-2"
                >
                  Export
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 mt-2 w-40 bg-[#0a0f1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                    <button
                      onClick={() => handleExport('csv')}
                      className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-white/6 hover:text-white transition-colors"
                    >
                      Download CSV
                    </button>
                    <button
                      onClick={() => handleExport('json')}
                      className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-white/6 hover:text-white transition-colors border-t border-white/6"
                    >
                      Download JSON
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={handleShareReport}
                disabled={shareLoading}
                className="px-5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 transition-all text-sm font-medium backdrop-blur-md active:scale-95 disabled:opacity-50"
              >
                {copied ? 'Copied!' : shareLoading ? 'Creating link...' : 'Share Report'}
              </button>
            </div>
          )}
        </div>

        {/* Progress / Running state — full variant only */}
        {isFull && isRunning && (
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
                <div className="text-3xl font-bold tracking-tighter text-transparent bg-clip-text bg-[linear-gradient(to_bottom,#fff,#94a3b8)] print:text-black print:bg-none print:bg-clip-border print:[-webkit-text-fill-color:#111]">
                  {data.progress.pagesDiscovered}
                </div>
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mt-1">Nodes Discovered</div>
              </div>
              <div className="p-5 rounded-2xl bg-white/2 border border-white/4">
                <div className="text-3xl font-bold tracking-tighter text-transparent bg-clip-text bg-[linear-gradient(to_bottom,#fff,#94a3b8)] print:text-black print:bg-none print:bg-clip-border print:[-webkit-text-fill-color:#111]">
                  {data.progress.pagesScanned}
                </div>
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mt-1">Nodes Scanned</div>
              </div>
              <div className="p-5 rounded-2xl bg-white/2 border border-white/4">
                <div className="text-3xl font-bold tracking-tighter text-transparent bg-clip-text bg-[linear-gradient(to_bottom,#fff,#94a3b8)] print:text-black print:bg-none print:bg-clip-border print:[-webkit-text-fill-color:#111]">
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
              {isFull ? 'Critical Failure' : 'Scan Failed'}
            </h2>
            <p className="text-slate-300 font-mono text-sm">{data.error || (isFull ? 'Unknown error code returned from engine.' : 'Unknown error.')}</p>
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
                 {isFull && data.previousScan && (
                   <div className="mt-4 flex items-center gap-2">
                     {(() => {
                       const delta = data.summary!.overallScore - data.previousScan!.score;
                       if (delta > 0) return (
                         <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                           ↑ {delta} pts
                         </span>
                       );
                       if (delta < 0) return (
                         <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                           ↓ {Math.abs(delta)} pts
                         </span>
                       );
                       return (
                         <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-slate-500/10 text-slate-400 border border-slate-500/20">
                           → No change
                         </span>
                       );
                     })()}
                     <Link
                       href={`/scans/compare?a=${data.previousScan!.id}&b=${data.id}`}
                       className="text-[10px] text-emerald-400 hover:underline"
                     >
                       Compare →
                     </Link>
                   </div>
                 )}
              </div>
              
              {/* Category Matrix */}
              <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl p-8">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-8">
                    Diagnostic Vectors
                  </h2>
                  {isFull ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                      {Object.entries(data.summary.categoryScores).map(
                        ([cat, catScore]) => {
                          const barColor =
                            catScore >= 80
                              ? 'from-emerald-500 to-emerald-400'
                              : catScore >= 50
                                ? 'from-amber-500 to-amber-400'
                                : 'from-red-500 to-red-400';
                          const bgGlow =
                            catScore >= 80
                              ? 'shadow-emerald-500/20'
                              : catScore >= 50
                                ? 'shadow-amber-500/20'
                                : 'shadow-red-500/20';
                          return (
                            <CategoryScoreBar key={cat} cat={cat} score={catScore} barColor={barColor} bgGlow={bgGlow} />
                          );
                        }
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-6">
                      {Object.entries(data.summary.categoryScores).map(([cat, catScore]) => (
                        <div key={cat} className="flex flex-col">
                          <div className="text-3xl font-bold tracking-tighter text-transparent bg-clip-text bg-[linear-gradient(to_bottom,#fff,#94a3b8)]">
                            {catScore}
                          </div>
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{cat}</div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </div>

            {/* Issue Distribution Chart — full variant only */}
            {isFull && data.issues.length > 0 && (() => {
              const severities = [
                { key: 'P0', label: 'Critical', color: 'bg-red-500', textColor: 'text-red-400' },
                { key: 'P1', label: 'High', color: 'bg-orange-500', textColor: 'text-orange-400' },
                { key: 'P2', label: 'Medium', color: 'bg-amber-500', textColor: 'text-amber-400' },
                { key: 'P3', label: 'Low', color: 'bg-emerald-500', textColor: 'text-emerald-400' },
              ];
              const counts = severities.map((s) => ({
                ...s,
                count: data.issues.filter((i: { severity: string }) => i.severity === s.key).length,
              }));
              const total = counts.reduce((sum, c) => sum + c.count, 0);
              if (total === 0) return null;
              return (
                <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl p-8 mb-8">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">
                    Issue Distribution
                  </h2>
                  {/* Stacked Bar */}
                  <div className="relative w-full h-8 rounded-full overflow-hidden bg-white/4 flex">
                    {counts.map((s) => {
                      if (s.count === 0) return null;
                      const pct = (s.count / total) * 100;
                      return (
                        <div
                          key={s.key}
                          className={`${s.color} relative group h-full transition-all duration-1000 ease-out first:rounded-l-full last:rounded-r-full`}
                          style={{ width: `${pct}%` }}
                        >
                          {/* Tooltip */}
                          <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-[#0a0f1a] border border-white/10 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl z-10">
                            {s.key}: {s.count} issue{s.count !== 1 ? 's' : ''}
                          </div>
                          {pct > 8 && (
                            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/90">
                              {s.count}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Labels */}
                  <div className="flex items-center gap-5 mt-4">
                    {counts.map((s) => (
                      s.count > 0 && (
                        <div key={s.key} className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${s.textColor}`}>
                            {s.key}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">{s.count}</span>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Summary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-2xl p-5 text-center">
                <div className="text-2xl font-bold tracking-tighter text-transparent bg-clip-text bg-[linear-gradient(to_bottom,#fff,#94a3b8)] print:text-black print:bg-none print:bg-clip-border print:[-webkit-text-fill-color:#111]">
                  {data.pages.length}
                </div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Pages Crawled</div>
              </div>
              <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-2xl p-5 text-center">
                <div className="text-2xl font-bold tracking-tighter text-transparent bg-clip-text bg-[linear-gradient(to_bottom,#fff,#94a3b8)] print:text-black print:bg-none print:bg-clip-border print:[-webkit-text-fill-color:#111]">
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

            {/* Social Preview Cards — full variant only */}
            {isFull && data.summary.socialPreview && (data.summary.socialPreview.ogTitle || data.summary.socialPreview.ogDescription || data.summary.socialPreview.ogImage) && (
              <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl p-8 mb-8">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">
                  Social Share Preview
                </h2>
                <p className="text-xs text-slate-500 mb-6">How your page appears when shared on social platforms</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Twitter/X Card */}
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                      Twitter / X
                    </div>
                    <div className="rounded-2xl border border-white/8 overflow-hidden bg-white/2">
                      {data.summary.socialPreview.ogImage && (
                        <div className="h-40 bg-slate-800 relative overflow-hidden">
                          <img
                            src={data.summary.socialPreview.twitterImage || data.summary.socialPreview.ogImage}
                            alt="Social preview"
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                      )}
                      <div className="p-4">
                        <div className="text-xs text-slate-500 mb-1 truncate">
                          {data.normalizedUrl?.replace(/^https?:\/\//, '').replace(/\/$/, '') ?? ''}
                        </div>
                        <div className="text-sm font-medium text-slate-200 mb-1 line-clamp-1">
                          {data.summary.socialPreview.twitterTitle || data.summary.socialPreview.ogTitle || data.inputUrl}
                        </div>
                        <div className="text-xs text-slate-400 line-clamp-2">
                          {data.summary.socialPreview.twitterDescription || data.summary.socialPreview.ogDescription || 'No description set'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Facebook / LinkedIn Card */}
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96A10 10 0 0022 12.06C22 6.53 17.5 2.04 12 2.04Z"/></svg>
                      Facebook / LinkedIn
                    </div>
                    <div className="rounded-2xl border border-white/8 overflow-hidden bg-white/2">
                      {data.summary.socialPreview.ogImage && (
                        <div className="h-48 bg-slate-800 relative overflow-hidden">
                          <img
                            src={data.summary.socialPreview.ogImage}
                            alt="OG preview"
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                      )}
                      <div className="p-4 border-t border-white/6">
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                          {data.summary.socialPreview.ogSiteName || data.normalizedUrl?.replace(/^https?:\/\//, '').split('/')[0] || ''}
                        </div>
                        <div className="text-sm font-semibold text-slate-200 mb-1 line-clamp-2">
                          {data.summary.socialPreview.ogTitle || data.inputUrl}
                        </div>
                        <div className="text-xs text-slate-400 line-clamp-2">
                          {data.summary.socialPreview.ogDescription || 'No description set'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Missing tags warning */}
                {(!data.summary.socialPreview.ogTitle || !data.summary.socialPreview.ogDescription || !data.summary.socialPreview.ogImage) && (
                  <div className="mt-4 px-4 py-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
                    <div className="flex items-start gap-2">
                      <svg className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      <div className="text-xs text-amber-300/80">
                        <span className="font-semibold">Missing tags: </span>
                        {[
                          !data.summary.socialPreview!.ogTitle && 'og:title',
                          !data.summary.socialPreview!.ogDescription && 'og:description',
                          !data.summary.socialPreview!.ogImage && 'og:image',
                        ].filter(Boolean).join(', ')}
                        {' — '}These should be added for optimal social sharing appearance.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Crawl Map — full variant only */}
            {isFull && renderCrawlMap && data.pages.length > 1 && renderCrawlMap(data.pages, data.normalizedUrl)}

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

            {/* Priority Action Matrix — Quick Wins — full variant only */}
            {isFull && (() => {
              const quickWins = data.issues
                .filter((i) =>
                  i.effort !== null && i.effort <= 2 && (i.severity === 'P0' || i.severity === 'P1' || i.severity === 'P2')
                )
                .sort((a, b) => {
                  const impactDiff = (b.impact ?? 0) - (a.impact ?? 0);
                  if (impactDiff !== 0) return impactDiff;
                  return (a.effort ?? 5) - (b.effort ?? 5);
                })
                .slice(0, 5);

              if (quickWins.length === 0) return null;

              return (
                <div className="bg-linear-to-br from-emerald-500/5 to-transparent border border-emerald-500/10 backdrop-blur-md rounded-3xl p-8 mb-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                      <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-sm font-medium text-white tracking-wide">Quick Wins</h2>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest">High impact, low effort fixes to do first</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {quickWins.map((issue, idx) => (
                      <button
                        key={issue.id}
                        type="button"
                        className="w-full text-left flex items-start gap-4 p-4 rounded-2xl bg-white/2 border border-white/4 hover:bg-white/4 hover:border-white/8 transition-all group cursor-pointer"
                        onClick={() => {
                          setExpandedIssues((prev) => {
                            const next = new Set(prev);
                            next.add(issue.id);
                            return next;
                          });
                          setTimeout(() => {
                            document.getElementById(`issue-${issue.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }, 100);
                        }}
                      >
                        <span className="text-sm font-bold text-emerald-500/40 group-hover:text-emerald-400 transition-colors mt-0.5">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <SeverityBadge severity={issue.severity} />
                            <h3 className="text-sm font-medium text-slate-200 truncate">{issue.title}</h3>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
                            <span>IMPACT: {issue.impact}/5</span>
                            <span>•</span>
                            <span>EFFORT: {issue.effort === 1 ? 'Quick fix' : 'Easy'}</span>
                          </div>
                        </div>
                        <svg className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors mt-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Search & Filter Bar */}
            <div className="mb-6 space-y-3 print:hidden">
              {/* Search input */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search issues..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 pl-10 text-sm text-white placeholder-gray-400 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                />
                <svg className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              {/* Filter pills */}
              <div className="flex flex-wrap gap-2">
                {/* Category filters */}
                {['all', ...new Set(sortedIssues.map((i) => i.category))].map((cat: string) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      selectedCategory === cat
                        ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30'
                        : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-300'
                    }`}
                  >
                    {cat === 'all' ? 'All Categories' : cat}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {/* Severity filters */}
                {['all', 'P1', 'P2', 'P3'].map((sev) => (
                  <button
                    key={sev}
                    onClick={() => setSelectedSeverity(sev)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      selectedSeverity === sev
                        ? sev === 'P1' ? 'bg-red-500/20 text-red-300 ring-1 ring-red-500/30'
                          : sev === 'P2' ? 'bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500/30'
                          : sev === 'P3' ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30'
                          : 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30'
                        : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-300'
                    }`}
                  >
                    {sev === 'all' ? 'All Severities' : sev === 'P1' ? '🔴 Critical' : sev === 'P2' ? '🟡 Warning' : '🔵 Info'}
                  </button>
                ))}
                {/* Group by page toggle */}
                <button
                  onClick={() => setGroupByPage(!groupByPage)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    groupByPage ? 'bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/30' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  {groupByPage ? '📄 Grouped by Page' : '📋 Flat List'}
                </button>
              </div>

              {/* Results count */}
              {(searchQuery || selectedCategory !== 'all' || selectedSeverity !== 'all') && (
                <p className="text-sm text-gray-400">
                  Showing {filteredIssues.length} of {sortedIssues.length} issues
                  {searchQuery && <button onClick={() => { setSearchQuery(''); setSelectedCategory('all'); setSelectedSeverity('all'); }} className="ml-2 text-blue-400 hover:text-blue-300">Clear filters</button>}
                </p>
              )}
            </div>

            {/* Issues list */}
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
                <div className="no-print print:hidden flex flex-wrap items-center gap-2">
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
                  {filteredIssues.map((issue, _idx) => {
                    const isExpanded = expandedIssues.has(issue.id);
                    const prevUrl = _idx > 0 ? ((filteredIssues[_idx - 1].evidence?.url as string) || 'General') : null;
                    const currentUrl = (issue.evidence?.url as string) || 'General';
                    const showGroupHeader = groupByPage && currentUrl !== prevUrl;
                    return (
                      <div key={issue.id} id={`issue-${issue.id}`} className="hover:bg-white/2 transition-colors duration-300 group">
                        {showGroupHeader && (
                          <div className="px-6 py-3 bg-purple-500/5 border-b border-purple-500/10 flex items-center justify-between">
                            <p className="text-xs font-mono text-purple-300 truncate">📄 {currentUrl}</p>
                            <span className="text-[10px] text-slate-500 shrink-0 ml-2">
                              {filteredIssues.filter(i => ((i.evidence?.url as string) || 'General') === currentUrl).length} issues
                            </span>
                          </div>
                        )}
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
                                    const isUrl = typeof value === 'string' && value.startsWith('http');
                                    // Render arrays of URLs as individual clickable links
                                    if (Array.isArray(value) && value.every((v: unknown) => typeof v === 'string' && (v as string).startsWith('http'))) {
                                      return (
                                        <div key={key}>
                                          <span className="text-slate-500 shrink-0">{key}:</span>
                                          <div className="ml-4 mt-1 space-y-1">
                                            {(value as string[]).map((url: string, i: number) => (
                                              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block text-emerald-400 hover:text-emerald-300 underline underline-offset-2 break-all transition-colors">
                                                {url}
                                              </a>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    }
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

            {/* Client Email Draft — full variant only */}
            {isFull && data.clientEmailDraft && (
              <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl overflow-hidden mb-20">
                <div className="px-8 py-6 border-b border-white/6 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-medium text-white tracking-wide">
                      Client Email Draft
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">Copy and send to your client — personalize the bracketed fields</p>
                  </div>
                  <button
                    onClick={handleCopyEmail}
                    className="no-print print:hidden px-5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 transition-all text-sm font-medium active:scale-95"
                  >
                    {emailCopied ? 'Copied!' : 'Copy Email'}
                  </button>
                </div>
                <div className="p-8">
                  <pre className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-sans max-w-3xl">
                    {data.clientEmailDraft}
                  </pre>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
