import { PrivyClient } from '@privy-io/server-auth';

// Transactional email — fail-soft by design, mirroring src/lib/shipping.ts and src/lib/rate-limit.ts:
// fully wired but DEGRADES to a no-op when RESEND_API_KEY is absent, and NEVER throws into the caller.
// A sale, shipment, delivery, dispute, or SDK settlement must complete even if email is unconfigured or
// the Resend API is down. Recipient addresses are not stored in our DB — they live only in Privy and are
// resolved on demand from a wallet via getUserByWalletAddress.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM     = process.env.EMAIL_FROM ?? 'Visby <onboarding@resend.dev>';

export function emailConfigured(): boolean {
  return !!RESEND_API_KEY;
}

export type SendEmailInput = { to: string | null | undefined; subject: string; html: string; text: string };
export type SendEmailResult = { sent: boolean; skipped?: boolean; id?: string; error?: string };

export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<SendEmailResult> {
  if (!RESEND_API_KEY || !to) {
    if (process.env.NODE_ENV !== 'production') console.debug('[email] skipped', { to: to ?? null, subject, reason: !RESEND_API_KEY ? 'no RESEND_API_KEY' : 'no recipient' });
    return { sent: false, skipped: true };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[email] send failed', { status: res.status, subject, body: body.slice(0, 300) });
      return { sent: false, error: `resend ${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { sent: true, id: data.id };
  } catch (err) {
    console.error('[email] send threw — swallowed', { subject, error: err instanceof Error ? err.message : String(err) });
    return { sent: false, error: 'exception' };
  }
}

// Recipient email for a wallet. Email is never stored in our DB — it lives in Privy, keyed by the user's
// linked wallet. Returns null when Privy server auth is unconfigured, the wallet maps to no user, or that
// user has no linked email (e.g. external-wallet-only login). Always tolerant — never throws.
let _privy: PrivyClient | null = null;
function privy(): PrivyClient | null {
  const id = process.env.NEXT_PUBLIC_PRIVY_APP_ID, secret = process.env.PRIVY_APP_SECRET;
  if (!id || !secret) return null;
  if (!_privy) _privy = new PrivyClient(id, secret);
  return _privy;
}

export async function resolveEmail(wallet: string | null | undefined): Promise<string | null> {
  if (!wallet) return null;
  const p = privy();
  if (!p) return null;
  try {
    const user = await p.getUserByWalletAddress(wallet);
    return user?.email?.address ?? null;
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.debug('[email] resolveEmail failed', { wallet, err });
    return null;
  }
}

// Resolve a wallet to its email and send in one shot. Fire-and-forget at call sites — void emailWallet(...)
// — so the money path is never blocked. No-ops silently when the recipient/key can't be resolved.
export async function emailWallet(
  wallet: string | null | undefined,
  msg: { subject: string; html: string; text: string },
): Promise<SendEmailResult> {
  if (!RESEND_API_KEY) return { sent: false, skipped: true };
  const to = await resolveEmail(wallet);
  return sendEmail({ to, ...msg });
}
