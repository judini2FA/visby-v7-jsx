'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { useVisbWallet } from '@/lib/wallet';

const C = {
  navy: 'transparent', teal: '#5ED9D1', cyan: '#6DE4D5',
  blue: '#59B4F5', mag: '#D54AF2', muted: 'var(--text-muted)',
  green: '#00C48C', red: '#FF3B5C',
};
const GH = `linear-gradient(90deg,${C.cyan},${C.blue} 50%,${C.mag})`;

type Tab = 'notifications' | 'sales' | 'messages';

// ─────────────────────────────────────────────────────────────
// NOTIFICATIONS tab
// ─────────────────────────────────────────────────────────────
function NotificationsTab({ wallet }: { wallet: string }) {
  const { data: likeNotifs = [], isLoading } = trpc.likes.getForOwner.useQuery(
    { owner_wallet: wallet },
    { enabled: !!wallet }
  );

  if (isLoading) return (
    <div style={{ paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1,2,3].map(i => <div key={i} style={{ height: 64, background: 'var(--glass-bg)', borderRadius: 20, animation: 'pulse 2s infinite' }} />)}
    </div>
  );

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {likeNotifs.map((n: any) => (
          <div key={n.item_id} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--divider)' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 2 }}>{n.count} like{n.count !== 1 ? 's' : ''}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.item_name}</div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, paddingTop: 2 }}>{new Date(n.latest_at).toLocaleDateString()}</div>
          </div>
        ))}
        {likeNotifs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No notifications yet</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>When someone likes your item you'll see it here</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SALES HISTORY tab
// ─────────────────────────────────────────────────────────────
function SalesTab({ wallet }: { wallet: string }) {
  const { data: sales = [], isLoading } = trpc.listings.getSoldByWallet.useQuery(
    { wallet },
    { enabled: !!wallet }
  );

  const totalRevenue = sales.reduce((a: number, s: any) => a + (s.price_usdc ?? 0), 0);
  const avgPrice     = sales.length ? totalRevenue / sales.length : 0;

  if (isLoading) return (
    <div style={{ paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1,2,3].map(i => <div key={i} style={{ height: 72, background: 'var(--glass-bg)', borderRadius: 20, animation: 'pulse 2s infinite' }} />)}
    </div>
  );

  return (
    <div style={{ paddingTop: 16 }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
        {[
          { label: 'Total Revenue',  value: `$${totalRevenue.toFixed(2)}`, color: C.green },
          { label: 'Items Sold',     value: String(sales.length),          color: 'var(--text-strong)' },
          { label: 'Avg Sale Price', value: sales.length ? `$${avgPrice.toFixed(2)}` : '—', color: 'var(--text-strong)' },
          { label: 'Network',        value: 'Solana',                      color: C.muted },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: '1px solid var(--glass-border)', borderRadius: 20, boxShadow: 'var(--glass-shadow), var(--glass-inner)', padding: '14px 12px' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color, marginBottom: 3 }}>{s.value}</div>
            <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {sales.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 8 }}>No sales yet</div>
          <div style={{ fontSize: 12, color: C.muted }}>List an item on the Sell page to get started</div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            Completed Sales · {sales.length}
          </div>
          {sales.map((sale: any, i: number) => {
            const item   = sale.items;
            if (!item) return null;
            const date   = new Date(sale.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const txHash = sale.tx_hash ?? '';
            const method = txHash.startsWith('pi_') || txHash.startsWith('stripe_') ? 'Card'
                         : txHash.length > 0 ? 'Crypto' : '—';
            return (
              <Link key={sale.id} href={`/item/${item.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--divider)' }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--glass-bg)', overflow: 'hidden', flexShrink: 0 }}>
                    {item.image_url
                      ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9, background: `${C.green}18`, color: C.green, borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>SOLD</span>
                      <span style={{ fontSize: 9, background: 'var(--glass-bg)', color: C.muted, borderRadius: 4, padding: '1px 6px' }}>{method}</span>
                      <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{date}</span>
                    </div>
                    {sale.owner_wallet && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        → {sale.owner_wallet.slice(0,6)}…{sale.owner_wallet.slice(-4)}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: C.green }}>
                      {sale.price_usdc ? `+$${Number(sale.price_usdc).toFixed(2)}` : '—'}
                    </div>
                    <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>USD</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MESSAGES tab
// ─────────────────────────────────────────────────────────────
function MessagesTab({ wallet }: { wallet: string }) {
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const { data: conversations = [], isLoading, refetch } = trpc.messages.getConversations.useQuery(
    { wallet },
    { enabled: !!wallet, refetchInterval: 15000 }
  );

  const { data: thread = [], refetch: refetchThread } = trpc.messages.getThread.useQuery(
    { wallet_a: wallet, wallet_b: activeConv ?? '' },
    { enabled: !!wallet && !!activeConv, refetchInterval: 8000 }
  );

  const sendMsg = trpc.messages.send.useMutation({
    onSuccess: () => { setDraft(''); refetch(); refetchThread(); }
  });

  const markRead = trpc.messages.markRead.useMutation();

  function openConv(partnerWallet: string) {
    setActiveConv(partnerWallet);
    markRead.mutate({ from_wallet: partnerWallet, to_wallet: wallet });
  }

  if (isLoading) return (
    <div style={{ paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1,2,3].map(i => <div key={i} style={{ height: 72, background: 'var(--glass-bg)', borderRadius: 20, animation: 'pulse 2s infinite' }} />)}
    </div>
  );

  if (activeConv) {
    const partnerConv = conversations.find((c: any) => c.partner_wallet === activeConv);
    return (
      <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 220px)' }}>
        <button onClick={() => setActiveConv(null)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginBottom: 16, padding: 0, fontSize: 13 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back to conversations
        </button>
        <div style={{ fontWeight: 700, color: 'var(--text-strong)', marginBottom: 12, fontSize: 14 }}>
          {partnerConv?.partner_name ?? `${activeConv.slice(0,6)}…${activeConv.slice(-4)}`}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {thread.map((msg: any) => {
            const isMine = msg.from_wallet === wallet;
            return (
              <div key={msg.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '72%', background: isMine ? `linear-gradient(135deg,#6DE4D5,#59B4F5 50%,#D54AF2)` : 'var(--glass-bg-strong)', borderRadius: isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px', padding: '10px 14px', backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))', border: '1px solid var(--glass-border)' }}>
                  <div style={{ fontSize: 13, color: isMine ? '#fff' : 'var(--text-strong)', lineHeight: 1.5 }}>{msg.content}</div>
                  <div style={{ fontSize: 9, color: isMine ? 'rgba(255,255,255,.6)' : 'var(--text-muted)', marginTop: 4 }}>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
            );
          })}
          {thread.length === 0 && <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', paddingTop: 20 }}>Start the conversation</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && draft.trim()) { e.preventDefault(); sendMsg.mutate({ from_wallet: wallet, to_wallet: activeConv, content: draft.trim() }); } }}
            placeholder="Message…"
            style={{ flex: 1, background: 'var(--field-input-bg)', border: '1px solid var(--glass-border)', borderRadius: 16, padding: '10px 14px', color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: "'Manrope',sans-serif" }}
          />
          <button onClick={() => { if (draft.trim()) sendMsg.mutate({ from_wallet: wallet, to_wallet: activeConv, content: draft.trim() }); }}
            disabled={!draft.trim() || sendMsg.isPending}
            style={{ background: `linear-gradient(135deg,#6DE4D5,#59B4F5 50%,#D54AF2)`, border: 'none', borderRadius: 16, padding: '10px 16px', cursor: 'pointer', color: '#fff', fontWeight: 700, fontSize: 13, opacity: !draft.trim() ? 0.5 : 1 }}>
            Send
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 16 }}>
      {conversations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No messages yet</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Buyers can message you from item pages</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {conversations.map((conv: any) => (
            <button key={conv.partner_wallet} onClick={() => openConv(conv.partner_wallet)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--divider)', background: 'none', border: 'none', borderBottomColor: 'var(--divider)', borderBottomWidth: 1, borderBottomStyle: 'solid', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: `linear-gradient(135deg,#6DE4D5,#59B4F5)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                {(conv.partner_name ?? conv.partner_wallet).slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>{conv.partner_name ?? `${conv.partner_wallet.slice(0,6)}…${conv.partner_wallet.slice(-4)}`}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{new Date(conv.last_at).toLocaleDateString()}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.last_message}</div>
              </div>
              {conv.unread > 0 && (
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--glass-bg-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'var(--text)', flexShrink: 0 }}>{conv.unread}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────
export default function NotificationsPage() {
  const { ready, authenticated } = usePrivy();
  const { address: wallet }      = useVisbWallet();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('notifications');

  useEffect(() => {
    if (ready && !authenticated) router.push('/login');
  }, [ready, authenticated, router]);

  if (!ready || !authenticated) {
    return (
      <div style={{ background: 'transparent', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: `3px solid var(--text-muted)`, borderTopColor: 'transparent', animation: 'spin .8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'notifications', label: 'Notifications' },
    { id: 'sales',         label: 'Sales History' },
    { id: 'messages',      label: 'Messages'      },
  ];

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)' }}>
        <div className="visby-inner" style={{ paddingTop: 13, paddingBottom: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)' }}>Notifications</div>
          </div>

          {/* Tab slider */}
          <div style={{ display: 'flex', gap: 4, marginTop: 12, background: 'var(--glass-bg)', borderRadius: 22, padding: 4, overflow: 'hidden' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ flex: 1, background: tab === t.id ? GH : 'none', border: 'none', borderRadius: 18, padding: '8px 4px', cursor: 'pointer', fontFamily: "'Manrope',sans-serif", fontSize: 12, fontWeight: tab === t.id ? 700 : 400, color: tab === t.id ? '#fff' : 'var(--text-muted)', transition: 'all .15s' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="visby-inner" style={{ paddingBottom: 100 }}>
        {tab === 'notifications' && <NotificationsTab wallet={wallet} />}
        {tab === 'sales'         && <SalesTab wallet={wallet} />}
        {tab === 'messages'      && <MessagesTab wallet={wallet} />}
      </div>

      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes spin   { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
