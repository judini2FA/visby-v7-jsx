import { PrivyClient } from '@privy-io/server-auth';

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

// Wallet addresses linked to the authenticated Privy user, or null if the token is
// missing/invalid (or server auth isn't configured). Verifies the JWT, then resolves the
// user's linked wallets.
export async function getAuthedWallets(req: Request): Promise<string[] | null> {
  const c = client();
  const token = bearer(req);
  if (!c || !token) return null;
  try {
    const { userId } = await c.verifyAuthToken(token);
    const user = await c.getUser(userId);
    return (user.linkedAccounts ?? [])
      .filter((a: any) => a.type === 'wallet' && a.address)
      .map((a: any) => a.address as string);
  } catch {
    return null;
  }
}

// True only if the request carries a valid Privy token whose user controls `wallet`.
// Fails closed (false) on any missing/invalid token or misconfiguration.
export async function callerOwnsWallet(req: Request, wallet: string | undefined | null): Promise<boolean> {
  if (!wallet) return false;
  const wallets = await getAuthedWallets(req);
  if (!wallets) return false;
  return wallets.includes(wallet);
}
