'use client';

import { PrivyProvider, usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { trpc, trpcClient } from '@/lib/trpc/client';
import { registerTrpcToken } from '@/lib/trpc/token-bridge';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { NativeBootstrap } from '@/components/native-bootstrap';
import { AppLock } from '@/components/app-lock';

// Hands the tRPC client a way to fetch a fresh Privy token so protectedProcedures can authenticate.
function TrpcAuthBridge() {
  const { getAccessToken } = usePrivy();
  useEffect(() => {
    registerTrpcToken(getAccessToken);
    return () => registerTrpcToken(null);
  }, [getAccessToken]);
  return null;
}

// Registers this device/session once per sign-in so it shows up under Settings → Security → active
// sessions, and triggers a "new device" audit + email on a first-seen device. Fire-and-forget.
function SecurityBootstrap() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const done = useRef(false);
  useEffect(() => {
    if (!ready || !authenticated || done.current) return;
    done.current = true;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        await fetch('/api/security/register-device', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ platform: navigator.platform, ua: navigator.userAgent }),
        });
      } catch { /* best-effort */ }
    })();
  }, [ready, authenticated, getAccessToken]);
  return null;
}

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
        // When a user has enrolled MFA, Privy raises its own step-up challenge before any embedded-wallet
        // signing op (sendTransaction/signMessage) — giving "step-up before you move crypto" for free.
        mfa: { noPromptOnMfaRequired: false },
        solanaClusters: [
          { name: 'devnet', rpcUrl: process.env.NEXT_PUBLIC_HELIUS_RPC_URL ?? 'https://api.devnet.solana.com' },
        ],
      }}
    >
      <EnsureSolanaWallet>
        <TrpcAuthBridge />
        <SecurityBootstrap />
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <AppLock>{children}</AppLock>
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
      <PrivyWithTheme>
        <NativeBootstrap />
        {children}
      </PrivyWithTheme>
    </ThemeProvider>
  );
}
