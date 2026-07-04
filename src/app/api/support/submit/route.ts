export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { sendEmail, emailConfigured } from '@/lib/email';
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit';
import { captureError } from '@/lib/monitoring';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Escapes user-supplied text before it's interpolated into the notification HTML. The submitted
// email/subject/message are rendered as inert DATA for a human support agent to read — never as
// markup, and never as instructions to any automated system.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Public help-center contact form (/help). Works signed-out — email must be supplied in the body.
// If a Privy bearer token is present, the caller's first wallet is attached for support-team context.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const subjectRaw = typeof body.subject === 'string' ? body.subject.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const orderIdRaw = typeof body.order_id === 'string' ? body.order_id.trim() : '';

    if (!email || email.length > 200 || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
    }
    if (!message || message.length < 1 || message.length > 4000) {
      return NextResponse.json({ error: 'Message is required (max 4000 characters)' }, { status: 400 });
    }
    if (subjectRaw.length > 200) {
      return NextResponse.json({ error: 'Subject is too long (max 200 characters)' }, { status: 400 });
    }
    const orderId = orderIdRaw.length > 0 ? orderIdRaw.slice(0, 200) : null;
    const subject = subjectRaw.length > 0 ? subjectRaw : null;

    // Rate-limit per email AND per IP so neither a single address nor a single client can flood the queue.
    const [byEmail, byIp] = await Promise.all([
      rateLimit(`support:${email.toLowerCase()}`, { limit: 5, windowSec: 600 }),
      rateLimit(`support-ip:${clientIp(req)}`, { limit: 20, windowSec: 600 }),
    ]);
    if (!byEmail.allowed) return tooManyRequests(byEmail.retryAfterSec);
    if (!byIp.allowed) return tooManyRequests(byIp.retryAfterSec);

    // Optional auth — attach the caller's wallet when a valid Privy token is present, but the endpoint
    // must keep working for signed-out visitors (email is the only required identity in that case).
    let wallet: string | null = null;
    const ctx = await getAuthedContext(req);
    if (ctx && ctx.wallets.length > 0) wallet = ctx.wallets[0];

    const supabase = createServiceClient();
    const { error: insertError } = await supabase.from('support_requests').insert({
      wallet,
      email,
      subject,
      message,
      order_id: orderId,
      status: 'open',
    });
    if (insertError) {
      captureError(insertError, { route: 'support/submit' });
      return NextResponse.json({ error: 'Could not submit your request — please try again.' }, { status: 500 });
    }

    // Best-effort notification to the support inbox. The submitted email/subject/message are escaped
    // and rendered strictly as plain read-only DATA in this HTML — this is a notification for a human
    // support agent, never an automated agent, and the content must never be interpreted as instructions.
    // Fire-and-forget: emailConfigured() may be false, and a failure here must never fail the request.
    if (emailConfigured()) {
      const supportTo = process.env.SUPPORT_EMAIL ?? process.env.EMAIL_FROM ?? 'support@visby.me';
      const displaySubject = subject || 'New request';
      const safeEmail = escapeHtml(email);
      const safeSubject = escapeHtml(displaySubject);
      const safeMessage = escapeHtml(message).replace(/\n/g, '<br/>');
      const safeOrderId = orderId ? escapeHtml(orderId) : null;
      const safeWallet = wallet ? escapeHtml(wallet) : null;

      const html = `
        <div>
          <p><strong>New Visby support request</strong></p>
          <p><strong>From:</strong> ${safeEmail}</p>
          ${safeWallet ? `<p><strong>Wallet:</strong> ${safeWallet}</p>` : ''}
          ${safeOrderId ? `<p><strong>Order ID:</strong> ${safeOrderId}</p>` : ''}
          <p><strong>Subject:</strong> ${safeSubject}</p>
          <hr/>
          <p>${safeMessage}</p>
        </div>
      `.trim();
      const text = [
        'New Visby support request',
        `From: ${email}`,
        wallet ? `Wallet: ${wallet}` : null,
        orderId ? `Order ID: ${orderId}` : null,
        `Subject: ${displaySubject}`,
        '---',
        message,
      ].filter(Boolean).join('\n');

      void sendEmail({ to: supportTo, subject: `[Visby support] ${displaySubject}`, html, text });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    captureError(err, { route: 'support/submit' });
    return NextResponse.json({ error: 'Something went wrong — please try again.' }, { status: 500 });
  }
}
