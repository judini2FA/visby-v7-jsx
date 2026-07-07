export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAuthedContext } from '@/lib/auth';
import { isAdminRole } from '@/lib/admin';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

// Blueprint 8.5 — AML/KYC record-keeping export. Compiles the identity-verification (KYC) and
// sanctions-screening (OFAC) records Visby is required to retain and be able to produce for a
// regulator/auditor. Read-only, admin-gated exactly like the chargeback bundle (6.6).
//
// CRITICAL: kyc_verifications.raw is the provider's identity-document payload (PII) and is NEVER
// selected here — only explicit safe columns, never select('*'). Same rule as /api/account/export.

type KycRow = {
  wallet: string; account_type: string | null; provider: string | null; inquiry_id: string | null;
  status: string; reason: string | null; created_at: string; updated_at: string;
};
type HoldRow = {
  order_id: string; seller_wallet: string; reason: string; matched_address: string | null;
  status: string; created_at: string; resolved_at: string | null; resolved_by: string | null;
};

const safe = async <T,>(fn: () => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<{ rows: T[]; note: string | null }> => {
  try {
    const { data, error } = await fn();
    if (error) return { rows: [], note: 'table_unavailable' };
    return { rows: data ?? [], note: null };
  } catch {
    return { rows: [], note: 'table_unavailable' };
  }
};

// RFC-4180-ish: quote every field, double-up embedded quotes, CRLF rows.
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return `"${s.replace(/"/g, '""')}"`;
}
function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  return lines.join('\r\n') + '\r\n';
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get('wallet');
  const format = searchParams.get('format') === 'csv' ? 'csv' : 'json';
  if (!wallet) return NextResponse.json({ error: 'wallet is required' }, { status: 400 });

  const ctx = await getAuthedContext(req);
  if (!ctx || !ctx.wallets.includes(wallet)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdminRole(wallet, 'finance')) && !(await isAdminRole(wallet, 'moderator'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rl = await rateLimit(`aml-export:${wallet}`, { limit: 20, windowSec: 3600 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const supabase = createServiceClient();

  // kyc_verifications — explicit safe columns only. `raw` (identity-document PII) is deliberately excluded.
  const kyc = await safe<KycRow>(() =>
    supabase.from('kyc_verifications')
      .select('wallet, account_type, provider, inquiry_id, status, reason, created_at, updated_at')
      .order('created_at', { ascending: false }),
  );

  // payout_holds — every payout held/blocked by the OFAC screen.
  const holds = await safe<HoldRow>(() =>
    supabase.from('payout_holds')
      .select('order_id, seller_wallet, reason, matched_address, status, created_at, resolved_at, resolved_by')
      .order('created_at', { ascending: false }),
  );

  // ofac_refresh_meta — proof the sanctions list is current. Singleton row (id=1); fail-soft to nulls.
  let listMeta: { last_refreshed_at: string | null; address_count: number | null } = { last_refreshed_at: null, address_count: null };
  let listMetaNote: string | null = null;
  try {
    const { data, error } = await supabase.from('ofac_refresh_meta').select('last_refreshed_at, address_count').eq('id', 1).maybeSingle();
    if (error) listMetaNote = 'table_unavailable';
    else if (data) listMeta = { last_refreshed_at: data.last_refreshed_at ?? null, address_count: data.address_count ?? null };
    else listMetaNote = 'no_meta_row';
  } catch {
    listMetaNote = 'table_unavailable';
  }

  if (format === 'csv') {
    const csv = toCsv(
      ['wallet', 'account_type', 'provider', 'inquiry_id', 'status', 'reason', 'created_at', 'updated_at'],
      kyc.rows as unknown as Array<Record<string, unknown>>,
    );
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="visby-kyc-verifications.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const bundle = {
    generated_at: new Date().toISOString(),
    notice:
      'AML/KYC record-keeping export. Contains identity-verification status records and sanctions ' +
      '(OFAC) screening/hold records retained per anti-money-laundering recordkeeping requirements. ' +
      'Identity-document payloads (the provider raw response) are deliberately excluded from this export.',
    kyc_verifications: kyc.rows,
    kyc_verifications_note: kyc.note,
    sanctions_screening: holds.rows,
    sanctions_screening_note: holds.note,
    sanctions_list_meta: { last_refreshed_at: listMeta.last_refreshed_at, address_count: listMeta.address_count, note: listMetaNote },
  };

  return new NextResponse(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="visby-aml-kyc-export.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
