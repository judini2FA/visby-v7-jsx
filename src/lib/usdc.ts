// USDC SPL-token config, shared by the client sender (transfer-client.ts) and the server verifier
// (transfers.ts) so the mint can't drift. Override with NEXT_PUBLIC_USDC_MINT for mainnet
// (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v); the default is Circle's devnet USDC.
export const USDC_MINT = process.env.NEXT_PUBLIC_USDC_MINT ?? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const USDC_DECIMALS = 6;
