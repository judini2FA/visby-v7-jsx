'use client';

import { useState } from 'react';
import { btn, S, t, T, surface } from '@/lib/ui';

// Runs background removal in the browser on file select (no upload until accepted), shows the original
// vs the transparent cutout, and hands the chosen File back to the parent. @imgly is dynamically
// imported so its WASM + model only load when a photo is actually picked.
export function PhotoCutoutPicker({
  onPick,
  getAccessToken,
  label = 'Add photo',
}: {
  onPick: (file: File, isCutout: boolean) => void;
  getAccessToken?: () => Promise<string | null>;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [origFile, setOrigFile] = useState<File | null>(null);
  const [origUrl, setOrigUrl] = useState<string | null>(null);
  const [cutFile, setCutFile] = useState<File | null>(null);
  const [cutUrl, setCutUrl] = useState<string | null>(null);
  const [view, setView] = useState<'cutout' | 'original'>('cutout');
  const [note, setNote] = useState('');

  function toFile(blob: Blob, name: string): File {
    return new File([blob], name.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' });
  }

  async function runCutout(file: File) {
    setBusy(true); setProgress(0); setNote('');
    try {
      const { removeBackground } = await import('@imgly/background-removal');
      const blob = await removeBackground(file, {
        output: { format: 'image/png' },
        progress: (_key, cur, total) => { if (total) setProgress(Math.round((cur / total) * 100)); },
      });
      const cf = toFile(blob, file.name);
      setCutFile(cf); setCutUrl(URL.createObjectURL(blob)); setView('cutout');
    } catch {
      setNote('Background removal failed — you can keep the original or retry with AI.');
      setView('original');
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setOrigFile(file); setOrigUrl(URL.createObjectURL(file));
    setCutFile(null); setCutUrl(null);
    await runCutout(file);
  }

  // Server fallback for hard images (fal.ai BiRefNet). No-ops cleanly if FAL_KEY isn't configured.
  async function retryWithAI() {
    if (!origFile || busy) return;
    setBusy(true); setNote('');
    try {
      const fd = new FormData();
      fd.append('file', origFile);
      const token = getAccessToken ? await getAccessToken() : null;
      const res = await fetch('/api/remove-bg', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
      if (!res.ok) { setNote('AI background removal is unavailable right now.'); return; }
      const blob = await res.blob();
      const cf = toFile(blob, origFile.name);
      setCutFile(cf); setCutUrl(URL.createObjectURL(blob)); setView('cutout');
    } catch {
      setNote('AI background removal is unavailable right now.');
    } finally {
      setBusy(false);
    }
  }

  function accept() {
    if (view === 'cutout' && cutFile) onPick(cutFile, true);
    else if (origFile) onPick(origFile, false);
  }

  const shownUrl = view === 'cutout' ? (cutUrl ?? origUrl) : origUrl;

  if (!origUrl) {
    return (
      <label style={{ ...btn('secondary'), cursor: 'pointer', justifyContent: 'center' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
        </svg>
        {label}
        <input type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
      </label>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
      {/* checkerboard so transparency is visible */}
      <div style={{
        position: 'relative', width: '100%', aspectRatio: '1', borderRadius: 'var(--r)', overflow: 'hidden',
        backgroundColor: 'var(--surface-bg)',
        backgroundImage: 'linear-gradient(45deg,var(--divider) 25%,transparent 25%),linear-gradient(-45deg,var(--divider) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,var(--divider) 75%),linear-gradient(-45deg,transparent 75%,var(--divider) 75%)',
        backgroundSize: '18px 18px', backgroundPosition: '0 0,0 9px,9px -9px,-9px 0',
      }}>
        {shownUrl && <img src={shownUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
        {busy && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: S[2], background: 'var(--img-scrim)' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #fff', borderTopColor: 'transparent', animation: 'spin .8s linear infinite' }} />
            <span style={{ ...t('meta'), color: '#fff' }}>Removing background{progress ? ` ${progress}%` : '…'}</span>
          </div>
        )}
      </div>

      {note && <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>{note}</span>}

      {/* original / cutout toggle */}
      {cutUrl && (
        <div style={{ display: 'flex', gap: S[2] }}>
          {(['cutout', 'original'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} disabled={busy}
              style={{ ...(view === v ? btn('primary') : btn('secondary')), flex: 1, fontSize: 13, padding: '8px 12px', textTransform: 'capitalize' }}>
              {v}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[2] }}>
        <button onClick={accept} disabled={busy} style={{ ...btn('primary'), flex: 1, minWidth: 120 }}>
          Use this photo
        </button>
        <button onClick={retryWithAI} disabled={busy} style={{ ...btn('secondary'), fontSize: 13 }}>Retry with AI</button>
        <label style={{ ...btn('text'), fontSize: 13, cursor: 'pointer' }}>
          Replace
          <input type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
        </label>
      </div>
    </div>
  );
}
