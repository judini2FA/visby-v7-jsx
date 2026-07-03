import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet, getAuthedContext } from '@/lib/auth';
import { requireKycForSaleAny } from '@/lib/kyc';

export async function POST(req: Request) {
    try {
          const { serial, price_usdc, seller_wallet } = await req.json();

          if (!serial || !price_usdc || !seller_wallet) {
                  return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
                }
          // Auth: only the seller (verified via Privy token) can list their own item — the wallet in the
          // body is public, so without this anyone could list/relist a victim's item at any price.
          if (!(await callerOwnsWallet(req, seller_wallet))) {
                  return NextResponse.json({ error: 'Not authorized for that wallet' }, { status: 401 });
                }

          // Gate listing behind ID verification (no-op until NEXT_PUBLIC_KYC_REQUIRED=1). KYC is per-user:
          // any of the seller's linked wallets being approved unlocks listing from this one.
          const authCtx = await getAuthedContext(req);
          const kyc = await requireKycForSaleAny(authCtx?.wallets ?? [seller_wallet]);
          if (!kyc.ok) return NextResponse.json({ error: 'kyc_required', kyc_status: kyc.status }, { status: 403 });

          const supabase = createServiceClient();

          // Counterfeit-takedown enforcement: a moderator-suspended account cannot (re)list inventory.
          // Fail-safe: a DB read error is logged and treated as not-flagged (fail open on outages);
          // only an explicit is_flagged=true blocks.
          {
            const suspendCheckWallets = Array.from(new Set([...(authCtx?.wallets ?? []), seller_wallet].filter(Boolean)));
            const { data: flaggedRows, error: flagErr } = await supabase
              .from('profiles')
              .select('wallet')
              .eq('is_flagged', true)
              .in('wallet', suspendCheckWallets);
            if (flagErr) {
              console.error('[listing] is_flagged check failed (failing open):', flagErr.message);
            } else if ((flaggedRows ?? []).length > 0) {
              return NextResponse.json({ error: 'account_suspended' }, { status: 403 });
            }
          }

          const { data, error } = await supabase
            .from('items')
            .update({
                      is_listed: true,
                      price_usdc,
                      listed_at: new Date().toISOString(),
                    })
            .eq('serial_number', serial)
            .eq('current_owner_wallet', seller_wallet)
            .select()
            .single();

          if (error) {
                  return NextResponse.json({ error: error.message }, { status: 400 });
                }

          return NextResponse.json(data);
        } catch (err: any) {
          return NextResponse.json({ error: err.message }, { status: 500 });
        }
  }

export async function DELETE(req: Request) {
  try {
    const { serial, seller_wallet } = await req.json();
    if (!serial || !seller_wallet) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    if (!(await callerOwnsWallet(req, seller_wallet))) return NextResponse.json({ error: 'Not authorized for that wallet' }, { status: 401 });

    const supabase = createServiceClient();
    const { data: item, error: fetchErr } = await supabase
      .from('items')
      .select('*')
      .eq('serial_number', serial)
      .eq('current_owner_wallet', seller_wallet)
      .single();

    if (fetchErr || !item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    const { data, error } = await supabase
      .from('items')
      .update({ is_listed: false, price_usdc: null, listed_at: null })
      .eq('serial_number', serial)
      .eq('current_owner_wallet', seller_wallet)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
