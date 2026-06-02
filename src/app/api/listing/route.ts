import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
    try {
          const { serial, price_usdc, seller_wallet } = await req.json();

          if (!serial || !price_usdc || !seller_wallet) {
                  return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
                }

          const supabase = await createClient();
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
