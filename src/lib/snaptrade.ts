import { Snaptrade } from 'snaptrade-typescript-sdk';

// Server-side SnapTrade client (brokerage holdings/balance previews). Test keys today.
// The per-user userSecret it mints is a read credential for that user's brokerage — keep it server-only.
let _client: Snaptrade | null = null;
export function snaptradeClient(): Snaptrade | null {
  const clientId = process.env.SNAPTRADE_CLIENT_ID;
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;
  if (!clientId || !consumerKey) return null; // not configured — callers fail closed
  if (!_client) _client = new Snaptrade({ clientId, consumerKey });
  return _client;
}
