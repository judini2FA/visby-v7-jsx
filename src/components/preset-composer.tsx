'use client';

import { useState } from 'react';
import { btn, S, t, T, surface } from '@/lib/ui';

// Structured quick-reply payload. `content` (built by presetToText) is always sent alongside it as the
// human-readable fallback, so previews and older clients render even without preset support.
export type MessagePreset =
  | { kind: 'reply'; value: 'yes' | 'no' }
  | { kind: 'offer'; amount: number }
  | { kind: 'ask_condition' }
  | { kind: 'condition'; value: string };

export const CONDITIONS = ['mint', 'near-mint', 'like-new', 'used', 'fair', 'worn'] as const;

export function presetToText(p: MessagePreset): string {
  switch (p.kind) {
    case 'reply':         return p.value === 'yes' ? 'Yes' : 'No';
    case 'offer':         return `Would you do $${p.amount}?`;
    case 'ask_condition': return 'What is the condition?';
    case 'condition':     return `Condition: ${p.value}`;
  }
}

// Renders the inner content of a message bubble — structured when a preset is present, plain text
// otherwise (old messages / fallback). The parent supplies the bubble container + timestamp.
export function StructuredBubble({ content, preset, mine }: { content: string; preset?: MessagePreset | null; mine: boolean }) {
  const color = mine ? '#fff' : 'var(--text-strong)';
  const sub = mine ? 'rgba(255,255,255,.85)' : 'var(--text-muted)';

  if (preset?.kind === 'offer') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
        <span style={{ ...t('heading'), fontWeight: 700, color }}>${preset.amount}</span>
        <span style={{ ...t('body'), color }}>— would you do this?</span>
      </div>
    );
  }
  if (preset?.kind === 'condition') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
        <span style={{ ...t('meta'), color: sub }}>Condition</span>
        <span style={{ ...t('body'), fontWeight: 600, textTransform: 'capitalize', color }}>{preset.value}</span>
      </div>
    );
  }
  return <div style={{ ...t('body'), color }}>{content}</div>;
}

export function PresetComposer({ onSend, sending, maxOffer }: {
  onSend: (content: string, preset: MessagePreset) => void;
  sending?: boolean;
  maxOffer?: number | null;
}) {
  const [mode, setMode] = useState<'menu' | 'offer' | 'condition'>('menu');
  const ceil = Math.max(5, Math.round(maxOffer ?? 1000));
  const step = ceil > 200 ? 5 : 1;
  const [amount, setAmount] = useState(() => Math.max(1, Math.round(ceil / 2)));

  function fire(p: MessagePreset) {
    if (sending) return;
    onSend(presetToText(p), p);
    setMode('menu');
  }

  const chip = { ...btn('secondary'), fontSize: 13, padding: '9px 14px' };

  if (mode === 'offer') {
    return (
      <div style={{ ...surface({ radius: 16, pad: S[3] }), display: 'flex', flexDirection: 'column', gap: S[3] }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ ...t('meta'), color: T.textMuted }}>Would you do…</span>
          <span style={{ ...t('title'), color: T.textStrong }}>${amount}</span>
        </div>
        <input
          type="range" min={1} max={ceil} step={step} value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#2A8AED' }}
        />
        <div style={{ display: 'flex', gap: S[2] }}>
          <button onClick={() => setMode('menu')} style={{ ...btn('text'), fontSize: 13 }}>Cancel</button>
          <button onClick={() => fire({ kind: 'offer', amount })} disabled={sending} style={{ ...btn('primary'), flex: 1, fontSize: 14 }}>
            Send offer
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'condition') {
    return (
      <div style={{ ...surface({ radius: 16, pad: S[3] }), display: 'flex', flexDirection: 'column', gap: S[2] }}>
        <span style={{ ...t('meta'), color: T.textMuted }}>Condition</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[2] }}>
          {CONDITIONS.map((c) => (
            <button key={c} onClick={() => fire({ kind: 'condition', value: c })} disabled={sending}
              style={{ ...chip, textTransform: 'capitalize' }}>
              {c}
            </button>
          ))}
        </div>
        <button onClick={() => setMode('menu')} style={{ ...btn('text'), fontSize: 13, alignSelf: 'flex-start' }}>Back</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[2] }}>
      <button onClick={() => fire({ kind: 'reply', value: 'yes' })} disabled={sending} style={{ ...btn('primary'), fontSize: 13, padding: '9px 16px' }}>Yes</button>
      <button onClick={() => fire({ kind: 'reply', value: 'no' })} disabled={sending} style={chip}>No</button>
      <button onClick={() => setMode('offer')} disabled={sending} style={chip}>Make an offer</button>
      <button onClick={() => setMode('condition')} disabled={sending} style={chip}>Condition</button>
      <button onClick={() => fire({ kind: 'ask_condition' })} disabled={sending} style={chip}>Ask condition</button>
    </div>
  );
}
