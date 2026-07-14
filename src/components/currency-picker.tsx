'use client';

import { useMemo, useState } from 'react';
import { t, S, T, input, surface, sectionLabel } from '@/lib/ui';
import { CURRENCY_LIST, type Currency, type CurrencyMeta } from '@/lib/currency';

// Blueprint W2 — omni-currency picker. Self-contained (owns its own open/search state) so a caller
// just drops in <CurrencyPicker value={currency} onChange={setCurrency} />. Not wired into any page
// yet — Settings adopts it separately.

const SearchIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
  </svg>
);
const ChevronDown = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

function matches(meta: CurrencyMeta, needle: string): boolean {
  if (!needle) return true;
  return meta.code.toLowerCase().includes(needle) || meta.name.toLowerCase().includes(needle);
}

function Row({ meta, selected, onSelect }: { meta: CurrencyMeta; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
        gap: S[3], padding: `${S[2]}px ${S[3]}px`, borderRadius: 'var(--r-sm)', border: 'none',
        cursor: 'pointer', textAlign: 'left',
        background: selected
          ? 'linear-gradient(135deg, rgba(37,205,184,.16), rgba(42,138,237,.16) 50%, rgba(188,45,230,.16))'
          : 'transparent',
        boxShadow: selected ? '0 4px 14px rgba(89,138,237,.16)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: S[3], minWidth: 0 }}>
        <span style={{ ...t('body'), color: T.textStrong, fontWeight: 700, width: 46, flexShrink: 0 }}>{meta.code}</span>
        <span style={{ ...t('meta'), color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.name}</span>
      </div>
      <span style={{ ...t('body'), color: selected ? T.textStrong : T.textMuted, flexShrink: 0, marginLeft: S[2] }}>{meta.symbol}</span>
    </button>
  );
}

export function CurrencyPicker({ value, onChange }: { value: Currency; onChange: (c: Currency) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedMeta = CURRENCY_LIST.find((m) => m.code === value);
  const needle = query.trim().toLowerCase();

  const fiat = useMemo(() => CURRENCY_LIST.filter((m) => m.type === 'fiat' && matches(m, needle)), [needle]);
  const crypto = useMemo(() => CURRENCY_LIST.filter((m) => m.type === 'crypto' && matches(m, needle)), [needle]);

  function pick(c: Currency) {
    onChange(c);
    setOpen(false);
    setQuery('');
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ ...input(), display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: S[2], minWidth: 0 }}>
          <span style={{ ...t('body'), color: T.textStrong, fontWeight: 700 }}>{selectedMeta?.code ?? value}</span>
          <span style={{ ...t('meta'), color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedMeta?.name ?? ''}</span>
        </span>
        <span style={{ color: T.textMuted, display: 'flex', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s var(--ease)' }}>
          {ChevronDown}
        </span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
          <div
            style={{
              ...surface({ radius: 'var(--r-lg)', pad: S[2] }),
              position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 91,
              boxShadow: 'var(--glass-shadow)', maxHeight: 360, display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: S[2], ...input(), padding: '10px 12px', marginBottom: S[2] }}>
              <span style={{ color: T.textMuted, display: 'flex', flexShrink: 0 }}>{SearchIcon}</span>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search currency or code"
                style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: T.text, ...t('body') }}
              />
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {fiat.length > 0 && (
                <>
                  <div style={{ ...sectionLabel(), padding: `${S[2]}px ${S[3]}px ${S[1]}px` }}>Fiat</div>
                  {fiat.map((m) => (
                    <Row key={m.code} meta={m} selected={m.code === value} onSelect={() => pick(m.code)} />
                  ))}
                </>
              )}
              {crypto.length > 0 && (
                <>
                  <div style={{ ...sectionLabel(), padding: `${S[2]}px ${S[3]}px ${S[1]}px` }}>Crypto</div>
                  {crypto.map((m) => (
                    <Row key={m.code} meta={m} selected={m.code === value} onSelect={() => pick(m.code)} />
                  ))}
                </>
              )}
              {fiat.length === 0 && crypto.length === 0 && (
                <div style={{ ...t('meta'), color: T.textMuted, padding: S[4], textAlign: 'center' }}>No currency matches “{query}”.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
