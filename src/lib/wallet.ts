import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import type { User } from '@privy-io/react-auth';

// Only returns Solana wallets — never an Ethereum 0x address.
// Uses Privy's top-level ready flag so pages don't hang during wallet creation.
export function useVisbWallet(): { address: string; ready: boolean } {
  const { ready } = usePrivy();
  const { wallets } = useSolanaWallets();
  const wallet = wallets.find((w: any) => w.walletClientType === 'privy') ?? wallets[0];
  return { address: wallet?.address ?? '', ready };
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
