'use client';

import { useState, useEffect } from 'react';

interface EmailGateProps {
  onUnlock: () => void;
  score?: number;
}

const EMAIL_STORAGE_KEY = 'site-sheriff-email';

export function EmailGate({ onUnlock, score }: EmailGateProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // Check if user already has email stored
  useEffect(() => {
    const storedEmail = localStorage.getItem(EMAIL_STORAGE_KEY);
    if (storedEmail) {
      // Verify the email is still valid
      verifyEmail(storedEmail);
    } else {
      setChecking(false);
    }
  }, []);

  const verifyEmail = async (emailToVerify: string) => {
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToVerify }),
      });
      const data = await res.json();

      if (data.success && data.lead.scansUnlocked > 0) {
        // Decrement usage
        await fetch('/api/lead', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailToVerify }),
        });
        onUnlock();
      } else if (data.error === 'limit_reached') {
        setError('You have used all 3 free scans. Upgrade to Pro for unlimited access.');
        localStorage.removeItem(EMAIL_STORAGE_KEY);
        setChecking(false);
      } else {
        setChecking(false);
      }
    } catch {
      setChecking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();

      if (data.success) {
        if (data.lead.scansUnlocked > 0) {
          localStorage.setItem(EMAIL_STORAGE_KEY, email.trim());
          // Decrement usage
          await fetch('/api/lead', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim() }),
          });
          onUnlock();
        } else {
          setError('You have used all 3 free scans. Upgrade to Pro for unlimited access.');
        }
      } else {
        setError(data.error || 'Something went wrong');
      }
    } catch {
      setError('Failed to process request');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-pulse text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white/2 border border-white/10 backdrop-blur-md rounded-3xl p-8 text-center">
          {/* Score preview */}
          {score !== undefined && (
            <div className="mb-8">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/30 mb-4">
                <span className="text-4xl font-bold text-emerald-400">{score}</span>
              </div>
              <p className="text-slate-400 text-sm">Your site scored {score}/100</p>
            </div>
          )}

          <h2 className="text-2xl font-bold text-white mb-2">
            Unlock Your Full Report
          </h2>
          <p className="text-slate-400 mb-6">
            Enter your email to access detailed insights, code fixes, and recommendations.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
              required
            />

            {error && (
              <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Processing...' : 'Get Full Report'}
            </button>
          </form>

          <p className="text-xs text-slate-500 mt-4">
            Free: 3 reports/month. No spam, unsubscribe anytime.
          </p>

          <div className="mt-8 pt-6 border-t border-white/10">
            <p className="text-slate-500 text-sm mb-3">Want unlimited reports?</p>
            <a
              href="#pricing"
              className="text-emerald-400 hover:text-emerald-300 text-sm font-medium"
            >
              Upgrade to Pro - $49/mo
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
