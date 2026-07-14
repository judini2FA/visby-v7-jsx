import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import type { User } from '@privy-io/react-auth';

// Only returns Solana wallets — never an Ethereum 0x address.
// Uses Privy's top-level ready flag so pages don't hang during wallet creation.
//
// EXTERNAL-WALLET-ONLY LOGIN (A9): a user can sign in with just a connected Solana wallet
// (Phantom/Solflare/…) — no email required. Nothing here forces email; the presence of ANY Solana
// wallet is sufficient to resolve an identity.
//
// Why linking used to break, and the fix: `useSolanaWallets()` can transiently return an empty (or
// reordered) `wallets` array right after login — especially for external sign-ins where the extension
// connector hydrates a beat late. The old code resolved `wallets.find(privy) ?? wallets[0]`, so the
// returned address could FLIP between the embedded wallet and the external one across renders, and
// per-wallet state (profile rows, account_security, gates) mis-keyed onto whichever won that render.
// Fix: derive a single canonical address that prefers the persisted linkedAccounts wallet (stable
// across hydration) and only falls back to a live connector when linkedAccounts hasn't populated yet.
// getSolanaAddress already encodes the identity priority (Solana → Privy embedded → any wallet), so
// leaning on it first makes the resolved address deterministic for a given user.
export function useVisbWallet(): { address: string; ready: boolean } {
  const { ready, user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const persisted = getSolanaAddress(user);
  const live = wallets.find((w: any) => w.walletClientType === 'privy') ?? wallets[0];
  const address = persisted || live?.address || '';
  return { address, ready };
}

/**
 * Non-hook fallback for one-off server-side helpers.
 * Prefers Solana → Privy embedded → any wallet in linkedAccounts. An external Solana wallet used as
 * the primary login lands in linkedAccounts with chainType 'solana', so this resolves it too — an
 * email is never required for a usable identity.
 */
export function getSolanaAddress(user: User | null | undefined): string {
  if (!user) return '';
  const accounts = (user.linkedAccounts ?? []) as any[];
  const wallet =
    accounts.find(a => a.type === 'wallet' && a.chainType === 'solana') ??
    accounts.find(a => a.type === 'wallet' && a.walletClientType === 'privy') ??
    accounts.find(a => a.type === 'wallet');
  return wallet?.address ?? '';
}
