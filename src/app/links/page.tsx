import type { Metadata } from 'next';
import { t, S, T, card, surface, sectionLabel } from '@/lib/ui';
import { visibleSections } from '@/lib/links-config';
import { PrelaunchWordmark } from '../prelaunch/wordmark';
import { HubTracker } from './tracker';
import { DocGate } from './doc-gate';

export const metadata: Metadata = {
  title: 'Visby — Links',
  robots: { index: false, follow: false },
};

const chevron = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18l6-6-6-6" />
  </svg>
);

// Plain anchors rendered on the server: every destination works before (and without) any JavaScript.
// The tracker island only observes clicks; it never intercepts navigation.
export default function LinksPage() {
  const sections = visibleSections();
  return (
    <div style={{ background: 'transparent', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: `${S[7]}px ${S[4]}px` }}>
      <main style={{ ...card(), width: '100%', maxWidth: 440, padding: S[6], display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <PrelaunchWordmark />
        <p style={{ ...t('body'), color: T.textMuted, margin: `${S[4]}px 0 ${S[5]}px`, maxWidth: 340 }}>
          The marketplace that verifies every item&apos;s ownership history.
        </p>

        <div id="hub-links" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: S[5] }}>
          {sections.map(section => (
            <section key={section.id} style={{ display: 'flex', flexDirection: 'column', gap: S[2], textAlign: 'left' }}>
              {section.title && <h2 style={{ ...sectionLabel(), margin: `0 0 ${S[1]}px` }}>{section.title}</h2>}
              {section.links.some(l => l.gated) && (
                <DocGate docs={section.links.filter(l => l.gated).map(({ id, label, description }) => ({ id, label, description }))} />
              )}
              {section.links.filter(l => !l.gated).map(link => {
                const body = (
                  <>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                      <span style={{ ...t('heading'), color: link.href ? T.textStrong : T.textMuted }}>{link.label}</span>
                      {link.description && <span style={{ ...t('meta'), color: T.textMuted }}>{link.description}</span>}
                    </span>
                    {link.href ? <span style={{ color: T.textMuted, display: 'flex' }}>{chevron}</span> : <span style={{ ...t('meta'), color: T.textMuted }}>Coming soon</span>}
                  </>
                );
                const row = { ...surface({ pad: `${S[3]}px ${S[4]}px` }), display: 'flex', alignItems: 'center', gap: S[3], textDecoration: 'none', minHeight: 56 };
                if (!link.href) return <div key={link.id} aria-disabled="true" style={row}>{body}</div>;
                const external = /^https?:\/\//.test(link.href);
                return (
                  <a key={link.id} href={link.href} data-link-id={link.id} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} style={row}>
                    {body}
                  </a>
                );
              })}
            </section>
          ))}
        </div>
      </main>
      <HubTracker />
    </div>
  );
}
