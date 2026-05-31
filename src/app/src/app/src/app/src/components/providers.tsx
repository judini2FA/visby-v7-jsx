'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { trpc, trpcClient } from '@/lib/trpc/client';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
      () =>
            new QueryClient({
                    defaultOptions: {
                              queries: { staleTime: 60 * 1000 },
                                      },
                                            })
                                              );

                                                return (
                                                    <PrivyProvider
                                                          appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
                                                                config={{
                                                                        loginMethods: ['email', 'wallet', 'google'],
                                                                                appearance: {
                                                                                          theme: 'dark',
                                                                                                    accentColor: '#6B21A8',
                                                                                                              logo: '/visby-logo.svg',
                                                                                                                      },
                                                                                                                              embeddedWallets: {
                                                                                                                                        createOnLogin: 'users-without-wallets',
                                                                                                                                                },
                                                                                                                                                        defaultChain: {
                                                                                                                                                                  id: 101,
                                                                                                                                                                            name: 'Solana Mainnet',
                                                                                                                                                                                      network: 'mainnet',
                                                                                                                                                                                                nativeCurrency: { name: 'Solana', symbol: 'SOL', decimals: 9 },
                                                                                                                                                                                                          rpcUrls: {
                                                                                                                                                                                                                      default: { http: [process.env.NEXT_PUBLIC_HELIUS_RPC_URL!] },
                                                                                                                                                                                                                                },
                                                                                                                                                                                                                                        } as any,
                                                                                                                                                                                                                                              }}
                                                                                                                                                                                                                                                  >
                                                                                                                                                                                                                                                        <trpc.Provider client={trpcClient} queryClient={queryClient}>
                                                                                                                                                                                                                                                                <QueryClientProvider client={queryClient}>
                                                                                                                                                                                                                                                                          {children}
                                                                                                                                                                                                                                                                                  </QueryClientProvider>
                                                                                                                                                                                                                                                                                        </trpc.Provider>
                                                                                                                                                                                                                                                                                            </PrivyProvider>
                                                                                                                                                                                                                                                                                              );
                                                                                                                                                                                                                                                                                              }