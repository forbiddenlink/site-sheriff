'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { ScanData } from '@/components/scan-results';
import { getEffortLabel } from '@/components/scan-results';

const SEV_LABELS: Record<string, string> = { P0: 'Critical', P1: 'High', P2: 'Medium', P3: 'Low' };
const SEV_COLORS: Record<string, string> = { P0: '#ef4444', P1: '#f97316', P2: '#f59e0b', P3: '#10b981' };

export default function PrintPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<ScanData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [didPrint, setDidPrint] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/scan/${id}`)
      .then((r) => r.json())
      .then((d: ScanData) => {
        if (d.status !== 'SUCCEEDED') {
          setError('Scan not complete yet. Please wait and try again.');
          return;
        }
        setData(d);
      })
      .catch(() => setError('Failed to load scan data.'));
  }, [id]);

  useEffect(() => {
    if (data && !didPrint) {
      setDidPrint(true);
      setTimeout(() => window.print(), 600);
    }
  }, [data, didPrint]);

  if (error) {
    return <div style={{ padding: 32, color: '#dc2626', fontFamily: 'sans-serif' }}>{error}</div>;
  }

  if (!data) {
    return (
      <div style={{ padding: 32, color: '#94a3b8', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: '2px solid #94a3b8', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
        Loading report&hellip;
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const { summary, issues, inputUrl, createdAt } = data;
  const score = summary?.overallScore ?? 0;

  const groups = ['P0', 'P1', 'P2', 'P3'].map((key) => ({
    key,
    items: issues.filter((i) => i.severity === key),
  })).filter((g) => g.items.length > 0);

  const quickWins = issues.filter((i) => i.effort !== null && i.effort <= 2 && (i.severity === 'P0' || i.severity === 'P1' || i.severity === 'P2'));
  const critical = issues.filter((i) => i.severity === 'P0' || i.severity === 'P1').length;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #fff; color: #111; }
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          h2 { break-after: avoid; }
          .issue-block { break-inside: avoid; }
          .section { break-inside: avoid; }
        }
      `}</style>

      <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 860, margin: '0 auto', padding: '40px 32px', color: '#111', background: '#fff', minHeight: '100vh' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, paddingBottom: 20, borderBottom: '2px solid #e2e8f0' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 3, color: '#94a3b8', marginBottom: 6 }}>Site Sheriff</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#0f172a' }}>Website Audit Report</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0', wordBreak: 'break-all' }}>{inputUrl}</p>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: '#94a3b8', flexShrink: 0, marginLeft: 24 }}>
            <div style={{ fontWeight: 600, color: '#475569' }}>
              {new Date(createdAt + 'Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <div style={{ marginTop: 2 }}>site-sheriff.vercel.app</div>
          </div>
        </div>

        {/* Score + Category breakdown */}
        <div className="section" style={{ display: 'flex', gap: 24, marginBottom: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ textAlign: 'center', padding: '20px 28px', border: '2px solid #e2e8f0', borderRadius: 12, borderColor: score >= 80 ? '#d1fae5' : score >= 50 ? '#fef3c7' : '#fee2e2' }}>
            <div style={{ fontSize: 60, fontWeight: 800, color: score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444', lineHeight: 1 }}>{score}</div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: '#94a3b8', marginTop: 6 }}>Overall Score</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: 1 }}>
            {Object.entries(summary?.categoryScores ?? {}).map(([cat, catScore]) => (
              <div key={cat} style={{ padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: 8, minWidth: 80, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: catScore >= 80 ? '#10b981' : catScore >= 50 ? '#f59e0b' : '#ef4444' }}>{catScore}</div>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: '#94a3b8', marginTop: 3 }}>{cat}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
          {[
            { label: 'Pages Crawled', value: data.pages.length, alert: false },
            { label: 'Total Issues', value: issues.length, alert: false },
            { label: 'Critical / High', value: critical, alert: critical > 0 },
            { label: 'Quick Wins', value: quickWins.length, alert: false },
          ].map((stat) => (
            <div key={stat.label} style={{ padding: '12px 20px', border: `1px solid ${stat.alert ? '#fecaca' : '#e2e8f0'}`, borderRadius: 8, background: stat.alert ? '#fef2f2' : '#f8fafc', minWidth: 110 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: stat.alert ? '#ef4444' : '#0f172a' }}>{stat.value}</div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: '#94a3b8', marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Quick wins callout */}
        {quickWins.length > 0 && (
          <div className="section" style={{ marginBottom: 32, padding: '16px 20px', border: '1px solid #d1fae5', borderRadius: 10, background: '#f0fdf4' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: '#10b981', marginBottom: 10 }}>
              Quick Wins — Start Here ({quickWins.length})
            </div>
            {quickWins.slice(0, 5).map((issue, idx) => (
              <div key={issue.id} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981', minWidth: 16 }}>{idx + 1}.</span>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{issue.title}</span>
                  <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>
                    [{issue.severity}] · Effort: {getEffortLabel(issue.effort ?? 3)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Issues by severity group */}
        {groups.map(({ key, items }) => (
          <div key={key} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: SEV_COLORS[key], marginBottom: 12, paddingBottom: 8, borderBottom: `2px solid ${SEV_COLORS[key]}30`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ padding: '3px 10px', background: `${SEV_COLORS[key]}12`, borderRadius: 999, border: `1px solid ${SEV_COLORS[key]}30` }}>
                {SEV_LABELS[key]}
              </span>
              <span>{items.length} issue{items.length === 1 ? '' : 's'}</span>
            </h2>
            {items.map((issue) => (
              <div key={issue.id} className="issue-block" style={{ marginBottom: 12, padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fafafa' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: SEV_COLORS[key], padding: '2px 8px', background: `${SEV_COLORS[key]}15`, borderRadius: 999, border: `1px solid ${SEV_COLORS[key]}25` }}>{key}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#64748b', padding: '2px 8px', background: '#f1f5f9', borderRadius: 999, border: '1px solid #e2e8f0' }}>{issue.category}</span>
                  {issue.effort !== null && (
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#94a3b8', padding: '2px 8px', background: '#f8fafc', borderRadius: 999, border: '1px solid #e2e8f0' }}>
                      {getEffortLabel(issue.effort)} fix
                    </span>
                  )}
                  <strong style={{ fontSize: 13, color: '#0f172a', flex: 1 }}>{issue.title}</strong>
                </div>
                {issue.whyItMatters && (
                  <p style={{ fontSize: 12, color: '#475569', margin: '0 0 6px', lineHeight: 1.5 }}>{issue.whyItMatters}</p>
                )}
                {issue.howToFix && (
                  <p style={{ fontSize: 12, color: '#334155', margin: 0, lineHeight: 1.5 }}>
                    <strong style={{ color: '#0f172a' }}>Fix: </strong>{issue.howToFix}
                  </p>
                )}
                {typeof issue.evidence?.url === 'string' && issue.evidence.url ? (
                  <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0', fontFamily: 'monospace' }}>
                    {issue.evidence.url}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ))}

        {/* Footer */}
        <div style={{ marginTop: 48, paddingTop: 16, borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
          <span>Generated by Site Sheriff &mdash; site-sheriff.vercel.app</span>
          <span>{issues.length} issues, {data.pages.length} pages, score {score}/100</span>
        </div>
      </div>

      {/* Floating action buttons (hidden on print) */}
      <div className="no-print" style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={() => window.history.back()}
          style={{ padding: '10px 20px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          style={{ padding: '10px 20px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}
        >
          Print / Save PDF
        </button>
      </div>
    </>
  );
}
