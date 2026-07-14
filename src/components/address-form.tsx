'use client';

import { useState } from 'react';
import { S, t, input } from '@/lib/ui';

export type ShipTo = {
  name: string; line1: string; line2: string;
  city: string; state: string; postal: string; country: string;
  phone?: string;
};
export const EMPTY_SHIP_TO: ShipTo = { name: '', line1: '', line2: '', city: '', state: '', postal: '', country: 'US', phone: '' };

// ISO 3166-1 alpha-2 — matches the code already stored in ship_address.country / profiles.ship_to
// (EMPTY_SHIP_TO defaults to 'US', and src/lib/shipping/atoship.ts's Addr.country passes it straight
// through to the carrier API), so switching the free-text field to a <select> doesn't change the
// wire format downstream. US pinned first, then everything else alphabetical by name.
export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'US', name: 'United States' },
  { code: 'AU', name: 'Australia' },
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BR', name: 'Brazil' },
  { code: 'CA', name: 'Canada' },
  { code: 'CL', name: 'Chile' },
  { code: 'CN', name: 'China' },
  { code: 'CO', name: 'Colombia' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'GR', name: 'Greece' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IN', name: 'India' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IL', name: 'Israel' },
  { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'MX', name: 'Mexico' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'NO', name: 'Norway' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'SG', name: 'Singapore' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'KR', name: 'South Korea' },
  { code: 'ES', name: 'Spain' },
  { code: 'SE', name: 'Sweden' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'TH', name: 'Thailand' },
  { code: 'TR', name: 'Turkey' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'VN', name: 'Vietnam' },
];

// Format check, not a hard gate on which countries are allowed — a country not listed here (or a
// postal format we don't specifically know) only needs to be non-empty. Real deliverability for an
// unusual country/postal combo is the shipping-rate call's problem to surface, not this form's.
function postalValid(country: string, postal: string): boolean {
  const p = postal.trim();
  if (!p) return false;
  if (country === 'US') return /^\d{5}(-\d{4})?$/.test(p);
  if (country === 'CA') return /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/.test(p);
  if (country === 'GB') return /^[A-Za-z0-9]{2,4}\s?[A-Za-z0-9]{2,4}$/.test(p);
  return p.length > 0;
}

export function shipToValid(v: ShipTo): boolean {
  return !!(
    v.line1.trim() &&
    v.city.trim() &&
    v.country.trim() &&
    (v.country !== 'US' || v.state.trim()) &&
    postalValid(v.country, v.postal)
  );
}

// One-line summary for showing a saved address compactly.
export function shipToSummary(v: Partial<ShipTo> | null | undefined): string {
  if (!v || !v.line1) return '';
  return [v.name, v.line1, v.line2, [v.city, v.state].filter(Boolean).join(', '), v.postal]
    .filter(Boolean).join(' · ');
}

type FieldKey = 'line1' | 'city' | 'state' | 'postal' | 'country';

function fieldError(k: FieldKey, v: ShipTo): string | null {
  if (k === 'line1')   return v.line1.trim() ? null : 'Street address is required';
  if (k === 'city')    return v.city.trim() ? null : 'City is required';
  if (k === 'state')   return (v.country === 'US' && !v.state.trim()) ? 'State is required' : null;
  if (k === 'country') return v.country.trim() ? null : 'Country is required';
  if (k === 'postal') {
    if (!v.postal.trim()) return 'Postal code is required';
    return postalValid(v.country, v.postal) ? null : 'Enter a valid postal code for this country';
  }
  return null;
}

export function AddressForm({ value, onChange }: { value: ShipTo; onChange: (v: ShipTo) => void }) {
  const cell = { ...input(), boxSizing: 'border-box' as const };
  const errText = { ...t('meta'), color: 'var(--danger)' };
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});

  const set = (k: keyof ShipTo, val: string) => onChange({ ...value, [k]: val });
  const touch = (k: FieldKey) => setTouched(prev => ({ ...prev, [k]: true }));
  const err = (k: FieldKey) => (touched[k] ? fieldError(k, value) : null);

  // Guards a pre-existing saved address whose country was free-typed before this field became a
  // <select> (e.g. "United States" instead of "US") — keep it selectable instead of silently
  // snapping to the first option and changing the stored country out from under the user.
  const countryOptions = value.country && !COUNTRIES.some(c => c.code === value.country)
    ? [{ code: value.country, name: value.country }, ...COUNTRIES]
    : COUNTRIES;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
      <input value={value.name} onChange={e => set('name', e.target.value)} maxLength={200} placeholder="Full name" style={cell} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <input
          value={value.line1}
          onChange={e => set('line1', e.target.value)}
          onBlur={() => touch('line1')}
          maxLength={200}
          placeholder="Address line 1"
          style={cell}
        />
        {err('line1') && <span style={errText}>{err('line1')}</span>}
      </div>

      <input value={value.line2} onChange={e => set('line2', e.target.value)} maxLength={200} placeholder="Apt, suite (optional)" style={cell} />

      <div style={{ display: 'flex', gap: S[2] }}>
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input
            value={value.city}
            onChange={e => set('city', e.target.value)}
            onBlur={() => touch('city')}
            maxLength={200}
            placeholder="City"
            style={cell}
          />
          {err('city') && <span style={errText}>{err('city')}</span>}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input
            value={value.state}
            onChange={e => set('state', e.target.value)}
            onBlur={() => touch('state')}
            maxLength={100}
            placeholder={value.country === 'US' ? 'State' : 'State / region (optional)'}
            style={cell}
          />
          {err('state') && <span style={errText}>{err('state')}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: S[2] }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input
            value={value.postal}
            onChange={e => set('postal', e.target.value)}
            onBlur={() => touch('postal')}
            maxLength={20}
            placeholder="Postal code"
            style={cell}
          />
          {err('postal') && <span style={errText}>{err('postal')}</span>}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <select
            value={value.country}
            onChange={e => set('country', e.target.value)}
            onBlur={() => touch('country')}
            style={cell}
          >
            {countryOptions.map(c => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
          {err('country') && <span style={errText}>{err('country')}</span>}
        </div>
      </div>

      <input
        value={value.phone ?? ''}
        onChange={e => set('phone', e.target.value)}
        maxLength={30}
        type="tel"
        placeholder="Phone (optional)"
        style={cell}
      />
    </div>
  );
}
