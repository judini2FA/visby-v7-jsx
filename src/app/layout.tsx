import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Visby — Fraud-Free NFT Provenance Marketplace',
    description: 'Buy and sell real-world goods with verifiable NFT provenance on Solana.',
    };

    export default function RootLayout({ children }: { children: React.ReactNode }) {
      return (
          <html lang="en">
                <body className={inter.className}>
                        <Providers>
                                  <div className="min-h-screen bg-[#0E1420] flex flex-col">
                                              <Navbar />
                                                          <main className="flex-1">{children}</main>
                                                                      <Footer />
                                                                                </div>
                                                                                        </Providers>
                                                                                              </body>
                                                                                                  </html>
                                                                                                    );
                                                                                                    }