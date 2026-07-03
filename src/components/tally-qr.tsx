'use client';

import { useEffect, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { S, t, surface, btn } from '@/lib/ui';

interface TallyQrProps {
  itemId: string;
  size?: number;
}

// Public item URL is the QR target — stable, no auth, safe to print and affix to the physical item.
export function TallyQr({ itemId, size = 200 }: TallyQrProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [origin, setOrigin] = useState('');

  // window.location is only available after mount — avoids an SSR/CSR value mismatch.
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const url = origin ? `${origin}/item/${itemId}` : '';

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `visby-tally-${itemId}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div style={{ ...surface({ pad: S[5], radius: 'var(--r-lg)' }), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[4] }}>
      <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>Item QR code</div>
      <div style={{ ...t('meta'), color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
        Scan to open this item&apos;s Tally. Print it and affix it to the physical item.
      </div>
      <div style={{ background: '#fff', padding: S[3], borderRadius: 'var(--r-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {url ? (
          <QRCodeCanvas ref={canvasRef} value={url} size={size} level="M" marginSize={0} />
        ) : (
          <div style={{ width: size, height: size }} />
        )}
      </div>
      <button onClick={handleDownload} disabled={!url} style={{ ...btn('secondary', { full: true, pill: false }), opacity: url ? 1 : 0.5, cursor: url ? 'pointer' : 'not-allowed' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download PNG
      </button>
    </div>
  );
}
