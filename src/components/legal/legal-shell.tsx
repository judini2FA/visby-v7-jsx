'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { S, t, surface, btn } from '@/lib/ui';
import { HeaderMenu } from '@/components/layout/header-menu';

// Public legal page. Serves the admin-uploaded PDF (embedded + downloadable); until one is uploaded it
// shows a "being finalized" state. The doc URL comes from the public /api/legal route.
export function LegalShell({ kind, title }: { kind: 'terms' | 'privacy' | 'acceptable_use' | 'seller_agreement'; title: string }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/legal?kind=${kind}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setUrl(d.url ?? null); })
      .catch(() => { if (!cancelled) setUrl(null); });
    return () => { cancelled = true; };
  }, [kind]);

  return (
    <div style={{ minHeight: '100vh' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)' }}>
        <div className="visby-inner" style={{ paddingTop: S[3], paddingBottom: S[3], display: 'flex', alignItems: 'center', gap: S[3] }}>
          <div style={{ ...t('title'), color: 'var(--text-strong)' }}>{title}</div>
          <div style={{ marginLeft: 'auto' }}><HeaderMenu /></div>
        </div>
      </div>

      <div className="visby-inner" style={{ paddingTop: S[5], paddingBottom: 120 }}>
        {url === undefined ? (
          <div style={{ ...surface({ pad: '40px 20px' }), textAlign: 'center', ...t('meta'), color: 'var(--text-muted)' }}>Loading…</div>
        ) : url ? (
          <div>
            <object data={url} type="application/pdf" style={{ width: '100%', height: '78vh', border: 0, borderRadius: 'var(--r)', background: 'var(--surface-bg)' }}>
              <div style={{ ...surface({ pad: '32px 20px' }), textAlign: 'center' }}>
                <div style={{ ...t('body'), color: 'var(--text)', marginBottom: S[4] }}>Your browser can’t display the PDF inline.</div>
                <a href={url} target="_blank" rel="noopener noreferrer" style={btn('primary', { pill: false })}>Open {title} (PDF)</a>
              </div>
            </object>
            <div style={{ marginTop: S[4], textAlign: 'center' }}>
              <a href={url} target="_blank" rel="noopener noreferrer" style={{ ...t('meta'), color: 'var(--text-muted)', textDecoration: 'underline' }}>Download {title} (PDF)</a>
            </div>
          </div>
        ) : (
          <div style={{ ...surface({ pad: '48px 24px' }), textAlign: 'center', maxWidth: 460, margin: '0 auto' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: S[4] }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[2] }}>{title}</div>
            <div style={{ ...t('body'), color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Our {title.toLowerCase()} is being finalized before launch. Check back soon — or reach out with any questions in the meantime.
            </div>
            <Link href="/" style={{ ...btn('secondary', { pill: false }), marginTop: S[5], display: 'inline-flex' }}>Back to Visby</Link>
          </div>
        )}
      </div>
    </div>
  );
}
