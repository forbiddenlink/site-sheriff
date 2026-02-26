import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — Site Sheriff Website Auditor',
  description: 'Privacy policy for Site Sheriff, the free website QA and audit tool. Learn how we handle your data, what we collect, and how we protect your privacy.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 px-4 py-16">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>

        <div className="space-y-6 text-slate-300">
          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">What We Collect</h2>
            <p className="mb-3">
              Site Sheriff collects minimal data to provide our website auditing service. We believe in data minimization and only collect what is strictly necessary for the tool to function:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>URLs you submit for scanning</li>
              <li>Scan results and reports generated from those URLs</li>
              <li>Basic analytics (page views, scan counts, error rates)</li>
              <li>Technical data necessary for site operation (IP addresses for rate limiting)</li>
            </ul>
            <p className="mt-3">
              We do not collect personal information such as names, email addresses, or payment information. No account creation is required to use Site Sheriff.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">How We Use Data</h2>
            <p>
              We use collected data solely to:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Generate and display scan reports</li>
              <li>Improve our service</li>
              <li>Prevent abuse (rate limiting)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">Data Retention</h2>
            <p>
              Scan reports are stored temporarily and may be deleted after 30 days.
              We do not sell or share your data with third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">Cookies</h2>
            <p>
              Site Sheriff uses minimal cookies for essential functionality only.
              We do not use tracking or advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">Contact</h2>
            <p>
              Questions about this privacy policy? Open an issue on{' '}
              <a
                href="https://github.com/forbiddenlink/site-sheriff/issues"
                className="text-emerald-400 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>.
            </p>
          </section>

          <p className="text-slate-500 text-sm pt-8">
            Last updated: February 2026
          </p>
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
              href="/contact"
              className="text-slate-500 hover:text-emerald-400 transition-colors"
            >
              Contact
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
