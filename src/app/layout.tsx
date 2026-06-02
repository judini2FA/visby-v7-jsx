import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { Toaster } from '@/components/ui/toaster';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'Visby — Fraud-Free NFT Provenance Marketplace',
    description:
          'Buy and sell real-world goods with verifiable NFT provenance on Solana. Every item gets a permanent, fraud-proof ownership record.',
    keywords: ['NFT', 'provenance', 'marketplace', 'Solana', 'physical goods', 'authentication'],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
          <html lang="en">
                <body className={inter.className}>
                        <Providers>
                                  <div className="min-h-screen bg-[#0E1420] flex flex-col">
                                              <Navbar />
                                              <main className="flex-1">{children}</main>main>
                                              <Footer />
                                  </div>div>
                        </Providers>Providers>
                </body>body>
          </html>html>
        );
}</html>
const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Visby — Fraud-Free NFT Provenance Marketplace',
    description:
        'Buy and sell real-world goods with verifiable NFT provenance on Solana. Every item gets a permanent, fraud-proof ownership record.',
          keywords: ['NFT', 'provenance', 'marketplace', 'Solana', 'physical goods', 'authentication'],
            openGraph: {
                title: 'Visby',
                    description: 'Fraud-Free NFT Provenance Marketplace',
                        url: 'https://visby.io',
                            siteName: 'Visby',
                                images: [{ url: '/og-image.png' }],
                                    type: 'website',
                                      },
                                        twitter: {
                                            card: 'summary_large_image',
                                                title: 'Visby',
                                                    description: 'Fraud-Free NFT Provenance Marketplace',
                                                        images: ['/og-image.png'],
                                                          },
                                                          };

                                                          export default function RootLayout({
                                                            children,
                                                            }: {
                                                              children: React.ReactNode;
                                                              }) {
                                                                return (
                                                                    <html lang="en" suppressHydrationWarning>
                                                                          <body className={inter.className}>
                                                                                  <Providers>
                                                                                            <div className="min-h-screen bg-background flex flex-col">
                                                                                                        <Navbar />
                                                                                                                    <main className="flex-1">{children}</main>
                                                                                                                                <Footer />
                                                                                                                                          </div>
                                                                                                                                                    <Toaster />
                                                                                                                                                            </Providers>
                                                                                                                                                                  </body>
                                                                                                                                                                      </html>
                                                                                                                                                                        );
                                                                                                                                                                        }
