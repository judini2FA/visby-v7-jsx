'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { btn, S, t, sheet } from '@/lib/ui';
import { friendlyError } from '@/lib/friendly-error';

// Photo background remover with a guaranteed manual path. Flow:
//   auto  → run @imgly in-browser (progress + real error surface, never a silent no-op)
//   review→ "Looks good?" — Use it / Edit manually / Use original / Retry with AI
//   manual→ canvas editor (tap-to-erase backdrop by colour, erase + restore brushes, undo)
// Manual mode has ZERO network dependency, so a cutout is always reachable even if @imgly fails.

const MAX_DIM = 1400; // cap the working canvas so flood-fill + brush stay responsive on phones

// The two secondary review actions: clean white cards with a drop shadow, sitting side by side. Blur is
// dropped (the modal sheet is already glass — no glass-inside-glass) so they read as near-solid cards.
const CARD_BTN: React.CSSProperties = {
  ...btn('secondary'), flex: 1, backdropFilter: 'none', WebkitBackdropFilter: 'none',
  boxShadow: '0 8px 20px rgba(15,15,30,.16), 0 2px 6px rgba(15,15,30,.10)',
};

type Phase = 'auto' | 'review' | 'manual';
type Tool = 'magic' | 'erase' | 'restore';

export function CutoutEditor({
  file,
  getAccessToken,
  onDone,
  onCancel,
}: {
  file: File;
  getAccessToken?: () => Promise<string | null>;
  onDone: (file: File, isCutout: boolean) => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('auto');
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(true);

  // original image pixels (RGB source of truth) + the auto/cut alpha, both at working resolution
  const origData = useRef<ImageData | null>(null);  // opaque original, RGBA
  const work = useRef<ImageData | null>(null);       // current result: RGB=original, A=mask
  const dims = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);

  const toFile = useCallback((blob: Blob): File =>
    new File([blob], file.name.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' }), [file.name]);

  // Decode the original once into an offscreen canvas capped to MAX_DIM; caches origData + dims.
  const loadOriginal = useCallback(async (): Promise<ImageData> => {
    if (origData.current) return origData.current;
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('decode_failed'));
        im.src = url;
      });
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      dims.current = { w, h };
      origData.current = ctx.getImageData(0, 0, w, h);
      return origData.current;
    } finally {
      URL.revokeObjectURL(url);
    }
  }, [file]);

  // Read the alpha channel of a PNG blob resampled to the working dims — lets the manual editor
  // start from the auto result (edit its mask) rather than a blank slate.
  const applyCutAlpha = useCallback(async (blob: Blob) => {
    const orig = origData.current;
    if (!orig) return;
    const { w, h } = dims.current;
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image();
        im.onload = () => res(im); im.onerror = () => rej(new Error('cut_decode'));
        im.src = url;
      });
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      const cut = ctx.getImageData(0, 0, w, h);
      const wk = new ImageData(new Uint8ClampedArray(orig.data), w, h);
      for (let i = 3; i < wk.data.length; i += 4) wk.data[i] = cut.data[i];
      work.current = wk;
    } finally {
      URL.revokeObjectURL(url);
    }
  }, []);

  const renderReview = useCallback(() => {
    const wk = work.current;
    if (!wk) return;
    const c = document.createElement('canvas');
    c.width = wk.width; c.height = wk.height;
    c.getContext('2d')!.putImageData(wk, 0, 0);
    c.toBlob((b) => { if (b) setReviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(b); }); }, 'image/png');
  }, []);

  const runAuto = useCallback(async () => {
    setPhase('auto'); setBusy(true); setProgress(0); setNote('');
    try {
      await loadOriginal();
      const { removeBackground } = await import('@imgly/background-removal');
      const blob = await removeBackground(file, {
        // @imgly 1.7.0 defaults publicPath to a "…/${PACKAGE_VERSION}/dist/" template and runs
        // `.replace()` on it; under Next 14's bundler that default resolves to a non-string, so it
        // throws "url.replace is not a function". Passing an explicit absolute string bypasses the
        // mangled default entirely. Host is already in the CSP connect-src allowlist; keep the literal
        // version in sync with package.json (^1.7.0 → 1.7.0). isnet_fp16 = smaller/faster than full isnet.
        publicPath: 'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/',
        model: 'isnet_quint8', // 42MB vs 84MB (fp16) / 168MB (isnet) — quantized, ample for product cutouts
        output: { format: 'image/png' },
        progress: (_k, cur, total) => { if (total) setProgress(Math.round((cur / total) * 100)); },
      });
      await applyCutAlpha(blob);
      renderReview();
      setBusy(false);
      setPhase('review');
    } catch (err) {
      // Auto failed — don't dead-end. Seed the manual editor from the original so a cutout is still
      // reachable, and surface the real reason (model download blocked, unsupported device, etc.).
      try { await loadOriginal(); work.current = new ImageData(new Uint8ClampedArray(origData.current!.data), dims.current.w, dims.current.h); } catch {}
      const msg = friendlyError(err, "Auto cutout couldn't run on this device.");
      setBusy(false);
      setNote(`${msg} Remove the background by hand below.`);
      setPhase('review');
      renderReview();
    }
  }, [file, loadOriginal, applyCutAlpha, renderReview]);

  useEffect(() => { void runAuto(); /* run once for this file */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exportAndDone(isCut: boolean) {
    const wk = work.current;
    if (!wk) { onDone(file, false); return; }
    const c = document.createElement('canvas');
    c.width = wk.width; c.height = wk.height;
    c.getContext('2d')!.putImageData(wk, 0, 0);
    c.toBlob((b) => { onDone(b ? toFile(b) : file, isCut); }, 'image/png');
  }

  function useOriginal() { onDone(file, false); }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
    }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...sheet(), width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', padding: S[4], display: 'flex', flexDirection: 'column', gap: S[3] }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ ...t('heading') }}>{phase === 'manual' ? 'Refine cutout' : 'Cutout'}</span>
          <button onClick={onCancel} aria-label="Close" style={{ ...btn('text'), padding: S[1] }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {phase === 'auto' && (
          <div style={{ position: 'relative', width: '100%', aspectRatio: '1', borderRadius: 'var(--r)', background: 'var(--surface-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: S[2] }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid var(--text-strong)', borderTopColor: 'transparent', animation: 'spin .8s linear infinite' }} />
            <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Removing background{progress ? ` ${progress}%` : '…'}</span>
          </div>
        )}

        {phase === 'review' && <Checkerboard><img src={reviewUrl ?? undefined} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></Checkerboard>}

        {phase === 'manual' && <ManualCanvas workRef={work} origRef={origData} dims={dims} onChange={renderReview} busy={busy} />}

        {note && <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>{note}</span>}

        {phase === 'review' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
              <button onClick={() => exportAndDone(true)} disabled={busy} style={{ ...btn('primary'), width: '100%' }}>Looks good</button>
              <div style={{ display: 'flex', gap: S[2] }}>
                {/* near-solid white cards with a drop shadow (no nested glass blur inside the sheet) */}
                <button onClick={() => { setPhase('manual'); }} disabled={busy} style={CARD_BTN}>Touch up by hand</button>
                <button onClick={useOriginal} disabled={busy} style={CARD_BTN}>Use original</button>
              </div>
            </div>
          </>
        )}

        {phase === 'manual' && (
          <div style={{ display: 'flex', gap: S[2] }}>
            <button onClick={() => { renderReview(); setPhase('review'); }} style={{ ...btn('secondary'), flex: 1 }}>Preview</button>
            <button onClick={() => exportAndDone(true)} style={{ ...btn('primary'), flex: 1 }}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Checkerboard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: 'relative', width: '100%', aspectRatio: '1', borderRadius: 'var(--r)', overflow: 'hidden',
      backgroundColor: 'var(--surface-bg)',
      backgroundImage: 'linear-gradient(45deg,var(--divider) 25%,transparent 25%),linear-gradient(-45deg,var(--divider) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,var(--divider) 75%),linear-gradient(-45deg,transparent 75%,var(--divider) 75%)',
      backgroundSize: '18px 18px', backgroundPosition: '0 0,0 9px,9px -9px,-9px 0',
    }}>{children}</div>
  );
}

// The manual editor. Mutates workRef.current's alpha in place and repaints the display canvas.
function ManualCanvas({
  workRef, origRef, dims, onChange, busy,
}: {
  workRef: React.MutableRefObject<ImageData | null>;
  origRef: React.MutableRefObject<ImageData | null>;
  dims: React.MutableRefObject<{ w: number; h: number }>;
  onChange: () => void;
  busy: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('magic');
  const [brush, setBrush] = useState(40);
  const [tol, setTol] = useState(30);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const undoStack = useRef<Uint8ClampedArray[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  const paint = useCallback(() => {
    const wk = workRef.current, cv = canvasRef.current;
    if (!wk || !cv) return;
    if (cv.width !== wk.width || cv.height !== wk.height) { cv.width = wk.width; cv.height = wk.height; }
    cv.getContext('2d')!.putImageData(wk, 0, 0);
  }, [workRef]);

  useEffect(() => { paint(); }, [paint]);

  function snapshot() {
    const wk = workRef.current; if (!wk) return;
    undoStack.current.push(new Uint8ClampedArray(wk.data));
    if (undoStack.current.length > 12) undoStack.current.shift();
    setCanUndo(true);
  }
  function undo() {
    const prev = undoStack.current.pop();
    const wk = workRef.current;
    if (prev && wk) { wk.data.set(prev); paint(); onChange(); }
    setCanUndo(undoStack.current.length > 0);
  }

  function toCanvas(e: React.PointerEvent) {
    const cv = canvasRef.current!;
    const r = cv.getBoundingClientRect();
    return { x: Math.round((e.clientX - r.left) / r.width * cv.width), y: Math.round((e.clientY - r.top) / r.height * cv.height) };
  }

  // circular brush: set alpha to 0 (erase) or copy the original's alpha/opaque (restore)
  function stroke(x: number, y: number) {
    const wk = workRef.current, orig = origRef.current; if (!wk) return;
    const { w, h } = dims.current;
    const rad = Math.max(1, Math.round(brush / 2));
    const r2 = rad * rad;
    for (let dy = -rad; dy <= rad; dy++) {
      const py = y + dy; if (py < 0 || py >= h) continue;
      for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const px = x + dx; if (px < 0 || px >= w) continue;
        const a = (py * w + px) * 4 + 3;
        wk.data[a] = tool === 'erase' ? 0 : (orig ? orig.data[a] : 255);
      }
    }
  }

  function line(a: { x: number; y: number }, b: { x: number; y: number }) {
    const steps = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 3));
    for (let i = 0; i <= steps; i++) stroke(Math.round(a.x + (b.x - a.x) * i / steps), Math.round(a.y + (b.y - a.y) * i / steps));
  }

  // flood-fill erase: from the tapped pixel, clear every contiguous pixel whose ORIGINAL colour is
  // within tolerance of the seed. Compares against original RGB so already-erased holes don't block it.
  function magic(sx: number, sy: number) {
    const wk = workRef.current, orig = origRef.current; if (!wk || !orig) return;
    const { w, h } = dims.current;
    const d = orig.data;
    const idx = (sy * w + sx) * 4;
    const sr = d[idx], sg = d[idx + 1], sb = d[idx + 2];
    const thresh = (tol / 100) * 441.673; // tolerance as a fraction of max RGB distance (sqrt(3*255^2))
    const seen = new Uint8Array(w * h);
    const stack = [sy * w + sx];
    while (stack.length) {
      const p = stack.pop()!;
      if (seen[p]) continue; seen[p] = 1;
      const o = p * 4;
      const dist = Math.hypot(d[o] - sr, d[o + 1] - sg, d[o + 2] - sb);
      if (dist > thresh) continue;
      wk.data[o + 3] = 0;
      const px = p % w, py = (p / w) | 0;
      if (px > 0) stack.push(p - 1);
      if (px < w - 1) stack.push(p + 1);
      if (py > 0) stack.push(p - w);
      if (py < h - 1) stack.push(p + w);
    }
  }

  function down(e: React.PointerEvent) {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    snapshot();
    const pt = toCanvas(e);
    if (tool === 'magic') { magic(pt.x, pt.y); paint(); onChange(); return; }
    drawing.current = true; last.current = pt; stroke(pt.x, pt.y); paint();
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const pt = toCanvas(e);
    if (last.current) line(last.current, pt);
    last.current = pt; paint();
  }
  function up() { if (drawing.current) { drawing.current = false; last.current = null; onChange(); } }

  const tools: { key: Tool; label: string }[] = [
    { key: 'magic', label: 'Tap background' },
    { key: 'erase', label: 'Erase' },
    { key: 'restore', label: 'Restore' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
      {/* Canvas sizes to the image's real aspect ratio (width:100%, height:auto) so its element box
          equals its pixel box — pointer coords map 1:1 with no letterbox offset on non-square photos. */}
      <div style={{
        width: '100%', borderRadius: 'var(--r)', overflow: 'hidden', backgroundColor: 'var(--surface-bg)',
        backgroundImage: 'linear-gradient(45deg,var(--divider) 25%,transparent 25%),linear-gradient(-45deg,var(--divider) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,var(--divider) 75%),linear-gradient(-45deg,transparent 75%,var(--divider) 75%)',
        backgroundSize: '18px 18px', backgroundPosition: '0 0,0 9px,9px -9px,-9px 0',
      }}>
        <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          style={{ display: 'block', width: '100%', height: 'auto', touchAction: 'none', cursor: 'crosshair' }} />
      </div>

      <div style={{ display: 'flex', gap: S[2] }}>
        {tools.map((tl) => (
          <button key={tl.key} onClick={() => setTool(tl.key)} disabled={busy}
            style={{ ...(tool === tl.key ? btn('primary') : btn('secondary')), flex: 1, fontSize: 12, padding: '8px 6px' }}>{tl.label}</button>
        ))}
      </div>

      {tool === 'magic' ? (
        <label style={{ ...t('meta'), color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: S[1] }}>
          Match strength
          <input type="range" min={5} max={80} value={tol} onChange={(e) => setTol(+e.target.value)} />
        </label>
      ) : (
        <label style={{ ...t('meta'), color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: S[1] }}>
          Brush size
          <input type="range" min={8} max={140} value={brush} onChange={(e) => setBrush(+e.target.value)} />
        </label>
      )}

      <button onClick={undo} disabled={!canUndo} style={{ ...btn('text'), fontSize: 13, opacity: canUndo ? 1 : 0.4 }}>Undo</button>
    </div>
  );
}
