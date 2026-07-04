'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { S, t, T, card, surface, input, btn, sectionLabel } from '@/lib/ui';
import { HeaderMenu } from '@/components/layout/header-menu';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'What is Visby?',
    a: 'Visby is a marketplace for buying and selling real, physical luxury goods — sneakers, watches, bags, and more. Every item you buy or sell is backed by a permanent digital record of its history, so you always know it’s genuine and can see everyone who’s owned it before you.',
  },
  {
    q: 'What is a "Tally"?',
    a: 'A Tally is an item’s tamper-proof certificate of authenticity — its verified history. It records every owner the item has ever had and proves it’s the real thing, and it travels with the item whenever it changes hands. When you buy something on Visby, its Tally becomes yours. You don’t need to know anything about the technology behind it — it just works in the background so you always know your item is genuine.',
  },
  {
    q: 'How does buying work?',
    a: 'Find an item you like, tap Buy, and pay with a card, bank transfer, or crypto — whichever you prefer. Once payment goes through, the seller ships the item to you and the ownership record updates to show you as the new owner. You can track your order from the Notifications tab.',
  },
  {
    q: 'How does selling work, and what’s the fee?',
    a: 'Tap Sell from the bottom menu, list an item with photos and a price, and it goes live on the marketplace. When it sells, Visby takes a 9% fee to cover payment processing, buyer protection, and running the marketplace — the rest is yours. Payouts go to whatever payout method you’ve set up under Profile > Wallet.',
  },
  {
    q: 'What payment methods can I use?',
    a: 'You can pay with a credit or debit card, a linked bank account, or crypto (like SOL or USDC) if you already have a wallet. All three are accepted for buying, and you can choose how you get paid out as a seller too.',
  },
  {
    q: 'How does shipping work?',
    a: 'Once a sale is confirmed, the seller prints a prepaid shipping label right from the app and drops the package off or schedules a pickup. You’ll get tracking updates in Notifications as it moves, and the order is marked delivered once it arrives.',
  },
  {
    q: 'What if my item never arrives, or isn’t what I expected?',
    a: 'Open the order from your Notifications > Sales History (or Purchases) and look for the option to start a return or report a problem. That opens a dispute our team reviews, and refunds are issued back to your original payment method when a claim is approved.',
  },
  {
    q: 'Is buying and selling on Visby safe?',
    a: 'Yes. Payments are held securely until a sale is confirmed, every item’s ownership history is permanently recorded and can’t be faked, and our team reviews disputes if anything goes wrong. If you ever have a concern, use the contact form below and we’ll get back to you.',
  },
];

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s var(--ease)', flexShrink: 0 }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function FaqItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <div style={{ borderBottom: '1px solid var(--divider)' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[3],
          background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
          padding: `${S[3]}px ${S[4]}px`,
        }}
      >
        <span style={{ ...t('heading'), color: T.textStrong }}>{q}</span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div style={{ padding: `0 ${S[4]}px ${S[4]}px` }}>
          <div style={{ ...t('body'), color: T.textMuted }}>{a}</div>
        </div>
      )}
    </div>
  );
}

type SendState = 'idle' | 'sending' | 'sent' | 'error';

export default function HelpPage() {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const router = useRouter();

  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [orderId, setOrderId] = useState('');
  const [sendState, setSendState] = useState<SendState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Prefill from the signed-in Privy user once ready, but never clobber a value the visitor
  // already typed (relevant for signed-out visitors who start typing before Privy resolves).
  useEffect(() => {
    if (ready && authenticated && !emailTouched && user?.email?.address) {
      setEmail(user.email.address);
    }
  }, [ready, authenticated, user?.email?.address, emailTouched]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sendState === 'sending') return;
    setErrorMsg('');

    if (!email.trim() || !message.trim()) {
      setSendState('error');
      setErrorMsg('Please enter your email and a message.');
      return;
    }

    setSendState('sending');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (ready && authenticated) {
        try {
          const token = await getAccessToken();
          if (token) headers.Authorization = `Bearer ${token}`;
        } catch { /* proceed signed-out */ }
      }

      const res = await fetch('/api/support/submit', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: email.trim(),
          subject: subject.trim(),
          message: message.trim(),
          order_id: orderId.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setSendState('error');
        setErrorMsg(j?.error || 'Something went wrong — please try again.');
        return;
      }

      setSendState('sent');
      setSubject('');
      setMessage('');
      setOrderId('');
    } catch {
      setSendState('error');
      setErrorMsg('Could not reach the server — check your connection and try again.');
    }
  }

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)' }}>
        <div className="visby-inner" style={{ paddingTop: S[3], paddingBottom: S[3], display: 'flex', alignItems: 'center', gap: S[3] }}>
          <button onClick={() => router.back()} style={{ ...btn('secondary', { pill: false }), padding: '6px 10px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{ ...t('title'), color: T.textStrong }}>Help</div>
          <div style={{ marginLeft: 'auto' }}><HeaderMenu /></div>
        </div>
      </div>

      <div className="visby-inner" style={{ paddingTop: S[5], paddingBottom: 100 }}>

        {/* FAQ */}
        <div style={{ marginBottom: S[6] }}>
          <div style={{ ...sectionLabel(), marginBottom: S[3], paddingLeft: S[1] }}>Frequently Asked Questions</div>
          <div style={{ ...card({ radius: 'var(--r-lg)' }), overflow: 'hidden', padding: 0 }}>
            {FAQS.map((item, i) => (
              <FaqItem
                key={item.q}
                q={item.q}
                a={item.a}
                open={openIndex === i}
                onToggle={() => setOpenIndex(prev => (prev === i ? null : i))}
              />
            ))}
          </div>
        </div>

        {/* Contact us */}
        <div>
          <div style={{ ...sectionLabel(), marginBottom: S[3], paddingLeft: S[1] }}>Contact Us</div>
          <div style={{ ...card({ radius: 'var(--r-lg)', pad: S[4] }) }}>
            {sendState === 'sent' ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: S[3], padding: `${S[4]}px 0` }}>
                <div style={{ ...surface({ radius: '50%' }), width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--aqua)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div style={{ ...t('heading'), color: T.textStrong }}>We’ve got your message</div>
                <div style={{ ...t('body'), color: T.textMuted, maxWidth: 340 }}>
                  Thanks for reaching out — our team will reply to {email || 'your email'} as soon as possible.
                </div>
                <button onClick={() => setSendState('idle')} style={{ ...btn('secondary'), marginTop: S[2] }}>Send another message</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
                <div style={{ ...t('body'), color: T.textMuted, marginBottom: S[1] }}>
                  Can’t find your answer above? Send us a message and we’ll get back to you by email.
                </div>

                <div>
                  <label style={{ ...t('meta'), color: T.textMuted, display: 'block', marginBottom: 6 }}>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setEmailTouched(true); }}
                    placeholder="you@example.com"
                    required
                    maxLength={200}
                    style={input()}
                  />
                </div>

                <div>
                  <label style={{ ...t('meta'), color: T.textMuted, display: 'block', marginBottom: 6 }}>Subject (optional)</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="What's this about?"
                    maxLength={200}
                    style={input()}
                  />
                </div>

                <div>
                  <label style={{ ...t('meta'), color: T.textMuted, display: 'block', marginBottom: 6 }}>Order ID (optional)</label>
                  <input
                    type="text"
                    value={orderId}
                    onChange={e => setOrderId(e.target.value)}
                    placeholder="If this is about a specific order"
                    maxLength={200}
                    style={input()}
                  />
                </div>

                <div>
                  <label style={{ ...t('meta'), color: T.textMuted, display: 'block', marginBottom: 6 }}>Message</label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Tell us what's going on..."
                    required
                    maxLength={4000}
                    rows={6}
                    style={{ ...input(), resize: 'vertical', fontFamily: "'Manrope',sans-serif" }}
                  />
                </div>

                {sendState === 'error' && errorMsg && (
                  <div style={{ ...t('meta'), color: 'var(--danger)' }}>{errorMsg}</div>
                )}

                <button type="submit" disabled={sendState === 'sending'} style={{ ...btn('primary', { full: true }), opacity: sendState === 'sending' ? 0.7 : 1 }}>
                  {sendState === 'sending' ? 'Sending…' : 'Send message'}
                </button>
              </form>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
