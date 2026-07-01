// Transactional email templates. Each builder returns { subject, html, text }. HTML is inline-styled
// (email clients ignore <style>/external CSS); plain text is always included for deliverability. Items
// are "Tallys"; money-bearing emails carry a devnet/test disclaimer until mainnet.

export type EmailMsg = { subject: string; html: string; text: string };

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://visby.app').replace(/\/$/, '');
const url = (path: string) => `${APP_URL}${path.startsWith('/') ? path : `/${path}`}`;
const money = (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(2)}`;
const esc = (s: string | null | undefined) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const DEVNET_NOTE = 'Visby is currently running on Solana devnet (test mode) — amounts shown are for testing and no real funds move yet.';

function layout(opts: { heading: string; lines: string[]; cta?: { label: string; href: string }; note?: string }): string {
  const body = opts.lines.map(l => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#2f2a3a">${l}</p>`).join('');
  const cta = opts.cta
    ? `<a href="${esc(opts.cta.href)}" style="display:inline-block;margin:8px 0 4px;padding:12px 22px;border-radius:999px;background:linear-gradient(100deg,#5AD0CB,#A9C4EE,#CB9DDD);color:#1a1a2e;font-weight:700;font-size:14px;text-decoration:none">${esc(opts.cta.label)}</a>`
    : '';
  const note = opts.note
    ? `<p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#9a93a8">${esc(opts.note)}</p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f4f0f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#40384e;margin-bottom:20px">Visby</div>
    <div style="background:#ffffff;border-radius:20px;padding:28px 26px;box-shadow:0 8px 28px rgba(60,50,80,.08)">
      <h1 style="margin:0 0 16px;font-size:19px;font-weight:700;color:#1a1a2e">${esc(opts.heading)}</h1>
      ${body}${cta}${note}
    </div>
    <p style="margin:18px 6px 0;font-size:12px;color:#9a93a8">Visby — chain-verified provenance for physical goods. You're receiving this because of activity on your Visby account.</p>
  </div></body></html>`;
}

function text(lines: string[], note?: string): string {
  return lines.map(l => l.replace(/<[^>]+>/g, '')).join('\n\n') + (note ? `\n\n${note}` : '') + '\n\n— Visby';
}

const itemLink = (itemId: string) => url(`/item/${itemId}`);

export function orderSoldSeller(i: { itemId: string; priceUsd: number | null; productName?: string | null }): EmailMsg {
  const name = i.productName ? esc(i.productName) : 'your Tally';
  return {
    subject: 'Your Tally sold on Visby',
    html: layout({ heading: 'You made a sale', lines: [`<strong>${name}</strong> sold for ${money(i.priceUsd)}.`, 'Open your dashboard to fulfill and ship it.'], cta: { label: 'Fulfill order', href: url('/dashboard') }, note: DEVNET_NOTE }),
    text: text([`You made a sale: ${i.productName ?? 'your Tally'} sold for ${money(i.priceUsd)}.`, `Fulfill it: ${url('/dashboard')}`], DEVNET_NOTE),
  };
}

export function securityAlert(i: { label: string; when: string; device?: string | null }): EmailMsg {
  const dev = i.device ? ` from ${esc(i.device.slice(0, 60))}` : '';
  return {
    subject: `Visby security alert: ${i.label}`,
    html: layout({
      heading: 'Security alert',
      lines: [
        `We detected <strong>${esc(i.label)}</strong> on your Visby account${dev}.`,
        `When: ${esc(i.when)}`,
        'If this was you, no action is needed. If not, review your active sessions and turn on two-factor authentication in Settings → Security right away.',
      ],
      cta: { label: 'Review security', href: url('/settings') },
    }),
    text: text([
      `Visby security alert: ${i.label}${i.device ? ` from ${i.device.slice(0, 60)}` : ''} at ${i.when}.`,
      `If this wasn't you, review your security settings: ${url('/settings')}`,
    ]),
  };
}

export function orderPlacedBuyer(i: { itemId: string; priceUsd: number | null; productName?: string | null }): EmailMsg {
  const name = i.productName ? esc(i.productName) : 'your Tally';
  return {
    subject: 'Your Visby order is confirmed',
    html: layout({ heading: 'Order confirmed', lines: [`Thanks for your purchase of <strong>${name}</strong> for ${money(i.priceUsd)}.`, "We'll email you again when it ships."], cta: { label: 'View order', href: itemLink(i.itemId) }, note: DEVNET_NOTE }),
    text: text([`Order confirmed: ${i.productName ?? 'your Tally'} for ${money(i.priceUsd)}.`, `View it: ${itemLink(i.itemId)}`], DEVNET_NOTE),
  };
}

export function orderShippedBuyer(i: { itemId: string; carrier: string | null; tracking: string | null }): EmailMsg {
  const track = i.tracking ? `${i.carrier ? esc(i.carrier) + ' ' : ''}tracking: <strong>${esc(i.tracking)}</strong>` : 'Tracking will appear in your order shortly.';
  return {
    subject: 'Your Visby order has shipped',
    html: layout({ heading: 'On its way', lines: ['Your order has shipped.', track], cta: { label: 'Track order', href: itemLink(i.itemId) } }),
    text: text(['Your order has shipped.', i.tracking ? `${i.carrier ?? ''} tracking: ${i.tracking}` : 'Tracking will appear shortly.', `Track: ${itemLink(i.itemId)}`]),
  };
}

export function orderDeliveredSeller(i: { itemId: string; netUsd: number | null; payoutReleased: boolean }): EmailMsg {
  const payoutLine = i.payoutReleased
    ? `Your payout of <strong>${money(i.netUsd)}</strong> has been released to your wallet.`
    : 'The buyer confirmed delivery.';
  return {
    subject: i.payoutReleased ? 'Delivery confirmed — payout released' : 'Delivery confirmed',
    html: layout({ heading: 'Delivery confirmed', lines: [payoutLine], cta: { label: 'View dashboard', href: url('/dashboard') }, note: i.payoutReleased ? DEVNET_NOTE : undefined }),
    text: text(['Delivery confirmed.', i.payoutReleased ? `Payout of ${money(i.netUsd)} released to your wallet.` : '', `Dashboard: ${url('/dashboard')}`].filter(Boolean), i.payoutReleased ? DEVNET_NOTE : undefined),
  };
}

export function reviewRequestBuyer(i: { itemId: string; productName?: string | null; token: string }): EmailMsg {
  const name = i.productName ? esc(i.productName) : 'your Tally';
  const href = url(`/review/${i.token}`);
  return {
    subject: 'How was your Visby order?',
    html: layout({
      heading: 'Leave a review',
      lines: [`Your order of <strong>${name}</strong> was delivered.`, 'How did it go? A quick rating helps other buyers shop with confidence — it only takes a moment.'],
      cta: { label: 'Rate your purchase', href },
    }),
    text: text([`Your order of ${i.productName ?? 'your Tally'} was delivered.`, 'Rate your purchase:', href]),
  };
}

export function newDeviceEmail(i: { platform?: string | null; userAgent?: string | null; ip?: string | null }): EmailMsg {
  const where = [i.platform, i.ip].filter(Boolean).map((s) => esc(String(s))).join(' · ') || 'a new device';
  return {
    subject: 'New sign-in to your Visby account',
    html: layout({
      heading: 'New device signed in',
      lines: [
        `Your Visby account was just signed in on <strong>${where}</strong>.`,
        'If this was you, you can ignore this email. If not, open Settings → Security and use “Log out other devices,” then review your two-factor settings.',
      ],
      cta: { label: 'Review security', href: url('/settings') },
      note: i.userAgent ? `Device: ${esc(String(i.userAgent)).slice(0, 160)}` : undefined,
    }),
    text: text([`New sign-in to your Visby account on ${i.platform ?? 'a new device'}${i.ip ? ` (${i.ip})` : ''}.`, 'If this was not you: Settings → Security → Log out other devices.', `Review: ${url('/settings')}`]),
  };
}

export function disputeOpenedSeller(i: { itemId: string; kind: string }): EmailMsg {
  return {
    subject: 'A dispute was opened on your sale',
    html: layout({ heading: 'Dispute opened', lines: [`A buyer opened a <strong>${esc(i.kind)}</strong> dispute on one of your orders.`, 'Please review and respond from your dashboard.'], cta: { label: 'Review dispute', href: url('/dashboard') } }),
    text: text([`A buyer opened a ${i.kind} dispute on your order.`, `Review it: ${url('/dashboard')}`]),
  };
}

export function disputeResolvedBuyer(i: { itemId: string }): EmailMsg {
  return {
    subject: 'Update on your Visby dispute',
    html: layout({ heading: 'Dispute resolved', lines: ['Your dispute has been reviewed and resolved.', 'See the outcome and details in your dashboard.'], cta: { label: 'View details', href: url('/dashboard') } }),
    text: text(['Your dispute has been reviewed and resolved.', `Details: ${url('/dashboard')}`]),
  };
}

export function refundIssuedBuyer(i: { itemId: string; priceUsd: number | null }): EmailMsg {
  return {
    subject: 'Your Visby refund has been issued',
    html: layout({ heading: 'Refund issued', lines: [`A refund of <strong>${money(i.priceUsd)}</strong> has been issued for your order.`, 'Depending on your payment method it may take a few days to appear.'], cta: { label: 'View order', href: itemLink(i.itemId) }, note: DEVNET_NOTE }),
    text: text([`A refund of ${money(i.priceUsd)} has been issued for your order.`, `View it: ${itemLink(i.itemId)}`], DEVNET_NOTE),
  };
}

export function sdkOrderCompletedBuyer(i: { productName: string | null; amountUsd: number | null; minted: boolean; nftAddress: string | null }): EmailMsg {
  const name = i.productName ? esc(i.productName) : 'your purchase';
  const prov = i.minted
    ? 'A Visby provenance Tally was minted for this item — your proof of authenticity travels with it.'
    : 'Your provenance Tally is being prepared and will be linked to your purchase shortly.';
  return {
    subject: 'Your purchase is confirmed — Visby',
    html: layout({ heading: 'Purchase confirmed', lines: [`Thanks for buying <strong>${name}</strong> for ${money(i.amountUsd)}.`, prov], note: DEVNET_NOTE }),
    text: text([`Purchase confirmed: ${i.productName ?? 'your purchase'} for ${money(i.amountUsd)}.`, prov], DEVNET_NOTE),
  };
}
