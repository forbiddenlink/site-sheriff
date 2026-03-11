'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { timeAgo } from '@/lib/utils';

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

interface UrlGroup {
  normalizedUrl: string;
  displayUrl: string;
  scans: ScanRow[];
  latestScan: ScanRow;
  scores: number[];
}

const SCORE_COLOR_LEVELS = [
  { min: 80, spark: '#34d399', pill: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  { min: 50, spark: '#fbbf24', pill: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
] as const;

const LOW_SCORE_COLORS = { spark: '#f87171', pill: 'bg-red-500/10 text-red-400 border-red-500/20' } as const;

function getSparkColor(score: number): string {
  return SCORE_COLOR_LEVELS.find((l) => score >= l.min)?.spark ?? LOW_SCORE_COLORS.spark;
}

function getScorePillClass(score: number): string {
  return SCORE_COLOR_LEVELS.find((l) => score >= l.min)?.pill ?? LOW_SCORE_COLORS.pill;
}

function getDeltaClass(delta: number): string {
  if (delta > 0) return 'text-emerald-400';
  if (delta < 0) return 'text-red-400';
  return 'text-slate-500';
}

function MiniSparkline({ scores }: Readonly<{ scores: number[] }>) {
  if (scores.length < 2) return null;
  const w = 80;
  const h = 28;
  const pad = 3;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;
  const xs = scores.map((_, i) => pad + (i / (scores.length - 1)) * (w - pad * 2));
  const ys = scores.map((s) => h - pad - ((s - min) / range) * (h - pad * 2));
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const last = scores.at(-1) ?? 0;
  const color = getSparkColor(last);
  const lastX = xs.at(-1) ?? 0;
  const lastY = ys.at(-1) ?? 0;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="2.5" fill={color} />
    </svg>
  );
}

function ScorePill({ score, large }: Readonly<{ score: number; large?: boolean }>) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-bold ${large ? 'px-4 py-1.5 text-2xl' : 'px-3 py-1 text-sm'} ${getScorePillClass(score)}`}>
      {score}
    </span>
  );
}

function StatusPill({ status }: Readonly<{ status: string }>) {
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

  const groups = useMemo<UrlGroup[]>(() => {
    const map = new Map<string, ScanRow[]>();
    for (const scan of scans) {
      const key = scan.normalizedUrl || scan.inputUrl;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(scan);
    }
    return [...map.entries()]
      .map(([normalizedUrl, rows]) => {
        const sorted = [...rows].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        const latestScan = sorted.at(-1)!;
        const scores = sorted
          .filter((s) => s.status === 'SUCCEEDED' && s.summary)
          .map((s) => s.summary!.overallScore);
        let displayUrl = normalizedUrl;
        try {
          const u = new URL(normalizedUrl.startsWith('http') ? normalizedUrl : `https://${normalizedUrl}`);
          displayUrl = u.hostname + (u.pathname === '/' ? '' : u.pathname);
        } catch {
          // keep raw
        }
        return { normalizedUrl, displayUrl, scans: sorted.toReversed(), latestScan, scores };
      })
      .sort(
        (a, b) =>
          new Date(b.latestScan.createdAt).getTime() - new Date(a.latestScan.createdAt).getTime(),
      );
  }, [scans]);

  const trackedCount = groups.length;
  const totalScans = scans.length;

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
              TRACKED_SITES: {trackedCount} · TOTAL_SCANS: {totalScans}
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

        {/* Grouped URL cards */}
        {!loading && groups.length > 0 && (
          <div className="space-y-4">
            {groups.map((group) => {
              const latestScore =
                group.latestScan.status === 'SUCCEEDED' && group.latestScan.summary
                  ? group.latestScan.summary.overallScore
                  : null;
              const scoreDelta =
                group.scores.length >= 2
                  ? (group.scores.at(-1) ?? 0) - (group.scores.at(-2) ?? 0)
                  : null;
              const deltaClass = scoreDelta === null ? '' : getDeltaClass(scoreDelta);
              let deltaText = '';
              if (scoreDelta !== null) {
                deltaText = scoreDelta > 0 ? `+${scoreDelta}` : String(scoreDelta);
              }

              return (
                <div
                  key={group.normalizedUrl}
                  className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl overflow-hidden"
                >
                  {/* URL group header */}
                  <div className="flex items-center gap-4 p-6 border-b border-white/4">
                    {/* Score + sparkline */}
                    <div className="flex items-center gap-3 shrink-0">
                      {latestScore === null ? (
                        <StatusPill status={group.latestScan.status} />
                      ) : (
                        <ScorePill score={latestScore} large />
                      )}
                      {group.scores.length >= 2 && (
                        <MiniSparkline scores={group.scores} />
                      )}
                    </div>

                    {/* URL info */}
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-medium text-slate-200 truncate">
                        {group.displayUrl}
                      </h2>
                      <div className="flex items-center gap-3 mt-1 text-xs font-mono text-slate-500">
                        <span>Last scanned {timeAgo(group.latestScan.createdAt)}</span>
                        <span>·</span>
                        <span>{group.scans.length} scan{group.scans.length === 1 ? '' : 's'}</span>
                        {scoreDelta !== null && (
                          <>
                            <span>·</span>
                            <span className={deltaClass}>
                              {deltaText} vs prev
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* View latest */}
                    <Link
                      href={`/scan/${group.latestScan.id}`}
                      className="shrink-0 px-4 py-2 rounded-xl bg-white/4 border border-white/8 text-slate-300 hover:text-white hover:bg-white/8 transition-all text-xs font-medium"
                    >
                      View latest
                    </Link>
                  </div>

                  {/* Individual scan rows */}
                  <div className="divide-y divide-white/4">
                    {group.scans.slice(0, 5).map((scan) => (
                      <Link
                        key={scan.id}
                        href={`/scan/${scan.id}`}
                        className="flex items-center gap-4 px-6 py-3.5 hover:bg-white/2 transition-colors duration-200 group"
                      >
                        {/* Score or status */}
                        <div className="w-14 shrink-0 flex justify-center">
                          {scan.status === 'SUCCEEDED' && scan.summary ? (
                            <ScorePill score={scan.summary.overallScore} />
                          ) : (
                            <StatusPill status={scan.status} />
                          )}
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-4 text-xs font-mono text-slate-500">
                            <span>{timeAgo(scan.createdAt)}</span>
                            {scan.summary && (
                              <>
                                <span>·</span>
                                <span>{scan.summary.pagesCrawled} pages</span>
                                <span>·</span>
                                <span>{Object.values(scan.summary.issueCount).reduce((a: number, b: number) => a + b, 0)} issues</span>
                                <span>·</span>
                                <span>{(scan.summary.scanDurationMs / 1000).toFixed(1)}s</span>
                              </>
                            )}
                            {scan.error && (
                              <>
                                <span>·</span>
                                <span className="text-red-400 truncate max-w-48">{scan.error}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Arrow */}
                        <svg className="w-3.5 h-3.5 text-slate-700 group-hover:text-slate-500 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    ))}
                    {group.scans.length > 5 && (
                      <div className="px-6 py-3 text-xs font-mono text-slate-600 text-center">
                        +{group.scans.length - 5} older scans
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-white/6 flex items-center justify-center gap-4 text-xs font-mono">
          <Link
            href="/schedules"
            className="text-slate-500 hover:text-emerald-400 transition-colors"
          >
            Schedules
          </Link>
          <span className="text-slate-700">·</span>
          <a
            href="https://github.com/forbiddenlink/site-sheriff/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 hover:text-emerald-400 transition-colors"
          >
            Contact
          </a>
          <span className="text-slate-700">·</span>
          <Link
            href="/privacy"
            className="text-slate-500 hover:text-emerald-400 transition-colors"
          >
            Privacy
          </Link>
        </footer>
      </div>
    </main>
  );
}
