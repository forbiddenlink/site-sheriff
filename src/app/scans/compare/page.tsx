'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { timeAgo } from '@/lib/utils';

interface ScanSummary {
  overallScore: number;
  categoryScores: Record<string, number>;
  issueCount: Record<string, number>;
  pagesCrawled: number;
  topIssues?: Array<{ code: string; title: string; severity: string; category: string; count: number }>;
  technologies?: Array<{ name: string; category: string }>;
}

interface ComparisonScan {
  id: string;
  inputUrl: string;
  normalizedUrl: string;
  summary: ScanSummary;
  createdAt: string;
}

interface CompareData {
  scanA: ComparisonScan;
  scanB: ComparisonScan;
}

const CATEGORY_LABELS: Record<string, string> = {
  seo: 'SEO',
  accessibility: 'Accessibility',
  performance: 'Performance',
  links: 'Links',
  content: 'Content',
  security: 'Security',
};

const SEVERITY_LABELS: Record<string, { label: string; color: string }> = {
  P0: { label: 'Critical', color: 'text-red-400' },
  P1: { label: 'Warning', color: 'text-amber-400' },
  P2: { label: 'Info', color: 'text-sky-400' },
  P3: { label: 'Low', color: 'text-slate-400' },
};

function ScoreCircle({ score, size = 100 }: { score: number; size?: number }) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;

  const color =
    score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-red-400';
  const strokeColor =
    score >= 80 ? 'stroke-emerald-400' : score >= 50 ? 'stroke-amber-400' : 'stroke-red-400';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" strokeWidth={strokeWidth}
          className="stroke-white/5"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" strokeWidth={strokeWidth}
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          className={`${strokeColor} transition-all duration-1000 ease-out`}
        />
      </svg>
      <span className={`absolute text-2xl font-black ${color}`}>{score}</span>
    </div>
  );
}

function DeltaBadge({ delta, suffix = '' }: { delta: number; suffix?: string }) {
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        +{delta}{suffix}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20">
        {delta}{suffix}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-500/10 text-slate-400 border border-slate-500/20">
      0{suffix}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 80
      ? 'from-emerald-500 to-emerald-400'
      : score >= 50
        ? 'from-amber-500 to-amber-400'
        : 'from-red-500 to-red-400';

  return (
    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700`}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

function CompareContent() {
  const searchParams = useSearchParams();
  const a = searchParams.get('a');
  const b = searchParams.get('b');

  const [data, setData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!a || !b) {
      setError('Two scan IDs are required for comparison.');
      setLoading(false);
      return;
    }

    fetch(`/api/scans/compare?a=${a}&b=${b}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to load comparison');
        }
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [a, b]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#030712] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading comparison…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#030712] flex items-center justify-center">
        <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl p-8 max-w-md text-center">
          <p className="text-red-400 font-medium mb-4">{error ?? 'Unknown error'}</p>
          <Link href="/scans" className="text-sm text-emerald-400 hover:underline">
            ← Back to scans
          </Link>
        </div>
      </div>
    );
  }

  const { scanA, scanB } = data;
  const summA = scanA.summary;
  const summB = scanB.summary;
  const overallDelta = summB.overallScore - summA.overallScore;

  const allCategories = Array.from(
    new Set([...Object.keys(summA.categoryScores), ...Object.keys(summB.categoryScores)])
  );

  const allSeverities = ['P0', 'P1', 'P2', 'P3'];

  return (
    <div className="min-h-screen bg-[#030712]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/scans"
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors mb-4"
          >
            ← Back to scans
          </Link>
          <h1 className="text-2xl font-bold text-white">Scan Comparison</h1>
          <p className="text-sm text-slate-500 mt-1">
            Comparing scans of{' '}
            <span className="text-slate-300">{scanA.inputUrl}</span>
          </p>
        </div>

        {/* Scan Labels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-2xl px-5 py-3 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Scan A — Older</span>
              <p className="text-xs text-slate-400 mt-0.5">{timeAgo(scanA.createdAt)}</p>
            </div>
            <Link href={`/scan/${scanA.id}`} className="text-xs text-emerald-400 hover:underline">
              View →
            </Link>
          </div>
          <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-2xl px-5 py-3 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Scan B — Newer</span>
              <p className="text-xs text-slate-400 mt-0.5">{timeAgo(scanB.createdAt)}</p>
            </div>
            <Link href={`/scan/${scanB.id}`} className="text-xs text-emerald-400 hover:underline">
              View →
            </Link>
          </div>
        </div>

        {/* Overall Score */}
        <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl p-8 mb-6">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 text-center">
            Overall Score
          </h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-16">
            <div className="flex flex-col items-center gap-2">
              <ScoreCircle score={summA.overallScore} size={120} />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Scan A</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <DeltaBadge delta={overallDelta} suffix=" pts" />
              <span className="text-[10px] text-slate-500">{overallDelta > 0 ? 'improved' : overallDelta < 0 ? 'regressed' : 'no change'}</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <ScoreCircle score={summB.overallScore} size={120} />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Scan B</span>
            </div>
          </div>
        </div>

        {/* Category Scores */}
        <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl p-8 mb-6">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">
            Category Scores
          </h2>
          <div className="space-y-4">
            {allCategories.map((cat) => {
              const scoreA = summA.categoryScores[cat] ?? 0;
              const scoreB = summB.categoryScores[cat] ?? 0;
              const delta = scoreB - scoreA;
              return (
                <div key={cat} className="grid grid-cols-[120px_1fr_50px_1fr_80px] sm:grid-cols-[140px_1fr_60px_1fr_90px] items-center gap-3">
                  <span className="text-sm text-slate-300 font-medium capitalize">
                    {CATEGORY_LABELS[cat] ?? cat}
                  </span>
                  <div className="flex items-center gap-2">
                    <ScoreBar score={scoreA} />
                    <span className="text-xs text-slate-400 w-8 text-right font-mono">{scoreA}</span>
                  </div>
                  <span className="text-center text-slate-600">vs</span>
                  <div className="flex items-center gap-2">
                    <ScoreBar score={scoreB} />
                    <span className="text-xs text-slate-400 w-8 text-right font-mono">{scoreB}</span>
                  </div>
                  <div className="flex justify-end">
                    <DeltaBadge delta={delta} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Issue Counts */}
        <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl p-8 mb-6">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">
            Issue Counts
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {allSeverities.map((sev) => {
              const countA = summA.issueCount?.[sev] ?? 0;
              const countB = summB.issueCount?.[sev] ?? 0;
              const delta = countB - countA;
              const { label, color } = SEVERITY_LABELS[sev] ?? { label: sev, color: 'text-slate-400' };
              // For issues, fewer is better — so flip the delta color
              const issueDelta = -delta;

              return (
                <div
                  key={sev}
                  className="bg-white/2 border border-white/6 rounded-2xl p-4 flex flex-col items-center gap-2"
                >
                  <span className={`text-xs font-bold uppercase tracking-wider ${color}`}>{label}</span>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-lg font-bold text-white">{countA}</p>
                      <p className="text-[10px] text-slate-500">A</p>
                    </div>
                    <span className="text-slate-600">→</span>
                    <div className="text-center">
                      <p className="text-lg font-bold text-white">{countB}</p>
                      <p className="text-[10px] text-slate-500">B</p>
                    </div>
                  </div>
                  <DeltaBadge delta={issueDelta} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Pages Crawled */}
        <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl p-8">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">
            Pages Crawled
          </h2>
          <div className="flex items-center justify-center gap-8">
            <div className="text-center">
              <p className="text-3xl font-bold text-white">{summA.pagesCrawled ?? '—'}</p>
              <p className="text-xs text-slate-500 mt-1">Scan A</p>
            </div>
            <span className="text-slate-600 text-lg">→</span>
            <div className="text-center">
              <p className="text-3xl font-bold text-white">{summB.pagesCrawled ?? '—'}</p>
              <p className="text-xs text-slate-500 mt-1">Scan B</p>
            </div>
            {summA.pagesCrawled != null && summB.pagesCrawled != null && (
              <DeltaBadge delta={summB.pagesCrawled - summA.pagesCrawled} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#030712] flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
        </div>
      }
    >
      <CompareContent />
    </Suspense>
  );
}
