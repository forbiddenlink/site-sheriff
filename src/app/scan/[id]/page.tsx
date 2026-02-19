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
    if (s >= 80) return '#10b981'; // emerald
    if (s >= 60) return '#f59e0b'; // amber
    return '#ef4444'; // red
  };

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          className="text-slate-700"
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
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-3xl font-bold text-white">{score}</span>
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    P0: 'bg-red-500/20 text-red-400 border-red-500/30',
    P1: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    P2: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    P3: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  };

  return (
    <span
      className={`px-2 py-0.5 text-xs font-medium rounded border ${colors[severity] || colors.P2}`}
    >
      {severity}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    SEO: 'bg-blue-500/20 text-blue-400',
    ACCESSIBILITY: 'bg-purple-500/20 text-purple-400',
    PERFORMANCE: 'bg-cyan-500/20 text-cyan-400',
    LINKS: 'bg-amber-500/20 text-amber-400',
    CONTENT: 'bg-emerald-500/20 text-emerald-400',
  };

  return (
    <span
      className={`px-2 py-0.5 text-xs font-medium rounded ${colors[category] || 'bg-slate-500/20 text-slate-400'}`}
    >
      {category}
    </span>
  );
}

export default function ScanPage() {
  const params = useParams();
  const id = params?.id as string;
  const [data, setData] = useState<ScanData | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Error</h1>
          <p className="text-slate-400 mb-6">{error}</p>
          <Link
            href="/"
            className="text-emerald-400 hover:text-emerald-300 underline"
          >
            ← Back to home
          </Link>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-pulse text-slate-400">Loading scan...</div>
      </main>
    );
  }

  const isComplete = data.status === 'SUCCEEDED';
  const isFailed = data.status === 'FAILED';
  const isRunning = data.status === 'QUEUED' || data.status === 'RUNNING';

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <Link
              href="/"
              className="text-slate-500 hover:text-slate-300 text-sm mb-2 inline-block"
            >
              ← New scan
            </Link>
            <h1 className="text-2xl font-bold text-white truncate max-w-lg">
              {data.inputUrl}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Started {new Date(data.createdAt).toLocaleString()}
            </p>
          </div>

          {isComplete && (
            <button className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors text-sm">
              Share Report
            </button>
          )}
        </div>

        {/* Progress / Running state */}
        {isRunning && (
          <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700/50 mb-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-emerald-400 animate-spin"
                  viewBox="0 0 24 24"
                >
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
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Scanning...
                </h2>
                <p className="text-slate-400 text-sm capitalize">
                  {data.progress.stage}
                  {data.progress.currentPage && ` • ${data.progress.currentPage}`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-4 rounded-xl bg-slate-900/50">
                <div className="text-2xl font-bold text-white">
                  {data.progress.pagesDiscovered}
                </div>
                <div className="text-sm text-slate-500">Pages found</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/50">
                <div className="text-2xl font-bold text-white">
                  {data.progress.pagesScanned}
                </div>
                <div className="text-sm text-slate-500">Pages scanned</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/50">
                <div className="text-2xl font-bold text-white">
                  {data.progress.checksCompleted}
                </div>
                <div className="text-sm text-slate-500">Checks run</div>
              </div>
            </div>
          </div>
        )}

        {/* Error state */}
        {isFailed && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-8 mb-8">
            <h2 className="text-lg font-semibold text-red-400 mb-2">
              Scan failed
            </h2>
            <p className="text-slate-300">{data.error || 'Unknown error'}</p>
          </div>
        )}

        {/* Results */}
        {isComplete && data.summary && (
          <>
            {/* Score hero */}
            <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700/50 mb-8">
              <div className="flex items-center gap-8">
                <ScoreRing score={data.summary.overallScore} />
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-white mb-4">
                    Overall Score
                  </h2>
                  <div className="grid grid-cols-5 gap-2">
                    {Object.entries(data.summary.categoryScores).map(
                      ([cat, score]) => (
                        <div key={cat} className="text-center">
                          <div className="text-lg font-bold text-white">
                            {score}
                          </div>
                          <div className="text-xs text-slate-500 capitalize">
                            {cat}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Issues list */}
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
              <div className="p-6 border-b border-slate-700/50">
                <h2 className="text-lg font-semibold text-white">
                  Issues ({data.issues.length})
                </h2>
              </div>

              {data.issues.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  No issues found! 🎉
                </div>
              ) : (
                <div className="divide-y divide-slate-700/50">
                  {data.issues.map((issue) => (
                    <div key={issue.id} className="p-4 hover:bg-slate-800/30">
                      <div className="flex items-start gap-3">
                        <SeverityBadge severity={issue.severity} />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white font-medium">
                            {issue.title}
                          </h3>
                          {issue.whyItMatters && (
                            <p className="text-slate-400 text-sm mt-1">
                              {issue.whyItMatters}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            <CategoryBadge category={issue.category} />
                            {issue.impact && (
                              <span className="text-xs text-slate-500">
                                Impact: {issue.impact}/5
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
