import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://site-sheriff.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Site Sheriff — Website QA & Audit Reports",
  description:
    "Drop a URL, get an instant QA report with 100+ checks across SEO, security, accessibility, performance, and more. Prioritized and explained.",
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
  openGraph: {
    title: "Site Sheriff — Website QA & Audit Reports",
    description:
      "Drop a URL, get an instant QA report with 100+ checks across SEO, security, accessibility, performance, and more. Prioritized and explained.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "SiteSheriff Open Graph Image",
      },
    ],
    type: "website",
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      '@id': `${siteUrl}/#application`,
      name: 'Site Sheriff',
      url: siteUrl,
      description:
        'Drop a URL, get an instant QA report with 160+ checks across SEO, security, accessibility, performance, and more.',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'All',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      publisher: { '@id': `${siteUrl}/#organization` },
    },
    {
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: 'Site Sheriff',
      url: siteUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/icon.png`,
      },
      sameAs: [
        'https://github.com/forbiddenlink/site-sheriff',
      ],
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        url: 'https://github.com/forbiddenlink/site-sheriff/issues',
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${siteUrl}/#faq`,
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What does Site Sheriff check?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Site Sheriff runs 160+ checks across 10 categories: SEO, security, accessibility, performance, broken links, content quality, images, resources, robots/sitemap, and internal linking.',
          },
        },
        {
          '@type': 'Question',
          name: 'How long does a scan take?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Most scans complete in under 90 seconds for sites up to 50 pages. Larger sites or full-page screenshots may take longer.',
          },
        },
        {
          '@type': 'Question',
          name: 'Is Site Sheriff free?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes, Site Sheriff is completely free to use. No signup required - just drop your URL and get your report.',
          },
        },
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <noscript>
          <div style={{
            padding: '2rem',
            textAlign: 'center',
            backgroundColor: '#1a1a2e',
            color: '#e4e4e7',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>JavaScript Required</h1>
            <p style={{ maxWidth: '500px', lineHeight: 1.6 }}>
              Site Sheriff requires JavaScript to run website audits and display results.
              Please enable JavaScript in your browser settings to use this application.
            </p>
          </div>
        </noscript>
        {children}
      </body>
    </html>
  );
}
