import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { BottomNav } from '@/components/layout/bottom-nav';
import { BackgroundField } from '@/components/background-field';
import { themeInitScript } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'Visby — Fraud-Free NFT Provenance Marketplace',
  description: 'Buy and sell real-world goods with verifiable NFT provenance on Solana.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>
          <BackgroundField />
          <div style={{ maxWidth: 600, margin: '0 auto', position: 'relative', background: 'transparent', minHeight: '100vh' }}>
            {children}
            <BottomNav />
          </div>
        </Providers>
      </body>
    </html>
  );
}
