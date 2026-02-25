'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ScanRow {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  inputUrl: string;
  normalizedUrl: string;
  summary: {
    overallScore: number;
    pagesCrawled: number;
    issueCount: Record<string, number>;
    scanDurationMs: number;
  } | null;
  createdAt: string;
  error: string | null;
}

function timeAgo(dateStr: string): string {
  const utcDate = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z';
  const seconds = Math.floor((Date.now() - new Date(utcDate).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ScorePill({ score }: { score: number }) {
  const color =
    score >= 80
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      : score >= 50
        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
        : 'bg-red-500/10 text-red-400 border-red-500/20';

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-sm font-bold rounded-full border ${color}`}>
      {score}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    QUEUED: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    RUNNING: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    FAILED: 'bg-red-500/10 text-red-400 border-red-500/20',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold uppercase tracking-widest rounded-full border ${styles[status] ?? styles.QUEUED}`}>
      {status === 'RUNNING' && (
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
      )}
      {status}
    </span>
  );
}

export default function ScansPage() {
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchScans = async () => {
      try {
        const res = await fetch('/api/scan?limit=50');
        if (!res.ok) throw new Error('Failed to load scans');
        const data = await res.json();
        setScans(data.scans ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    fetchScans();
  }, []);

  return (
    <main className="min-h-screen bg-[#030712] p-8 lg:p-12 selection:bg-emerald-500/30">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-12">
          <div>
            <Link
              href="/"
              className="text-slate-500 hover:text-white transition-colors text-xs font-mono uppercase tracking-widest mb-4 inline-block"
            >
              ← System core
            </Link>
            <h1 className="text-3xl font-semibold text-white tracking-tight">
              Scan History
            </h1>
            <p className="text-slate-500 text-xs font-mono mt-2">
              TOTAL_SCANS: {scans.length}
            </p>
          </div>
          <Link
            href="/"
            className="px-6 py-3 rounded-xl bg-[linear-gradient(to_bottom,var(--color-emerald-500),var(--color-emerald-600))] text-white font-medium hover:bg-[linear-gradient(to_bottom,var(--color-emerald-400),var(--color-emerald-500))] transition-all duration-150 active:scale-95 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] text-sm text-center"
          >
            New Scan
          </Link>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <div className="text-xs font-mono text-slate-500 tracking-widest uppercase mt-4">Loading scans...</div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-3xl p-8 backdrop-blur-md text-center">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && scans.length === 0 && (
          <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl p-16 text-center">
            <svg className="w-12 h-12 text-slate-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h2 className="text-lg font-medium text-slate-300 mb-2">No scans yet</h2>
            <p className="text-slate-500 text-sm mb-6">Run your first scan to see results here.</p>
            <Link
              href="/"
              className="px-6 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all text-sm font-medium"
            >
              Start a Scan
            </Link>
          </div>
        )}

        {/* Scan list */}
        {!loading && scans.length > 0 && (
          <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl overflow-hidden">
            <div className="divide-y divide-white/4">
              {scans.map((scan) => (
                <Link
                  key={scan.id}
                  href={`/scan/${scan.id}`}
                  className="flex items-center gap-4 p-6 hover:bg-white/2 transition-colors duration-300 group"
                >
                  {/* Score or status */}
                  <div className="w-16 shrink-0 flex justify-center">
                    {scan.status === 'SUCCEEDED' && scan.summary ? (
                      <ScorePill score={scan.summary.overallScore} />
                    ) : (
                      <StatusPill status={scan.status} />
                    )}
                  </div>

                  {/* URL + details */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors">
                      {scan.inputUrl}
                    </h3>
                    <div className="flex items-center gap-4 mt-1.5 text-xs font-mono text-slate-500">
                      <span>{timeAgo(scan.createdAt)}</span>
                      {scan.summary && (
                        <>
                          <span>•</span>
                          <span>{scan.summary.pagesCrawled} pages</span>
                          <span>•</span>
                          <span>{Object.values(scan.summary.issueCount).reduce((a: number, b: number) => a + b, 0)} issues</span>
                          <span>•</span>
                          <span>{(scan.summary.scanDurationMs / 1000).toFixed(1)}s</span>
                        </>
                      )}
                      {scan.error && (
                        <>
                          <span>•</span>
                          <span className="text-red-400 truncate max-w-48">{scan.error}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Arrow */}
                  <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
