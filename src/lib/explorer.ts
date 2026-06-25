// Explorer deep-links. The cluster is derived from the RPC env so links follow the network instead of
// being hardcoded to devnet — on a mainnet RPC, explorer.solana.com / solscan.io default to mainnet, so
// we append the ?cluster=devnet suffix ONLY off-mainnet.
const SUFFIX = (process.env.NEXT_PUBLIC_HELIUS_RPC_URL || '').includes('mainnet') ? '' : '?cluster=devnet';

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}${SUFFIX}`;
export const explorerAddress = (addr: string) => `https://explorer.solana.com/address/${addr}${SUFFIX}`;
export const solscanTx = (sig: string) => `https://solscan.io/tx/${sig}${SUFFIX}`;
export const solscanAccount = (addr: string) => `https://solscan.io/account/${addr}${SUFFIX}`;
