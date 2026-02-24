'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
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
    <main className="min-h-screen bg-[#030712] flex flex-col items-center justify-center p-8 overflow-hidden relative">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none" />
      {/* Hero Section Container */}
      <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-12 w-full max-w-6xl mb-16">
        {/* Hero Text content */}
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
            SEO, accessibility, performance, broken links, and content issues — 
            prioritized, isolated, and explained.
          </p>

          {/* URL Input Form */}
          <form onSubmit={handleSubmit} className="w-full">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <input
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
          </form>
        </div>

        {/* Hero Image */}
        <div className="relative lg:w-1/2 w-full max-w-lg aspect-square lg:aspect-auto lg:h-[600px] hidden sm:block">
          <div className="absolute inset-0 bg-emerald-500/10 rounded-3xl blur-3xl -z-10 mix-blend-screen" />
          <Image
            src="/hero-illustration.png"
            alt="SiteSheriff abstract app interface scan"
            fill
            className="object-contain drop-shadow-2xl hover:scale-105 transition-transform duration-700 ease-out"
            priority
          />
        </div>
      </div>

      {/* Features grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mt-16 max-w-4xl w-full z-10 relative">
        {[
          { icon: <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>, label: 'Broken Links', desc: 'Scan internal & external' },
          { icon: <svg className="w-8 h-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>, label: 'SEO Basics', desc: 'Meta & semantic checks' },
          { icon: <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>, label: 'Accessibility', desc: 'WCAG compliance test' },
          { icon: <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>, label: 'Performance', desc: 'Speed & asset loading' },
        ].map((feature) => (
          <div
            key={feature.label}
            className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-white/2 border border-white/6 backdrop-blur-md hover:bg-white/4 transition-colors duration-300"
          >
            <div className="mb-1 drop-shadow-md">{feature.icon}</div>
            <span className="text-sm font-medium text-slate-100">{feature.label}</span>
            <span className="text-xs text-slate-500 text-center">{feature.desc}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <footer className="mt-20 text-slate-500 text-xs font-mono z-10 relative uppercase tracking-widest">
        SYSTEM_STATUS: ONLINE
      </footer>
    </main>
  );
}
