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
  '@type': 'WebApplication',
  name: 'Site Sheriff',
  url: siteUrl,
  description:
    'Drop a URL, get an instant QA report with 100+ checks across SEO, security, accessibility, performance, and more.',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'All',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
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
        {children}
      </body>
    </html>
  );
}
