export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { hashIp, isRefCode, newRefCode, normalizeEmail, standing } from '@/lib/prelaunch';
import { sendEmail } from '@/lib/email';
import { prelaunchWelcome } from '@/lib/email-templates';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  // Honeypot: real users never see this field. Pretend success so bots don't adapt.
  if (body.company) return NextResponse.json({ ok: true, standing: null });

  const ip = clientIp(req);
  const rl = await rateLimit(`prelaunch-signup:${ip}`, { limit: 5, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const email = normalizeEmail(body.email);
  if (!email) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });

  const supabase = createServiceClient();
  const ipHash = hashIp(ip);

  const { data: existing } = await supabase.from('prelaunch_signups').select('ref_code').eq('email', email).maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, already: true, standing: await standing(existing.ref_code) });
  }

  // A referral only counts when it comes from a different network than the referrer, which stops the
  // cheapest self-referral loop (one person spamming their own link with throwaway emails).
  let referredBy: string | null = null;
  if (isRefCode(body.ref)) {
    const { data: referrer } = await supabase.from('prelaunch_signups').select('ref_code, ip_hash').eq('ref_code', body.ref).maybeSingle();
    if (referrer && referrer.ip_hash !== ipHash) referredBy = referrer.ref_code;
  }

  const source = typeof body.source === 'string' ? body.source.slice(0, 120) : null;

  let refCode = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    refCode = newRefCode();
    const { error } = await supabase.from('prelaunch_signups').insert({ email, ref_code: refCode, referred_by: referredBy, source, ip_hash: ipHash });
    if (!error) break;
    if (error.code === '23505' && /email/.test(error.message)) {
      const { data: raced } = await supabase.from('prelaunch_signups').select('ref_code').eq('email', email).maybeSingle();
      return NextResponse.json({ ok: true, already: true, standing: raced ? await standing(raced.ref_code) : null });
    }
    if (error.code !== '23505' || attempt === 2) {
      console.error('[prelaunch] signup insert failed', error.message);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
  }

  const s = await standing(refCode);
  if (s) {
    const msg = prelaunchWelcome({ position: s.position, refCode });
    await sendEmail({ to: email, ...msg });
  }
  return NextResponse.json({ ok: true, standing: s });
}
