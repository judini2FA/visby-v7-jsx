import { S, t } from '@/lib/ui';

// "Tally" is the user-facing term for the provenance NFT — see design.md §11.2.

// Full card header — heading + NFT chip + one-liner. Sits at the top of the Tally card
// (src/app/item/[id]/page.tsx) above the mint address / TallyTracker history.
export function TallyExplainerCard() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginBottom: S[1] }}>
        <span style={{ ...t('title'), color: '#15121C', fontWeight: 800 }}>Tally</span>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.08em', color: 'rgba(21,18,28,.6)', border: '1px solid rgba(21,18,28,.22)', borderRadius: 999, padding: '2px 7px' }}>NFT</span>
      </div>
      <div style={{ ...t('meta'), color: 'rgba(21,18,28,.68)', marginBottom: S[5], lineHeight: 1.5 }}>
        An NFT-powered provenance used to track the history of a product.
      </div>
    </>
  );
}

// Compact one-line "What is a Tally?" affordance for tighter spots (e.g. order confirmation).
// Plain-English, no crypto jargon per design.md — click reveals a short explainer sentence.
export function TallyExplainerInline() {
  return (
    <details style={{ ...t('meta'), color: 'var(--text-muted)' }}>
      <summary style={{ display: 'inline-flex', alignItems: 'center', gap: S[1], cursor: 'pointer', listStyle: 'none', color: 'var(--text)', fontWeight: 700 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        What is a Tally?
      </summary>
      <div style={{ marginTop: S[2], lineHeight: 1.5 }}>
        Your Tally is this item&apos;s verified history — every past owner, tracked and provable, so you always know it&apos;s the real thing.
      </div>
    </details>
  );
}
