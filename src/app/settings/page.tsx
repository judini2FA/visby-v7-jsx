'use client';

import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ThemeToggle, useTheme } from '@/lib/theme';
import { CURRENCIES, useCurrency } from '@/lib/currency';
import { S, t, surface, btn, sectionLabel, T } from '@/lib/ui';
import ShipToSettings from '@/components/ship-to-settings';
import AddressBook from '@/components/address-book';
import SecuritySettings from '@/components/security-settings';
import { HeaderMenu } from '@/components/layout/header-menu';

const C = {
  red: 'var(--danger)',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: S[6] }}>
      <div style={{ ...sectionLabel(), marginBottom: S[3], paddingLeft: S[1] }}>{title}</div>
      <div style={{ ...surface({ radius: 'var(--r)' }), overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

function Row({ icon, label, sublabel, right, onClick, border = true }: { icon: React.ReactNode; label: string; sublabel?: string; right?: React.ReactNode; onClick?: () => void; border?: boolean }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: S[3], padding: '12px 16px', borderBottom: border ? '1px solid var(--divider)' : 'none', cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ ...surface({ radius: 'var(--r-sm)' }), width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...t('body'), color: T.textStrong }}>{label}</div>
        {sublabel && <div style={{ ...t('meta'), color: T.textMuted, marginTop: 1 }}>{sublabel}</div>}
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
    <button onClick={onToggle} style={{ width: 44, height: 26, borderRadius: 13, background: on ? T.gradBrand : 'var(--surface-bg)', backgroundClip: 'border-box', backgroundOrigin: 'border-box', backgroundSize: '100% 100%', border: `1.5px solid ${on ? 'transparent' : 'var(--glass-border)'}`, boxShadow: 'inset 0 1px 3px rgba(0,0,0,.28)', position: 'relative', cursor: 'pointer', transition: 'all .2s', flexShrink: 0, padding: 0 }}>
      <div style={{ width: 20, height: 20, borderRadius: '50%', background: on ? '#fff' : 'var(--text-muted)', position: 'absolute', top: 1, left: on ? 20 : 1, transition: 'left .2s, background .2s' }} />
    </button>
  );

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)' }}>
        <div className="visby-inner" style={{ paddingTop: S[3], paddingBottom: S[3], display: 'flex', alignItems: 'center', gap: S[3] }}>
          <button onClick={() => router.back()} style={{ ...btn('secondary', { pill: false }), padding: '6px 10px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{ ...t('title'), color: T.textStrong }}>Settings</div>
          <div style={{ marginLeft: 'auto' }}><HeaderMenu /></div>
        </div>
      </div>

      <div className="visby-inner" style={{ paddingTop: S[5], paddingBottom: 100 }}>

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
          <div style={{ padding: '12px 16px' }}>
            <div style={{ ...t('meta'), color: T.textMuted, marginBottom: S[3] }}>Prices are shown in your chosen currency. Transactions always settle in USDC.</div>
            <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
              {CURRENCIES.map(c => (
                currency === c
                  ? <button key={c} onClick={() => setCurrency(c)} style={{ ...btn('primary'), padding: '7px 14px' }}>{c}</button>
                  : <button key={c} onClick={() => setCurrency(c)} style={{ ...btn('secondary'), padding: '7px 14px', color: T.textMuted }}>{c}</button>
              ))}
            </div>
          </div>
        </Section>

        {/* Shipping address */}
        {solanaWallets[0]?.address && (
          <Section title="Shipping">
            <div style={{ padding: '14px 16px' }}>
              <ShipToSettings wallet={solanaWallets[0].address} />
            </div>
          </Section>
        )}

        {/* Address book */}
        {solanaWallets[0]?.address && (
          <Section title="Address Book">
            <div style={{ padding: '14px 16px' }}>
              <AddressBook wallet={solanaWallets[0].address} />
            </div>
          </Section>
        )}

        {/* Payment Methods */}
        <Section title="Payment Methods">
          <Row
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>}
            label="Credit / Debit Cards"
            sublabel="Secure card payments"
            right={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>}
            onClick={() => router.push('/profile')}
          />
          <Row
            border={false}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>}
            label="Crypto (SOL, USDC)"
            sublabel="Pay directly from your Visby wallet"
            right={<span style={{ ...t('micro'), color: 'var(--ok)' }}>Active</span>}
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
                  style={{ ...btn('primary', { pill: false }), padding: '7px 14px', opacity: creating ? 0.7 : 1 }}>
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
                <button onClick={() => exportWallet()} style={{ ...btn('secondary', { pill: false }), padding: '7px 12px', color: T.textMuted }}>
                  Export
                </button>
              }
            />
          ))}
        </Section>

        {/* Security */}
        <Section title="Security">
          <SecuritySettings />
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
        <div style={{ marginBottom: S[6] }}>
          <div style={{ ...sectionLabel(), marginBottom: S[3], paddingLeft: S[1] }}>Account</div>
          <button onClick={logout} style={btn('danger', { full: true })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="1.8" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>

      </div>
    </div>
  );
}
