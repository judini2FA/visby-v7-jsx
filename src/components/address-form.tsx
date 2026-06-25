'use client';

import { S, input } from '@/lib/ui';

export type ShipTo = {
  name: string; line1: string; line2: string;
  city: string; state: string; postal: string; country: string;
};
export const EMPTY_SHIP_TO: ShipTo = { name: '', line1: '', line2: '', city: '', state: '', postal: '', country: 'US' };

export function shipToValid(v: ShipTo): boolean {
  return !!(v.line1.trim() && v.city.trim() && v.state.trim() && v.postal.trim());
}

// One-line summary for showing a saved address compactly.
export function shipToSummary(v: Partial<ShipTo> | null | undefined): string {
  if (!v || !v.line1) return '';
  return [v.name, v.line1, v.line2, [v.city, v.state].filter(Boolean).join(', '), v.postal]
    .filter(Boolean).join(' · ');
}

export function AddressForm({ value, onChange }: { value: ShipTo; onChange: (v: ShipTo) => void }) {
  const cell = { ...input(), boxSizing: 'border-box' as const };
  const set = (k: keyof ShipTo, val: string) => onChange({ ...value, [k]: val });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
      <input value={value.name}  onChange={e => set('name', e.target.value)}  maxLength={200} placeholder="Full name" style={cell} />
      <input value={value.line1} onChange={e => set('line1', e.target.value)} maxLength={200} placeholder="Address line 1" style={cell} />
      <input value={value.line2} onChange={e => set('line2', e.target.value)} maxLength={200} placeholder="Apt, suite (optional)" style={cell} />
      <div style={{ display: 'flex', gap: S[2] }}>
        <input value={value.city}  onChange={e => set('city', e.target.value)}  maxLength={200} placeholder="City"  style={{ ...cell, flex: 2 }} />
        <input value={value.state} onChange={e => set('state', e.target.value)} maxLength={100} placeholder="State" style={{ ...cell, flex: 1 }} />
      </div>
      <div style={{ display: 'flex', gap: S[2] }}>
        <input value={value.postal}  onChange={e => set('postal', e.target.value)}  maxLength={20}  inputMode="numeric" placeholder="ZIP"     style={{ ...cell, flex: 1 }} />
        <input value={value.country} onChange={e => set('country', e.target.value)} maxLength={100} placeholder="Country" style={{ ...cell, flex: 1 }} />
      </div>
    </div>
  );
}
