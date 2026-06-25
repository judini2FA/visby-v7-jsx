// Admin/moderator wallets, for the moderation queue and item-authentication actions.
// Set NEXT_PUBLIC_ADMIN_WALLETS in .env.local as a comma-separated list of Solana wallet addresses.
// Public-by-design (wallet addresses aren't secrets) so the client can gate the admin UI too; the
// real enforcement is server-side: every admin route checks callerOwnsWallet(wallet) AND isAdminWallet.
const ADMIN_WALLETS = (process.env.NEXT_PUBLIC_ADMIN_WALLETS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

export function isAdminWallet(wallet?: string | null): boolean {
  return !!wallet && ADMIN_WALLETS.includes(wallet);
}
