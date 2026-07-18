'use client';

import { PrivyProvider, usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { trpc, trpcClient } from '@/lib/trpc/client';
import { registerTrpcToken } from '@/lib/trpc/token-bridge';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { NativeBootstrap } from '@/components/native-bootstrap';
import { AppLock } from '@/components/app-lock';
import { OnboardingGate } from '@/components/onboarding-gate';
import { AccountGate } from '@/components/account-gate';
import { CurrencySync } from '@/components/currency-sync';
import { captureError } from '@/lib/monitoring';

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

// Auto-creates a Solana embedded wallet for users who don't have one yet. Belt-and-suspenders over
// Privy's own dashboard-driven auto-create (SVM enabled) — a new account needs a Solana wallet for
// buy/checkout/mint. useSolanaWallets exposes its OWN `ready` flag: calling createWallet() before the
// Solana subsystem is initialized is what made the old version hang silently, so we gate on solanaReady
// (not just Privy's top-level ready) and never swallow a real error.
function EnsureSolanaWallet({ children }: { children: React.ReactNode }) {
  const { authenticated, ready } = usePrivy();
  const { wallets, createWallet, ready: solanaReady } = useSolanaWallets();
  const attempted = useRef(false);
  useEffect(() => {
    if (!ready || !solanaReady || !authenticated) return;
    if (wallets.length > 0) { attempted.current = false; return; } // already have one — nothing to do
    if (attempted.current) return;
    attempted.current = true;
    (async () => {
      try {
        await createWallet();
      } catch (e: any) {
        // "already has an embedded wallet" is benign — a race with Privy's own auto-create; the wallets
        // list will reflect it. Any OTHER error is a real failure worth surfacing (it lands in the
        // browser console via captureError) instead of hanging silently, and we clear the attempt flag
        // so a transient failure can retry on the next render.
        const msg = String(e?.message ?? e ?? '');
        if (!/already (has|exists)/i.test(msg)) {
          captureError(e instanceof Error ? e : new Error(msg || 'createWallet failed'), { stage: 'EnsureSolanaWallet.createWallet' });
          attempted.current = false;
        }
      }
    })();
  }, [ready, solanaReady, authenticated, wallets.length, createWallet]);
  return <>{children}</>;
}

// The SDK hosted checkout (/sdk/checkout/*) is a self-contained, PayPal-style merchant surface — a buyer
// signs in and pays, nothing more. It must NOT be wrapped by the app's onboarding wizard or Face-ID
// app-lock: those belong to the main Visby app, and running them inside a merchant's popup hijacks the
// checkout (it forces the full signup wizard on EXISTING buyers, then step-payment redirects to /profile,
// stranding them away from the purchase). The checkout page owns its own auth (Privy sign-in + wallet).
function AppGates({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Every SDK surface (/sdk/checkout, /sdk/demo, /sdk docs) is a merchant/buyer flow, not the main Visby
  // app — none of them should run the onboarding wizard or Face-ID app-lock. (The demo shop was getting
  // taken over by the signup wizard.)
  if (pathname?.startsWith('/sdk')) return <>{children}</>;
  return (
    <AppLock>
      <AccountGate>
        <OnboardingGate>{children}</OnboardingGate>
      </AccountGate>
    </AppLock>
  );
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
        loginMethods: ['email', 'sms', 'google', 'apple', 'wallet'],
        appearance: {
          theme: mode === 'dark' ? 'dark' : 'light',
          accentColor: '#2A8AED',
          logo: '/visby-logo-mark.png',
          // Solana-only wallet buttons. 'detected_solana_wallets' auto-surfaces every installed
          // Solana extension (Phantom/Solflare/Backpack/Glow/…) in one click, no pairing-QR/raw-URI
          // shown (A3) — those wallets have no explicit WalletListEntry id in Privy 1.99.1, so
          // detection is the only way to list them. The named entries below are the Solana-relevant
          // subset that DO type-check as WalletListEntry in this version; the rest of the union is
          // EVM-only and irrelevant on a solana-only app. 'wallet_connect' reaches mobile Solana
          // wallets that aren't a browser extension.
          walletList: ['detected_solana_wallets', 'phantom', 'coinbase_wallet', 'okx_wallet', 'wallet_connect'],
          walletChainType: 'solana-only',
        },
        embeddedWallets: {
          // Auto-create an embedded wallet on login. In the Privy dashboard (Authentication → Login methods
          // → "Automatically create embedded wallets on login") EVM is DISABLED and SVM (Solana) ENABLED for
          // this app, so this only ever creates a Solana wallet — never the Ethereum one that used to fail
          // login with "A user cannot have more than one ethereum embedded and one imported wallet".
          // EnsureSolanaWallet below is a belt-and-suspenders fallback for any whitelabel login path where
          // the modal auto-create doesn't run.
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
            <CurrencySync />
            <AppGates>{children}</AppGates>
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
