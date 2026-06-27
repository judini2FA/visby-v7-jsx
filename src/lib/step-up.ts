import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAuthedContext, getUserMfaMethods } from '@/lib/auth';
import { STEP_UP_PREFIX, STEP_UP_FRESH_MS, type StepUpProof } from '@/lib/step-up-shared';

// MFA step-up for money-moving actions (SERVER side). The highest-risk routes are server-authority-signed
// (so Privy's native wallet-MFA doesn't cover them). Instead we require a fresh signature from the user's
// embedded wallet over an action-bound challenge: signing triggers Privy's MFA prompt WHEN THE USER HAS
// ENROLLED MFA. A signature alone therefore only proves a second factor for enrolled users — so the gate
// also requires (authoritatively, via Privy's REST mfa_methods) that the wallet's owner is enrolled, and
// blocks the action with `mfa_required` otherwise. We verify the ed25519 signature against the wallet
// pubkey, bind it to the action, bound its freshness, and enforce single-use (fail CLOSED).

// Single source of truth for rollout: ONE flag, read by both the server (here) and the client
// (step-up-client.ts, same var). NEXT_PUBLIC_* is build-time-inlined into the client, so flipping it
// forces a redeploy that updates client + server together — making the "server-on, client-off" outage
// (and its inverse) impossible. Dormant until set: no proof is sent and none is required.
function stepUpEnforced(): boolean {
  return process.env.NEXT_PUBLIC_STEP_UP_ENFORCED === '1';
}

const STEP_UP_SKEW_MS = 30 * 1000; // tolerate small clock skew, but reject meaningfully future-dated proofs
const NONCE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; // client uses randomUUID()

export async function verifyStepUp(args: { wallet: string; action: string; proof: StepUpProof }): Promise<{ ok: boolean; error?: string }> {
  const { wallet, action } = args;
  const { message, signature } = args.proof ?? ({} as StepUpProof);
  if (!wallet || !message || !signature) return { ok: false, error: 'missing' };

  const m = new RegExp(`^${STEP_UP_PREFIX}\\naction: (.+)\\nts: (\\d+)\\nnonce: (.+)$`).exec(message);
  if (!m) return { ok: false, error: 'malformed' };
  const [, msgAction, tsStr, nonce] = m;
  // Bind the signature to THIS operation — a step-up for action A can't be replayed for action B.
  if (msgAction !== action) return { ok: false, error: 'action_mismatch' };
  if (!NONCE_RE.test(nonce)) return { ok: false, error: 'bad_nonce' };
  const ts = Number(tsStr);
  // Reject expired AND meaningfully future-dated proofs (a post-dated proof would widen the replay window).
  const age = Date.now() - ts;
  if (!Number.isFinite(ts) || age > STEP_UP_FRESH_MS || age < -STEP_UP_SKEW_MS) return { ok: false, error: 'expired' };

  let valid = false;
  try {
    const pub = bs58.decode(wallet);
    const sig = bs58.decode(signature);
    if (pub.length !== 32 || sig.length !== 64) return { ok: false, error: 'bad_key_or_sig' };
    valid = nacl.sign.detached.verify(new TextEncoder().encode(message), sig, pub);
  } catch {
    return { ok: false, error: 'verify_failed' };
  }
  if (!valid) return { ok: false, error: 'invalid_signature' };

  // Single-use nonce (PK). The insert is AUTHORITATIVE: a duplicate (23505) is a replay; ANY other failure
  // — including the table not existing — means we cannot guarantee single-use, so we FAIL CLOSED rather
  // than silently degrade to a replayable freshness-only window. Run migration_step_up.sql before enabling.
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from('step_up_used').insert({ nonce, wallet, action });
    if (error) {
      if (error.code === '23505') return { ok: false, error: 'replay' };
      return { ok: false, error: 'replay_store_unavailable' };
    }
  } catch {
    return { ok: false, error: 'replay_store_unavailable' };
  }

  return { ok: true };
}

// Route guard. Returns null when step-up passes (or isn't required), else a NextResponse to short-circuit
// the route. Rollout-safe: until NEXT_PUBLIC_STEP_UP_ENFORCED=1, a missing proof is allowed (routes behave
// as before) but a PRESENT proof is still verified. Pass the authenticated userId when the caller already
// has it (avoids a second Privy round-trip); otherwise it's resolved from the request.
export async function requireStepUp(req: Request, wallet: string, action: string, userId?: string): Promise<NextResponse | null> {
  const enforced = stepUpEnforced();
  const header = req.headers.get('x-visby-stepup');
  if (!enforced && !header) return null; // dormant — no proof, not required → unchanged behavior
  if (!header) return NextResponse.json({ error: 'step_up_required', action }, { status: 401 });

  let proof: StepUpProof;
  try { proof = JSON.parse(header); } catch { return NextResponse.json({ error: 'bad_step_up' }, { status: 400 }); }
  const r = await verifyStepUp({ wallet, action, proof });
  if (!r.ok) return NextResponse.json({ error: 'step_up_failed', reason: r.error }, { status: 403 });

  // A valid signature is only a real second factor if the wallet's owner has MFA enrolled. When enforcing,
  // require enrollment (authoritative Privy read) so a stolen session can't move money from a non-MFA
  // account by simply signing. Fails closed: unknown enrollment (null) is treated as not enrolled.
  if (enforced) {
    const uid = userId ?? (await getAuthedContext(req))?.userId;
    const mfa = uid ? await getUserMfaMethods(uid) : null;
    if (!mfa || mfa.length === 0) return NextResponse.json({ error: 'mfa_required', action }, { status: 403 });
  }
  return null;
}
