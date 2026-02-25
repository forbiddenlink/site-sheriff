import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Scan History — Site Sheriff',
  description: 'View your recent website audits and scan results. Track SEO, security, accessibility, and performance scores over time.',
};

export default function ScansLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
