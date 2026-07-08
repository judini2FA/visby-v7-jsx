import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import type { User } from '@privy-io/react-auth';

// Only returns Solana wallets — never an Ethereum 0x address.
// Uses Privy's top-level ready flag so pages don't hang during wallet creation.
//
// Falls back to the persisted `linkedAccounts` address (via getSolanaAddress) when the live
// useSolanaWallets() connector hasn't hydrated a wallet yet. This matters for external-wallet
// sign-ins (Phantom/Solflare): the connector array can be transiently empty right after login (or
// if the extension isn't actively connected this tab), and without the fallback callers gating on
// `wallet` — notably PasswordGate — would silently skip, letting that login method bypass the
// password step entirely.
export function useVisbWallet(): { address: string; ready: boolean } {
  const { ready, user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const live = wallets.find((w: any) => w.walletClientType === 'privy') ?? wallets[0];
  const address = live?.address || getSolanaAddress(user);
  return { address, ready };
}

/**
 * Non-hook fallback for one-off server-side helpers.
 * Prefers Solana → Privy embedded → any wallet in linkedAccounts.
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
