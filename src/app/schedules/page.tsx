'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { timeAgo } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

interface Schedule {
  id: string;
  url: string;
  frequency: Frequency;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string;
  alertEmail: string | null;
  alertSlack: string | null;
  alertOnScoreDrop: number;
  alertOnNewP0: boolean;
  createdAt: string;
}

interface CreateFormState {
  url: string;
  frequency: Frequency;
  alertEmail: string;
  alertOnScoreDrop: number;
  alertOnNewP0: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getFrequencyClass(freq: Frequency): string {
  if (freq === 'DAILY') return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
  if (freq === 'WEEKLY') return 'bg-violet-500/10 text-violet-400 border-violet-500/20';
  return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
}

function getFrequencyLabel(freq: Frequency): string {
  if (freq === 'DAILY') return 'Daily';
  if (freq === 'WEEKLY') return 'Weekly';
  return 'Monthly';
}

function getEnabledClass(enabled: boolean): string {
  return enabled
    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    : 'bg-slate-500/10 text-slate-500 border-slate-500/20';
}

function formatNextRun(isoDate: string): string {
  const d = new Date(isoDate);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  if (diffMs < 0) return 'Overdue';
  const diffH = Math.floor(diffMs / 3_600_000);
  if (diffH < 24) return `in ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `in ${diffD}d`;
}

function displayUrl(raw: string): string {
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return u.hostname + (u.pathname === '/' ? '' : u.pathname);
  } catch {
    return raw;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Schedule Modal
// ─────────────────────────────────────────────────────────────────────────────

function CreateModal({
  onClose,
  onCreated,
}: Readonly<{ onClose: () => void; onCreated: (s: Schedule) => void }>) {
  const [form, setForm] = useState<CreateFormState>({
    url: '',
    frequency: 'WEEKLY',
    alertEmail: '',
    alertOnScoreDrop: 5,
    alertOnNewP0: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        url: form.url,
        frequency: form.frequency,
        alertOnScoreDrop: form.alertOnScoreDrop,
        alertOnNewP0: form.alertOnNewP0,
      };
      if (form.alertEmail.trim()) body.alertEmail = form.alertEmail.trim();

      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? 'Failed to create schedule');
      }

      const schedule: Schedule = await res.json();
      onCreated(schedule);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm open:flex"
      open
      aria-labelledby="create-modal-title"
    >
      <div className="w-full max-w-lg bg-[#0a0f1a] border border-white/10 rounded-3xl shadow-2xl p-8">
        <div className="flex items-center justify-between mb-8">
          <h2 id="create-modal-title" className="text-lg font-semibold text-white">
            New Scheduled Scan
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-500 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* URL */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2" htmlFor="s-url">
              URL to scan
            </label>
            <input
              id="s-url"
              type="url"
              required
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://example.com"
              className="w-full bg-white/4 border border-white/8 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
            />
          </div>

          {/* Frequency */}
          <fieldset>
            <legend className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
              Frequency
            </legend>
            <div className="flex gap-2">
              {(['DAILY', 'WEEKLY', 'MONTHLY'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setForm((s) => ({ ...s, frequency: f }))}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest border transition-all ${
                    form.frequency === f
                      ? getFrequencyClass(f)
                      : 'bg-white/2 text-slate-500 border-white/6 hover:bg-white/6 hover:text-slate-300'
                  }`}
                >
                  {getFrequencyLabel(f)}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Alert email */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2" htmlFor="s-email">
              Alert email <span className="text-slate-600 normal-case font-normal">(optional)</span>
            </label>
            <input
              id="s-email"
              type="email"
              value={form.alertEmail}
              onChange={(e) => setForm((f) => ({ ...f, alertEmail: e.target.value }))}
              placeholder="you@example.com"
              className="w-full bg-white/4 border border-white/8 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
            />
          </div>

          {/* Alert thresholds */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2" htmlFor="s-drop">
                Alert if score drops by
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="s-drop"
                  type="number"
                  min={1}
                  max={100}
                  value={form.alertOnScoreDrop}
                  onChange={(e) => setForm((f) => ({ ...f, alertOnScoreDrop: Number(e.target.value) }))}
                  className="w-20 bg-white/4 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                />
                <span className="text-xs text-slate-500">pts</span>
              </div>
            </div>

            <div className="flex flex-col justify-between">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2" htmlFor="s-p0">
                Alert on new P1 issues
              </label>
              <button
                id="s-p0"
                type="button"
                onClick={() => setForm((f) => ({ ...f, alertOnNewP0: !f.alertOnNewP0 }))}
                aria-pressed={form.alertOnNewP0 ? 'true' : 'false'}
                className={`w-12 h-6 rounded-full border transition-all relative ${
                  form.alertOnNewP0
                    ? 'bg-emerald-500/30 border-emerald-500/40'
                    : 'bg-white/4 border-white/10'
                }`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${
                  form.alertOnNewP0
                    ? 'left-6 bg-emerald-400'
                    : 'left-0.5 bg-slate-500'
                }`} />
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-white/4 border border-white/8 text-slate-300 hover:bg-white/8 transition-all text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 rounded-xl bg-[linear-gradient(to_bottom,var(--color-emerald-500),var(--color-emerald-600))] text-white font-medium hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 text-sm shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]"
            >
              {loading ? 'Creating...' : 'Create Schedule'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit Schedule Modal
// ─────────────────────────────────────────────────────────────────────────────

function EditModal({
  schedule,
  onClose,
  onUpdated,
  onDeleted,
}: Readonly<{
  schedule: Schedule;
  onClose: () => void;
  onUpdated: (s: Schedule) => void;
  onDeleted: (id: string) => void;
}>) {
  const [form, setForm] = useState({
    frequency: schedule.frequency,
    enabled: schedule.enabled,
    alertEmail: schedule.alertEmail ?? '',
    alertOnScoreDrop: schedule.alertOnScoreDrop,
    alertOnNewP0: schedule.alertOnNewP0,
  });
  const [loading, setLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        frequency: form.frequency,
        enabled: form.enabled,
        alertOnScoreDrop: form.alertOnScoreDrop,
        alertOnNewP0: form.alertOnNewP0,
      };
      if (form.alertEmail.trim()) {
        body.alertEmail = form.alertEmail.trim();
      } else {
        body.alertEmail = null;
      }

      const res = await fetch(`/api/schedules/${schedule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? 'Failed to update');
      }

      const updated: Schedule = await res.json();
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/schedules/${schedule.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error('Failed to delete');
      onDeleted(schedule.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      setDeleteLoading(false);
    }
  };

  return (
    <dialog
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm open:flex"
      open
      aria-labelledby="edit-modal-title"
    >
      <div className="w-full max-w-lg bg-[#0a0f1a] border border-white/10 rounded-3xl shadow-2xl p-8">
        <div className="flex items-center justify-between mb-2">
          <h2 id="edit-modal-title" className="text-lg font-semibold text-white">
            Edit Schedule
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-xs font-mono text-slate-500 mb-8 truncate">{schedule.url}</p>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Enable/Disable toggle */}
          <div className="flex items-center justify-between p-4 bg-white/2 border border-white/6 rounded-xl">
            <span className="text-sm text-slate-300 font-medium">Schedule enabled</span>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
              aria-pressed={form.enabled ? 'true' : 'false'}
              className={`w-12 h-6 rounded-full border transition-all relative ${
                form.enabled
                  ? 'bg-emerald-500/30 border-emerald-500/40'
                  : 'bg-white/4 border-white/10'
              }`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${
                form.enabled ? 'left-6 bg-emerald-400' : 'left-0.5 bg-slate-500'
              }`} />
            </button>
          </div>

          {/* Frequency */}
          <fieldset>
            <legend className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
              Frequency
            </legend>
            <div className="flex gap-2">
              {(['DAILY', 'WEEKLY', 'MONTHLY'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setForm((s) => ({ ...s, frequency: f }))}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest border transition-all ${
                    form.frequency === f
                      ? getFrequencyClass(f)
                      : 'bg-white/2 text-slate-500 border-white/6 hover:bg-white/6 hover:text-slate-300'
                  }`}
                >
                  {getFrequencyLabel(f)}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Alert email */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2" htmlFor="e-email">
              Alert email <span className="text-slate-600 normal-case font-normal">(optional)</span>
            </label>
            <input
              id="e-email"
              type="email"
              value={form.alertEmail}
              onChange={(e) => setForm((f) => ({ ...f, alertEmail: e.target.value }))}
              placeholder="you@example.com"
              className="w-full bg-white/4 border border-white/8 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
            />
          </div>

          {/* Alert thresholds */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2" htmlFor="e-drop">
                Alert if score drops by
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="e-drop"
                  type="number"
                  min={1}
                  max={100}
                  value={form.alertOnScoreDrop}
                  onChange={(e) => setForm((f) => ({ ...f, alertOnScoreDrop: Number(e.target.value) }))}
                  className="w-20 bg-white/4 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                />
                <span className="text-xs text-slate-500">pts</span>
              </div>
            </div>

            <div className="flex flex-col justify-between">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2" htmlFor="e-p0">
                Alert on new P1 issues
              </label>
              <button
                id="e-p0"
                type="button"
                onClick={() => setForm((f) => ({ ...f, alertOnNewP0: !f.alertOnNewP0 }))}
                aria-pressed={form.alertOnNewP0 ? 'true' : 'false'}
                className={`w-12 h-6 rounded-full border transition-all relative ${
                  form.alertOnNewP0
                    ? 'bg-emerald-500/30 border-emerald-500/40'
                    : 'bg-white/4 border-white/10'
                }`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${
                  form.alertOnNewP0 ? 'left-6 bg-emerald-400' : 'left-0.5 bg-slate-500'
                }`} />
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={deleteLoading}
              className="px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/20 text-red-400 hover:bg-red-500/16 transition-all text-sm font-medium disabled:opacity-50"
            >
              {deleteLoading ? 'Deleting...' : 'Delete'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-white/4 border border-white/8 text-slate-300 hover:bg-white/8 transition-all text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 rounded-xl bg-[linear-gradient(to_bottom,var(--color-emerald-500),var(--color-emerald-600))] text-white font-medium hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 text-sm shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Delete confirmation overlay */}
      {confirmDelete && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm rounded-3xl">
          <div className="bg-[#0a0f1a] border border-red-500/20 rounded-2xl p-6 max-w-sm w-full text-center">
            <p className="text-slate-200 font-medium mb-2">Delete this schedule?</p>
            <p className="text-slate-500 text-sm mb-6">This will stop all future scans for this URL. Existing scan results are preserved.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/4 border border-white/8 text-slate-300 hover:bg-white/8 transition-all text-sm"
              >
                Keep it
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 transition-all text-sm font-medium"
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingSchedule = useMemo(
    () => schedules.find((s) => s.id === editingId) ?? null,
    [schedules, editingId],
  );

  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        const res = await fetch('/api/schedules');
        if (!res.ok) throw new Error('Failed to load schedules');
        const data = await res.json();
        setSchedules(data.schedules ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    fetchSchedules();
  }, []);

  const handleCreated = (s: Schedule) => {
    setSchedules((prev) => [s, ...prev]);
    setShowCreate(false);
  };

  const handleUpdated = (s: Schedule) => {
    setSchedules((prev) => prev.map((x) => (x.id === s.id ? s : x)));
    setEditingId(null);
  };

  const handleDeleted = (id: string) => {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    setEditingId(null);
  };

  const activeCount = schedules.filter((s) => s.enabled).length;

  return (
    <>
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
                Scheduled Scans
              </h1>
              <p className="text-slate-500 text-xs font-mono mt-2">
                TOTAL: {schedules.length} · ACTIVE: {activeCount}
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="px-6 py-3 rounded-xl bg-[linear-gradient(to_bottom,var(--color-emerald-500),var(--color-emerald-600))] text-white font-medium hover:opacity-90 transition-all duration-150 active:scale-95 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] text-sm text-center"
            >
              + New Schedule
            </button>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              <div className="text-xs font-mono text-slate-500 tracking-widest uppercase mt-4">Loading schedules...</div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-3xl p-8 backdrop-blur-md text-center">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && schedules.length === 0 && (
            <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl p-16 text-center">
              <svg className="w-12 h-12 text-slate-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-lg font-medium text-slate-300 mb-2">No schedules yet</h2>
              <p className="text-slate-500 text-sm mb-6">
                Set up automated scans to monitor your sites over time and get alerted when scores drop.
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="px-6 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all text-sm font-medium"
              >
                Create your first schedule
              </button>
            </div>
          )}

          {/* Schedule list */}
          {!loading && schedules.length > 0 && (
            <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl overflow-hidden">
              <div className="divide-y divide-white/4">
                {schedules.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-4 p-6 hover:bg-white/2 transition-colors duration-200 group"
                  >
                    {/* Enabled dot */}
                    <div className="shrink-0">
                      <span className={`w-2 h-2 rounded-full inline-block ${s.enabled ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-slate-600'}`} />
                    </div>

                    {/* URL + meta */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors">
                        {displayUrl(s.url)}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs font-mono text-slate-500 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-widest ${getFrequencyClass(s.frequency)}`}>
                          {getFrequencyLabel(s.frequency)}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-widest ${getEnabledClass(s.enabled)}`}>
                          {s.enabled ? 'Active' : 'Paused'}
                        </span>
                        <span>·</span>
                        <span>Next: {formatNextRun(s.nextRunAt)}</span>
                        {s.lastRunAt && (
                          <>
                            <span>·</span>
                            <span>Last: {timeAgo(s.lastRunAt)}</span>
                          </>
                        )}
                        {s.alertEmail && (
                          <>
                            <span>·</span>
                            <span className="text-slate-600 truncate max-w-32">{s.alertEmail}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Alert badges */}
                    <div className="hidden sm:flex items-center gap-2 shrink-0">
                      {s.alertOnNewP0 && (
                        <span className="px-2 py-0.5 rounded-full bg-red-500/8 border border-red-500/15 text-[10px] font-bold text-red-400 uppercase tracking-widest">
                          P1 alerts
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full bg-white/4 border border-white/8 text-[10px] font-mono text-slate-500">
                        −{s.alertOnScoreDrop}pts
                      </span>
                    </div>

                    {/* Edit button */}
                    <button
                      onClick={() => setEditingId(s.id)}
                      aria-label={`Edit schedule for ${s.url}`}
                      className="shrink-0 p-2 rounded-xl bg-white/0 border border-transparent text-slate-600 hover:bg-white/6 hover:border-white/8 hover:text-slate-300 transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info box */}
          {!loading && (
            <div className="mt-8 p-6 bg-white/1 border border-white/4 rounded-2xl">
              <p className="text-xs font-mono text-slate-500 leading-relaxed">
                <span className="text-slate-400 font-bold">HOW IT WORKS:</span> Scheduled scans run automatically via cron at 6 AM UTC.
                Daily scans run every day · Weekly scans run every Monday · Monthly scans run on the 1st.
                Alerts are sent via email when your score drops or new critical issues are detected.
              </p>
            </div>
          )}

          {/* Footer */}
          <footer className="mt-16 pt-8 border-t border-white/6 flex items-center justify-center gap-4 text-xs font-mono">
            <Link href="/scans" className="text-slate-500 hover:text-emerald-400 transition-colors">
              Scan History
            </Link>
            <span className="text-slate-700">·</span>
            <Link href="/privacy" className="text-slate-500 hover:text-emerald-400 transition-colors">
              Privacy
            </Link>
          </footer>
        </div>
      </main>

      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}

      {editingSchedule && (
        <EditModal
          schedule={editingSchedule}
          onClose={() => setEditingId(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}
