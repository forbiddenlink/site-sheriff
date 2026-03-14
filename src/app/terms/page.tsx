import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service — Site Sheriff Website Auditor',
  description: 'Terms of service for Site Sheriff, the free website QA and audit tool. Understand our service terms, acceptable use, and limitations.',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 px-4 py-16">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Terms of Service</h1>

        <div className="space-y-6 text-slate-300">
          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">Service Description</h2>
            <p>
              Site Sheriff is a free website auditing tool that analyzes websites for SEO,
              accessibility, security, performance, and content quality issues. By using
              this service, you agree to these terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">Acceptable Use</h2>
            <p className="mb-3">
              You agree to use Site Sheriff responsibly and only to scan websites you own
              or have permission to analyze. You must not:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Scan websites without authorization</li>
              <li>Attempt to overwhelm or abuse the service</li>
              <li>Use automated tools to bypass rate limits</li>
              <li>Interfere with the service or other users</li>
              <li>Use the service for any illegal purpose</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">Service Availability</h2>
            <p>
              Site Sheriff is provided &quot;as is&quot; without guarantees of uptime or availability.
              We may modify, suspend, or discontinue the service at any time without notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">Limitations</h2>
            <p>
              Scan results are provided for informational purposes only. We do not guarantee
              the accuracy or completeness of audit reports. You are responsible for
              verifying findings and implementing any changes to your website.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">Intellectual Property</h2>
            <p>
              Site Sheriff and its original content, features, and functionality are owned
              by Site Sheriff and are protected by international copyright, trademark, and
              other intellectual property laws.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Site Sheriff shall not be liable for
              any indirect, incidental, special, consequential, or punitive damages resulting
              from your use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">Changes to Terms</h2>
            <p>
              We reserve the right to modify these terms at any time. Continued use of the
              service after changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">Contact</h2>
            <p>
              Questions about these terms? Open an issue on our{' '}
              <a
                href="https://github.com/forbiddenlink/site-sheriff"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                GitHub repository
              </a>.
            </p>
          </section>

          <div className="pt-6 border-t border-slate-700">
            <Link href="/" className="text-blue-400 hover:underline">
              ← Back to Site Sheriff
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
