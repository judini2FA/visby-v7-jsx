import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { BottomNav } from '@/components/layout/bottom-nav';
import { LegalFooter } from '@/components/layout/legal-footer';
import { BackgroundField } from '@/components/background-field';
import { PwaRegister } from '@/components/pwa-register';
import { themeInitScript } from '@/lib/theme';

// The whole app is auth-personalized behind the Privy provider (mounted in <Providers>), which cannot
// initialize during build-time static prerender (throws "invalid Privy app ID"). force-dynamic on the
// root layout propagates to every route, opting the app out of SSG so pages render at request time
// with real env present. No SEO/perf loss here — every surface is personalized anyway.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Visby — Fraud-Free NFT Provenance Marketplace',
  description: 'Buy and sell real-world goods with verifiable NFT provenance on Solana.',
  applicationName: 'Visby',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Visby',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Let the app draw under the notch / home indicator when installed full-screen.
  viewportFit: 'cover',
  themeColor: '#FAF9FC',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>
          <PwaRegister />
          <BackgroundField />
          <div style={{ position: 'relative', background: 'transparent', minHeight: '100vh' }}>
            {children}
            <LegalFooter />
            <BottomNav />
          </div>
        </Providers>
      </body>
    </html>
  );
}
