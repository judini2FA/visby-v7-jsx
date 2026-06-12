'use client';

import { PrivyProvider, usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { trpc, trpcClient } from '@/lib/trpc/client';
import { ThemeProvider, useTheme } from '@/lib/theme';

// Auto-creates a Solana embedded wallet for users who only have an Ethereum wallet
function EnsureSolanaWallet({ children }: { children: React.ReactNode }) {
  const { authenticated, ready } = usePrivy();
  const { wallets, createWallet } = useSolanaWallets();
  const attempted = useRef(false);
  useEffect(() => {
    if (ready && authenticated && wallets.length === 0 && !attempted.current) {
      attempted.current = true;
      createWallet().catch(() => {});
    }
  }, [ready, authenticated, wallets.length]);
  return <>{children}</>;
}

function PrivyWithTheme({ children }: { children: React.ReactNode }) {
  const { mode } = useTheme();
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 60 * 1000 } } })
  );

  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        loginMethods: ['email', 'wallet'],
        appearance: {
          theme: mode === 'dark' ? 'dark' : 'light',
          accentColor: '#2A8AED',
          logo: '/visby-logo-mark.png',
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
        solanaClusters: [
          { name: 'devnet', rpcUrl: process.env.NEXT_PUBLIC_HELIUS_RPC_URL ?? 'https://api.devnet.solana.com' },
        ],
      }}
    >
      <EnsureSolanaWallet>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </trpc.Provider>
      </EnsureSolanaWallet>
    </PrivyProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const orig = customElements.define.bind(customElements);
    (customElements as any).define = (name: string, ctor: CustomElementConstructor, opts?: ElementDefinitionOptions) => {
      if (!customElements.get(name)) orig(name, ctor, opts);
    };
  }, []);

  return (
    <ThemeProvider>
      <PrivyWithTheme>{children}</PrivyWithTheme>
    </ThemeProvider>
  );
}
