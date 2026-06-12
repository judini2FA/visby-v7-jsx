'use client';

import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ThemeToggle, useTheme } from '@/lib/theme';
import { CURRENCIES, useCurrency } from '@/lib/currency';

const C = {
  teal: '#5ED9D1', cyan: '#6DE4D5', blue: '#59B4F5', mag: '#D54AF2',
  muted: 'var(--text-muted)', green: '#00C48C', red: '#FF3B5C',
  border: 'var(--glass-border)',
};
const GH = `linear-gradient(90deg,${C.cyan},${C.blue} 50%,${C.mag})`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, paddingLeft: 4 }}>{title}</div>
      <div style={{ background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: '1px solid var(--glass-border)', borderRadius: 'var(--r)', boxShadow: 'var(--glass-shadow), var(--glass-inner)', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

function Row({ icon, label, sublabel, right, onClick, border = true }: { icon: React.ReactNode; label: string; sublabel?: string; right?: React.ReactNode; onClick?: () => void; border?: boolean }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: border ? '1px solid var(--divider)' : 'none', cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>{label}</div>
        {sublabel && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{sublabel}</div>}
      </div>
      {right}
    </div>
  );
}

export default function SettingsPage() {
  const { ready, authenticated, logout, exportWallet } = usePrivy();
  const { wallets: solanaWallets, createWallet } = useSolanaWallets();
  const { mode } = useTheme();
  const { currency, setCurrency } = useCurrency();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [privacyHistory, setPrivacyHistory] = useState(false);
  const [privateMode, setPrivateMode] = useState(false);

  useEffect(() => {
    if (ready && !authenticated) router.push('/login');
  }, [ready, authenticated, router]);

  useEffect(() => {
    try {
      setPrivacyHistory(localStorage.getItem('visby-privacy-history') === '1');
      setPrivateMode(localStorage.getItem('visby-private-mode') === '1');
    } catch {}
  }, []);

  function togglePrivacyHistory() {
    const next = !privacyHistory;
    setPrivacyHistory(next);
    try { localStorage.setItem('visby-privacy-history', next ? '1' : '0'); } catch {}
  }
  function togglePrivateMode() {
    const next = !privateMode;
    setPrivateMode(next);
    try { localStorage.setItem('visby-private-mode', next ? '1' : '0'); } catch {}
  }

  if (!ready || !authenticated) return (
    <div style={{ background: 'transparent', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: `3px solid var(--text-muted)`, borderTopColor: 'transparent', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  );

  const Toggle = ({ on, onToggle }: { on: boolean; onToggle: () => void }) => (
    <button onClick={onToggle} style={{ width: 44, height: 26, borderRadius: 13, background: on ? GH : 'var(--glass-bg)', border: `1.5px solid ${on ? 'transparent' : 'var(--glass-border)'}`, position: 'relative', cursor: 'pointer', transition: 'all .2s', flexShrink: 0, padding: 0 }}>
      <div style={{ width: 20, height: 20, borderRadius: '50%', background: on ? '#fff' : 'var(--text-muted)', position: 'absolute', top: 1, left: on ? 20 : 1, transition: 'left .2s, background .2s' }} />
    </button>
  );

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)' }}>
        <div className="visby-inner" style={{ paddingTop: 14, paddingBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.back()} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 10, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)' }}>Settings</div>
        </div>
      </div>

      <div className="visby-inner" style={{ paddingTop: 20, paddingBottom: 100 }}>

        {/* Appearance */}
        <Section title="Appearance">
          <Row
            border={false}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>}
            label="Theme"
            sublabel={mode === 'dark' ? 'Night mode' : 'Day mode'}
            right={<ThemeToggle />}
          />
        </Section>

        {/* Default Currency */}
        <Section title="Default Currency">
          <div style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Prices are shown in your chosen currency. Transactions always settle in USDC.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CURRENCIES.map(c => (
                <button key={c} onClick={() => setCurrency(c)}
                  style={{ background: currency === c ? GH : 'var(--glass-bg)', border: `1px solid ${currency === c ? 'transparent' : 'var(--glass-border)'}`, borderRadius: 'var(--pill)', padding: '7px 14px', fontSize: 13, fontWeight: currency === c ? 700 : 500, color: currency === c ? '#fff' : 'var(--text-muted)', cursor: 'pointer', fontFamily: "'Quicksand',sans-serif" }}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* Payment Methods */}
        <Section title="Payment Methods">
          <Row
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>}
            label="Credit / Debit Cards"
            sublabel="Powered by Stripe — secure card payments"
            right={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>}
            onClick={() => router.push('/profile')}
          />
          <Row
            border={false}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>}
            label="Crypto (SOL, USDC)"
            sublabel="Coming soon — Phase 3"
            right={<span style={{ fontSize: 10, color: C.muted, background: 'var(--glass-bg)', borderRadius: 6, padding: '3px 7px' }}>SOON</span>}
          />
        </Section>

        {/* Wallets */}
        <Section title="Wallets">
          {solanaWallets.length === 0 ? (
            <Row
              border={false}
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>}
              label="Create Solana Wallet"
              sublabel="No wallet linked yet"
              right={
                <button onClick={async () => { setCreating(true); try { await createWallet(); } catch {} setCreating(false); }} disabled={creating}
                  style={{ background: GH, border: 'none', borderRadius: 10, padding: '7px 14px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', opacity: creating ? 0.7 : 1 }}>
                  {creating ? '…' : 'Create'}
                </button>
              }
            />
          ) : solanaWallets.map((w, i) => (
            <Row
              key={w.address}
              border={i < solanaWallets.length - 1}
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="var(--text-muted)" stroke="none"><circle cx="12" cy="12" r="10"/></svg>}
              label={`${w.address.slice(0,6)}…${w.address.slice(-4)}`}
              sublabel="Solana wallet"
              right={
                <button onClick={() => exportWallet()} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 10, padding: '7px 12px', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                  Export
                </button>
              }
            />
          ))}
        </Section>

        {/* Privacy */}
        <Section title="Privacy">
          <Row
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
            label="Hide Sale History"
            sublabel="Your sold items won't be visible publicly"
            right={<Toggle on={privacyHistory} onToggle={togglePrivacyHistory} />}
          />
          <Row
            border={false}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>}
            label="Private Mode"
            sublabel="Hides Follow and Message buttons across the app"
            right={<Toggle on={privateMode} onToggle={togglePrivateMode} />}
          />
        </Section>

        {/* Account */}
        <Section title="Account">
          <Row
            border={false}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="1.8" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>}
            label="Sign Out"
            sublabel="You'll need to sign in again"
            onClick={logout}
            right={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>}
          />
        </Section>

      </div>
    </div>
  );
}
