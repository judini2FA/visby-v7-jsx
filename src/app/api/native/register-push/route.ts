import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { callerOwnsWallet } from '@/lib/auth';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { token, platform, wallet } = body as {
    token?: unknown;
    platform?: unknown;
    wallet?: unknown;
  };

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }

  const validPlatforms = ['ios', 'android'] as const;
  const resolvedPlatform =
    validPlatforms.includes(platform as (typeof validPlatforms)[number])
      ? (platform as string)
      : 'unknown';

  const resolvedWallet =
    wallet && typeof wallet === 'string' ? wallet : null;

  // When a wallet is present, verify the caller owns it.
  // A pre-login registration (no wallet) is allowed so the device can receive
  // notifications even before the user authenticates.
  if (resolvedWallet) {
    const owns = await callerOwnsWallet(req, resolvedWallet);
    if (!owns) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = createServiceClient();

  const { error } = await supabase.from('push_tokens').upsert(
    {
      wallet: resolvedWallet,
      token,
      platform: resolvedPlatform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'wallet,token' }
  );

  if (error) {
    // Table may not exist yet if migration hasn't run.
    const isMissing =
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      error.message?.includes('does not exist');
    if (isMissing) {
      return NextResponse.json(
        { error: 'Push not available yet' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
