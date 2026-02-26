import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Contact Site Sheriff — Get Support & Report Issues',
  description: 'Contact the Site Sheriff team for support, bug reports, feature requests, or general inquiries. We respond to all GitHub issues within 48 hours.',
};

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 px-4 py-16">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/"
          className="text-slate-500 hover:text-white transition-colors text-xs font-mono uppercase tracking-widest mb-8 inline-block"
        >
          ← Back to Site Sheriff
        </Link>

        <h1 className="text-3xl font-bold mb-8">Contact Us</h1>

        <div className="space-y-8 text-slate-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">Get in Touch</h2>
            <p className="mb-4">
              We love hearing from our users! Whether you have a question, found a bug, or want to suggest a feature, there are several ways to reach us.
            </p>
            <p>
              Site Sheriff is a solo project, so response times may vary. That said, I read every message and appreciate feedback that helps improve the tool.
            </p>
          </section>

          <section className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
              GitHub Issues (Recommended)
            </h2>
            <p className="mb-4">
              For bug reports, feature requests, and technical questions, please open an issue on our GitHub repository. This is the fastest way to get a response.
            </p>
            <a
              href="https://github.com/forbiddenlink/site-sheriff/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all text-sm font-medium"
            >
              Open an Issue
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">Response Time</h2>
            <p>
              We aim to respond to all inquiries within 48 hours. For urgent security issues, please include &quot;SECURITY&quot; in your issue title for priority handling.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">What to Include</h2>
            <p className="mb-3">
              When reporting an issue, please include:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li>The URL you were scanning (if applicable)</li>
              <li>Steps to reproduce the issue</li>
              <li>What you expected to happen</li>
              <li>What actually happened</li>
              <li>Screenshots or error messages (if any)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">Contributing</h2>
            <p className="mb-4">
              Site Sheriff is open source! If you want to contribute code, documentation, or translations, check out our{' '}
              <a
                href="https://github.com/forbiddenlink/site-sheriff"
                className="text-emerald-400 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub repository
              </a>
              .
            </p>
            <p>
              Contributions of all sizes are welcome, from fixing typos to implementing new audit checks. For larger changes, opening an issue first to discuss the approach is appreciated.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">Common Questions</h2>
            <p>
              Before opening an issue, check existing GitHub issues for similar questions. Common topics include scan timeouts on large sites, interpreting audit results, and requesting new checks. Answers to frequently asked questions often end up in the README.
            </p>
          </section>
        </div>

        <footer className="mt-16 pt-8 border-t border-slate-800 flex flex-col items-center gap-3">
          <div className="flex items-center gap-4 flex-wrap justify-center text-sm">
            <Link
              href="/"
              className="text-slate-500 hover:text-emerald-400 transition-colors"
            >
              Home
            </Link>
            <span className="text-slate-700">·</span>
            <Link
              href="/about"
              className="text-slate-500 hover:text-emerald-400 transition-colors"
            >
              About
            </Link>
            <span className="text-slate-700">·</span>
            <Link
              href="/scans"
              className="text-slate-500 hover:text-emerald-400 transition-colors"
            >
              Scans
            </Link>
            <span className="text-slate-700">·</span>
            <Link
              href="/privacy"
              className="text-slate-500 hover:text-emerald-400 transition-colors"
            >
              Privacy
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
