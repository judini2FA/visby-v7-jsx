'use client';

import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { t, S, T, btn, input, sectionLabel, surface } from '@/lib/ui';

// Skippable step — POSTs to /api/buyer/addresses (grepped src/app/api/buyer/addresses/route.ts
// for the exact body shape: { wallet, address: { line1, city, state, postal, country }, make_default }).
// make_default: true so this becomes the buyer's default shipping address immediately.
export function StepAddress({ wallet, onNext, onSkip }: { wallet: string; onNext: () => void; onSkip: () => void }) {
  const { getAccessToken } = usePrivy();
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postal, setPostal] = useState('');
  const [country, setCountry] = useState('US');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const canSave = !!wallet && !!line1.trim() && !!city.trim() && !!state.trim() && !!postal.trim();

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true); setErr('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/buyer/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          wallet,
          address: {
            line1: line1.trim(),
            city: city.trim(),
            state: state.trim(),
            postal: postal.trim(),
            country: country.trim() || 'US',
          },
          make_default: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error || 'Could not save address — try again.'); return; }
      onNext();
    } catch {
      setErr('Could not save address — check your connection.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: S[4] }}>
      <div>
        <div style={{ ...t('title'), color: T.textStrong }}>Where should we ship?</div>
        <div style={{ ...t('body'), color: T.textMuted, marginTop: S[2] }}>
          Add a default shipping address so checkout is one tap. You can change this anytime.
        </div>
      </div>

      <div>
        <div style={{ ...sectionLabel(), marginBottom: S[2] }}>Street address</div>
        <input value={line1} onChange={e => setLine1(e.target.value)} placeholder="123 Main St" style={input()} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S[3] }}>
        <div>
          <div style={{ ...sectionLabel(), marginBottom: S[2] }}>City</div>
          <input value={city} onChange={e => setCity(e.target.value)} placeholder="San Francisco" style={input()} />
        </div>
        <div>
          <div style={{ ...sectionLabel(), marginBottom: S[2] }}>State</div>
          <input value={state} onChange={e => setState(e.target.value)} placeholder="CA" style={input()} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S[3] }}>
        <div>
          <div style={{ ...sectionLabel(), marginBottom: S[2] }}>ZIP code</div>
          <input value={postal} onChange={e => setPostal(e.target.value)} placeholder="94103" style={input()} />
        </div>
        <div>
          <div style={{ ...sectionLabel(), marginBottom: S[2] }}>Country</div>
          <input value={country} onChange={e => setCountry(e.target.value)} placeholder="US" style={input()} />
        </div>
      </div>

      {err && <div style={{ ...surface({ pad: '10px 14px' }), ...t('meta'), color: 'var(--danger)', borderColor: 'var(--danger-soft)' }}>{err}</div>}

      <div style={{ display: 'flex', gap: S[2] }}>
        <button type="button" onClick={onSkip} style={{ ...btn('secondary'), flex: 1 }}>Skip for now</button>
        <button type="submit" disabled={!canSave || saving} style={{ ...btn('primary'), flex: 2, opacity: (!canSave || saving) ? 0.6 : 1, cursor: (!canSave || saving) ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Saving…' : 'Save address'}
        </button>
      </div>
    </form>
  );
}
