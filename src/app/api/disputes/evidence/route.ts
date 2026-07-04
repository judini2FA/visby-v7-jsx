import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAuthedContext } from '@/lib/auth';
import { isAdminRole } from '@/lib/admin';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

const CLOSED_STATUSES = ['refunded', 'denied', 'closed'];

function isMissingSchema(error: { code?: string; message?: string }): boolean {
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === '42703' ||
    !!error.message?.includes('does not exist')
  );
}

type Role = 'buyer' | 'seller' | 'admin';

// Resolves the dispute and the caller's role on it. The caller must control `wallet` (checked by the
// caller before this runs) AND either be a party to the dispute (buyer/seller) or an admin
// (support/finance) — anyone else is rejected. Returns null + a ready-made error response on failure.
async function loadDisputeAndRole(
  supabase: ReturnType<typeof createServiceClient>,
  disputeId: string,
  wallet: string,
): Promise<
  | { ok: true; dispute: any; role: Role }
  | { ok: false; res: NextResponse }
> {
  const { data: dispute, error } = await supabase
    .from('disputes')
    .select('*')
    .eq('id', disputeId)
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error)) {
      return { ok: false, res: NextResponse.json({ error: 'Dispute evidence is not available yet' }, { status: 503 }) };
    }
    console.error('[disputes/evidence] dispute lookup error:', error);
    return { ok: false, res: NextResponse.json({ error: 'Could not load dispute' }, { status: 500 }) };
  }
  if (!dispute) {
    return { ok: false, res: NextResponse.json({ error: 'Dispute not found' }, { status: 404 }) };
  }

  if (wallet === dispute.buyer_wallet) {
    return { ok: true, dispute, role: 'buyer' };
  }
  if (wallet === dispute.seller_wallet) {
    return { ok: true, dispute, role: 'seller' };
  }
  // No 'support' role exists in AdminRole (super_admin | finance | moderator | authenticator) — disputes
  // are handled by finance (money) or moderator (conduct/evidence review), mirroring disputes/resolve's
  // isAdminRole(wallet, 'finance') gate while also letting moderators view/attach evidence.
  if (await isAdminRole(wallet, 'finance') || await isAdminRole(wallet, 'moderator')) {
    return { ok: true, dispute, role: 'admin' };
  }

  return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
}

async function buildProofOfDelivery(supabase: ReturnType<typeof createServiceClient>, orderId: string | null) {
  if (!orderId) return null;
  const { data: order, error } = await supabase
    .from('orders')
    .select('tracking_carrier, tracking_number, status, shipped_at')
    .eq('id', orderId)
    .maybeSingle();
  if (error || !order) return null;
  return {
    carrier: order.tracking_carrier ?? null,
    tracking_number: order.tracking_number ?? null,
    delivered: order.status === 'delivered',
    shipped_at: order.shipped_at ?? null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthedContext(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await req.formData();
    const disputeId = formData.get('dispute_id');
    const wallet = formData.get('wallet');
    const note = formData.get('note');
    const file = formData.get('file') as File | null;

    if (typeof disputeId !== 'string' || !disputeId) {
      return NextResponse.json({ error: 'dispute_id is required' }, { status: 400 });
    }
    if (typeof wallet !== 'string' || !wallet) {
      return NextResponse.json({ error: 'wallet is required' }, { status: 400 });
    }
    // CRITICAL: the caller must control the wallet they claim to upload as — otherwise anyone with a
    // valid Privy session could attach evidence under someone else's wallet address.
    if (!ctx.wallets.includes(wallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const ext = ALLOWED[file.type];
    if (!ext) return NextResponse.json({ error: 'Only images or PDF files are allowed' }, { status: 415 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 413 });

    const rl = await rateLimit(`dispute-evidence:${wallet}`, { limit: 20, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

    const supabase = createServiceClient();

    const loaded = await loadDisputeAndRole(supabase, disputeId, wallet);
    if (!loaded.ok) return loaded.res;
    const { dispute, role } = loaded;

    if (CLOSED_STATUSES.includes(dispute.status)) {
      return NextResponse.json({ error: 'This dispute is already resolved and can no longer accept evidence.' }, { status: 409 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const path = `disputes/${disputeId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    await supabase.storage.createBucket('dispute-evidence', { public: true }).catch(() => {});
    const { error: uploadErr } = await supabase.storage
      .from('dispute-evidence')
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (uploadErr) {
      console.error('[disputes/evidence/POST] upload error:', uploadErr);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    const { data: pub } = supabase.storage.from('dispute-evidence').getPublicUrl(path);

    const { data: evidence, error: insertErr } = await supabase
      .from('dispute_evidence')
      .insert({
        dispute_id: disputeId,
        uploaded_by: wallet,
        role,
        file_url: pub.publicUrl,
        file_type: file.type,
        note: typeof note === 'string' && note.trim() ? note.trim().slice(0, 1000) : null,
      })
      .select('*')
      .single();

    if (insertErr) {
      if (isMissingSchema(insertErr)) {
        return NextResponse.json({ error: 'Dispute evidence is not available yet' }, { status: 503 });
      }
      console.error('[disputes/evidence/POST] insert error:', insertErr);
      return NextResponse.json({ error: 'Could not save evidence' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, evidence });
  } catch (err) {
    console.error('[disputes/evidence/POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const disputeId = searchParams.get('dispute_id');
    const wallet = searchParams.get('wallet');

    if (!disputeId) return NextResponse.json({ error: 'dispute_id is required' }, { status: 400 });
    if (!wallet) return NextResponse.json({ error: 'wallet is required' }, { status: 400 });

    const ctx = await getAuthedContext(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // Same ownership check as POST — the caller must control the wallet they're querying as.
    if (!ctx.wallets.includes(wallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();

    const loaded = await loadDisputeAndRole(supabase, disputeId, wallet);
    if (!loaded.ok) return loaded.res;
    const { dispute } = loaded;

    const { data, error } = await supabase
      .from('dispute_evidence')
      .select('*')
      .eq('dispute_id', disputeId)
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingSchema(error)) {
        return NextResponse.json({ evidence: [], proof_of_delivery: null });
      }
      console.error('[disputes/evidence/GET] error:', error);
      return NextResponse.json({ evidence: [], proof_of_delivery: null });
    }

    const proof_of_delivery = await buildProofOfDelivery(supabase, dispute.order_id);

    return NextResponse.json({ evidence: data ?? [], proof_of_delivery });
  } catch (err) {
    console.error('[disputes/evidence/GET] error:', err);
    return NextResponse.json({ evidence: [], proof_of_delivery: null });
  }
}
