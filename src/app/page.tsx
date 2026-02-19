'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
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
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-8">
      {/* Hero */}
      <div className="max-w-2xl w-full text-center mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-6">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Free website audit
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 tracking-tight">
          Get your site&apos;s
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
            {' '}QA report{' '}
          </span>
          in 90 seconds
        </h1>
        <p className="text-lg text-slate-400 mb-8 max-w-xl mx-auto">
          SEO, accessibility, performance, broken links, and content issues — 
          prioritized and explained for you (and your clients).
        </p>
      </div>

      {/* URL Input Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-xl">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-5 py-4 rounded-xl bg-slate-800/50 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
              disabled={isLoading}
              required
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !url.trim()}
            className="px-8 py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/25"
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
          <p className="mt-4 text-red-400 text-sm text-center">{error}</p>
        )}
      </form>

      {/* Features grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-16 max-w-2xl w-full">
        {[
          { icon: '🔗', label: 'Broken Links' },
          { icon: '🔍', label: 'SEO Basics' },
          { icon: '♿', label: 'Accessibility' },
          { icon: '⚡', label: 'Performance' },
        ].map((feature) => (
          <div
            key={feature.label}
            className="flex flex-col items-center gap-2 p-4 rounded-xl bg-slate-800/30 border border-slate-700/50"
          >
            <span className="text-2xl">{feature.icon}</span>
            <span className="text-sm text-slate-400">{feature.label}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <footer className="mt-20 text-slate-500 text-sm">
        Built for freelancers & agencies
      </footer>
    </main>
  );
}
