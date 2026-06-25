export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

// Liveness + config presence. Returns a DB-ping boolean and, for each important env var, ONLY whether it
// is set (never the value). Safe to expose — discloses no secrets — and lets you confirm a deploy has the
// keys it needs before flipping to mainnet.
const ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_PRIVY_APP_ID', 'PRIVY_APP_SECRET',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  'MINT_AUTHORITY_SECRET_KEY', 'NEXT_PUBLIC_TREASURY_WALLET', 'NEXT_PUBLIC_HELIUS_RPC_URL',
  'CRON_SECRET', 'SECRET_ENCRYPTION_KEY',
  'RESEND_API_KEY', 'SENTRY_DSN', 'ALERT_WEBHOOK_URL',
] as const;

export async function GET() {
  let db = false;
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from('items').select('id').limit(1);
    db = !error;
  } catch {
    db = false;
  }

  const env: Record<string, boolean> = {};
  for (const k of ENV_KEYS) env[k] = !!process.env[k];

  const cluster = (process.env.NEXT_PUBLIC_HELIUS_RPC_URL || '').includes('mainnet') ? 'mainnet' : 'devnet';
  return NextResponse.json({ ok: db, db, cluster, env, ts: new Date().toISOString() });
}
