export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { hashIp, normalizeEmail } from '@/lib/prelaunch';
import { sendEmail } from '@/lib/email';
import { investorInquiryEmail } from '@/lib/email-templates';

const INBOX = process.env.INVESTOR_INBOX ?? 'judah@visby.me';

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body.website) return NextResponse.json({ ok: true });

  const ip = clientIp(req);
  const rl = await rateLimit(`prelaunch-investor:${ip}`, { limit: 3, windowSec: 3600 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const name = str(body.name, 120);
  const email = normalizeEmail(body.email);
  const firm = str(body.firm, 160) || null;
  const message = str(body.message, 5000);
  if (!name) return NextResponse.json({ error: 'Please add your name.' }, { status: 400 });
  if (!email) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (message.length < 10) return NextResponse.json({ error: 'Please write a short message.' }, { status: 400 });

  // Saved before sending so an inquiry is never lost if Resend is down or the domain is unverified.
  const supabase = createServiceClient();
  const { data: row, error } = await supabase
    .from('investor_inquiries')
    .insert({ name, email, firm, message, ip_hash: hashIp(ip) })
    .select('id')
    .single();
  if (error) {
    console.error('[prelaunch] investor insert failed', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  const sent = await sendEmail({ to: INBOX, replyTo: email, ...investorInquiryEmail({ name, email, firm, message }) });
  if (sent.sent) await supabase.from('investor_inquiries').update({ email_sent: true }).eq('id', row.id);

  return NextResponse.json({ ok: true });
}
