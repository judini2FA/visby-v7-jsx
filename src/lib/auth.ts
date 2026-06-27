import { PrivyClient } from '@privy-io/server-auth';
import { isSessionRevoked } from '@/lib/device-sessions';

const APP_ID     = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const APP_SECRET = process.env.PRIVY_APP_SECRET;

let _client: PrivyClient | null = null;
function client(): PrivyClient | null {
  if (!APP_ID || !APP_SECRET) return null; // server auth not configured — callers fail closed
  if (!_client) _client = new PrivyClient(APP_ID, APP_SECRET);
  return _client;
}

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  if (!h.startsWith('Bearer ')) return null;
  const t = h.slice(7).trim();
  return t || null;
}

export type AuthedContext = { wallets: string[]; userId: string; sessionId: string };

// Full verified auth context: the Privy user's linked wallets PLUS userId + sessionId (which the
// JWT carries but getAuthedWallets discards). Returns null if the token is missing/invalid, server
// auth isn't configured, OR this device's session has been revoked ("log out other devices").
export async function getAuthedContext(req: Request): Promise<AuthedContext | null> {
  const c = client();
  const token = bearer(req);
  if (!c || !token) return null;
  try {
    const { userId, sessionId } = await c.verifyAuthToken(token);
    // Resolve the user and the revocation check concurrently (no serial round-trip on the hot path).
    // isSessionRevoked fails OPEN, so a DB hiccup can never lock everyone out; an app-side "log out
    // other devices" still denies a revoked session even though Privy's token is technically valid.
    const [revoked, user] = await Promise.all([isSessionRevoked(sessionId), c.getUser(userId)]);
    if (revoked) return null;
    const wallets = (user.linkedAccounts ?? [])
      .filter((a: any) => a.type === 'wallet' && a.address)
      .map((a: any) => a.address as string)
      .sort(); // deterministic order so the displayed wallets[0] is stable across requests
    return { wallets, userId, sessionId };
  } catch {
    return null;
  }
}

// Wallet addresses linked to the authenticated Privy user, or null if the token is
// missing/invalid (or server auth isn't configured). Verifies the JWT, then resolves the
// user's linked wallets.
export async function getAuthedWallets(req: Request): Promise<string[] | null> {
  const ctx = await getAuthedContext(req);
  return ctx ? ctx.wallets : null;
}

// True only if the request carries a valid Privy token whose user controls `wallet`.
// Fails closed (false) on any missing/invalid token or misconfiguration.
export async function callerOwnsWallet(req: Request, wallet: string | undefined | null): Promise<boolean> {
  if (!wallet) return false;
  const wallets = await getAuthedWallets(req);
  if (!wallets) return false;
  return wallets.includes(wallet);
}
