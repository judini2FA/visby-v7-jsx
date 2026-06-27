import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { STEP_UP_PREFIX, STEP_UP_FRESH_MS, type StepUpProof } from '@/lib/step-up-shared';

// MFA step-up for money-moving actions (SERVER side). Privy's server SDK exposes NO MFA signal, and the
// highest-risk routes are server-authority-signed (so Privy's native wallet-MFA doesn't cover them).
// Instead we require a fresh signature from the user's embedded wallet over an action-bound challenge:
// signing triggers Privy's MFA prompt (when enrolled), so a valid signature proves wallet control AND —
// once the user has enrolled MFA — that they just passed it. We verify the ed25519 signature against the
// wallet pubkey, bind it to the action, check freshness, and enforce single-use.

export async function verifyStepUp(args: { wallet: string; action: string; proof: StepUpProof }): Promise<{ ok: boolean; error?: string }> {
  const { wallet, action } = args;
  const { message, signature } = args.proof ?? ({} as StepUpProof);
  if (!wallet || !message || !signature) return { ok: false, error: 'missing' };

  const m = new RegExp(`^${STEP_UP_PREFIX}\\naction: (.+)\\nts: (\\d+)\\nnonce: (.+)$`).exec(message);
  if (!m) return { ok: false, error: 'malformed' };
  const [, msgAction, tsStr, nonce] = m;
  // Bind the signature to THIS operation — a step-up for action A can't be replayed for action B.
  if (msgAction !== action) return { ok: false, error: 'action_mismatch' };
  const ts = Number(tsStr);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > STEP_UP_FRESH_MS) return { ok: false, error: 'expired' };

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

  // Single-use nonce (PK). If the table isn't migrated yet, fall back to freshness-only (the 5-min
  // window bounds replay) rather than blocking the action; a real duplicate (23505) is always rejected.
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from('step_up_used').insert({ nonce, wallet, action });
    if (error?.code === '23505') return { ok: false, error: 'replay' };
  } catch { /* replay store unavailable — freshness window still applies */ }

  return { ok: true };
}

// Route guard. Returns null when step-up passes (or isn't required), else a NextResponse to short-circuit
// the route. Rollout-safe: until STEP_UP_ENFORCED=1, a missing proof is allowed (routes behave as before)
// but a PRESENT proof is still verified — so the client flow can be deployed + tested before enforcement.
export async function requireStepUp(req: Request, wallet: string, action: string): Promise<NextResponse | null> {
  const enforced = process.env.STEP_UP_ENFORCED === '1';
  const header = req.headers.get('x-visby-stepup');
  if (!header) {
    return enforced ? NextResponse.json({ error: 'step_up_required', action }, { status: 401 }) : null;
  }
  let proof: StepUpProof;
  try { proof = JSON.parse(header); } catch { return NextResponse.json({ error: 'bad_step_up' }, { status: 400 }); }
  const r = await verifyStepUp({ wallet, action, proof });
  if (!r.ok) return NextResponse.json({ error: 'step_up_failed', reason: r.error }, { status: 403 });
  return null;
}
