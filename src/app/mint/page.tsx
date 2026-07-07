'use client';

import { useState, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useVisbWallet } from '@/lib/wallet';
import { HeaderMenu } from '@/components/layout/header-menu';
import { t, S, card, surface, btn, sectionLabel, input, T } from '@/lib/ui';
import { explorerTx } from '@/lib/explorer';
import { feeBreakdown } from '@/lib/fees';
import { CutoutEditor } from '@/components/cutout-editor';

const C = {
  green: 'var(--ok)', red: 'var(--danger)',
};

const CATS = ['Sneakers', 'Watches', 'Bags', 'Memorabilia', 'Vintage', 'Electronics', 'Other'];
const CONDS = [
  { key: 'New',        desc: 'Brand new, never used' },
  { key: 'Like New',   desc: 'Used once or twice, no flaws' },
  { key: 'Excellent',  desc: 'Lightly used, minor signs of wear' },
  { key: 'Good',       desc: 'Used, visible wear' },
  { key: 'Fair',       desc: 'Heavy wear, flaws noted in description' },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: S[5] }}>
      <div style={{ ...sectionLabel(), marginBottom: S[2] }}>{label}</div>
      {children}
    </div>
  );
}

export default function MintPage() {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const { address: walletAddress } = useVisbWallet();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [images, setImages]         = useState<{ id: string; original: File; originalUrl: string; cutFile?: File; cutUrl?: string; useCut: boolean; busy: boolean }[]>([]);
  const [name, setName]             = useState('');
  const [serial, setSerial]         = useState('');
  const [category, setCategory]     = useState('');
  const [condition, setCondition]   = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice]           = useState('');
  const [listNow, setListNow]       = useState(true);
  const [status, setStatus]         = useState<'idle' | 'uploading' | 'minting' | 'done' | 'error'>('idle');
  const [result, setResult]         = useState<{ txHash: string; mintAddress: string; itemId: string } | null>(null);
  const [error, setError]           = useState('');
  const [editId, setEditId]         = useState<string | null>(null);

  function pickImages(files: FileList | null) {
    if (!files) return;
    const adds = Array.from(files).slice(0, 4 - images.length).map(file => ({
      id: crypto.randomUUID(),
      original: file,
      originalUrl: URL.createObjectURL(file),
      useCut: false,
      busy: false,
    }));
    setImages(prev => [...prev, ...adds].slice(0, 4));
    if (adds[0]) setEditId(adds[0].id); // open auto → "looks good?" → manual for the first added photo
  }

  function applyCutout(id: string, file: File, isCut: boolean) {
    setImages(prev => prev.map(im => {
      if (im.id !== id) return im;
      if (im.cutUrl) URL.revokeObjectURL(im.cutUrl);
      return isCut
        ? { ...im, cutFile: file, cutUrl: URL.createObjectURL(file), useCut: true, busy: false }
        : { ...im, cutFile: undefined, cutUrl: undefined, useCut: false, busy: false };
    }));
    setEditId(null);
  }

  async function uploadImage(file: File, cutout: boolean): Promise<string> {
    const fd = new FormData();
    fd.append('file', file);
    if (cutout) fd.append('cutout', '1');
    const token = await getAccessToken();
    const res = await fetch('/api/upload-image', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error ?? 'Photo upload failed');
    }
    const { url } = await res.json();
    return url;
  }

  async function handleMint(e: React.FormEvent) {
    e.preventDefault();
    if (!walletAddress) { setError('Connect your wallet first'); return; }
    if (!name || !serial || !category || !condition) { setError('Fill in all required fields'); return; }
    if (listNow && !price) { setError('Enter a price to list'); return; }

    setError('');
    setStatus('uploading');

    let imageUrl: string | null = null;
    if (images.length > 0) {
      try {
        const cover = images[0];
        const coverFile = cover.useCut && cover.cutFile ? cover.cutFile : cover.original;
        imageUrl = await uploadImage(coverFile, cover.useCut && !!cover.cutFile);
      } catch (err: any) {
        setError(err.message);
        setStatus('idle');
        return;
      }
    }

    setStatus('minting');

    try {
      const token = await getAccessToken();
      const res = await fetch('/api/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          name,
          serial_number: serial,
          condition,
          category,
          description,
          owner_wallet: walletAddress,
          image_url: imageUrl,
          price_usdc: listNow && price ? parseFloat(price) : null,
          is_listed: listNow && !!price,
        }),
      });
      const data = await res.json();
      if (res.status === 402 && data.action === 'fund_wallet') {
        throw new Error(`Mint wallet needs devnet SOL. Visit faucet.solana.com and paste: ${data.mint_authority_address}`);
      }
      if (!res.ok) throw new Error(data.error ?? 'Mint failed');
      setResult({ txHash: data.tx_hash, mintAddress: data.mint_address, itemId: data.item_id });
      setStatus('done');
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
      setStatus('error');
    }
  }

  if (!ready || !authenticated) {
    return (
      <div style={{ background: 'transparent', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: S[4] }}>
        <div style={{ ...t('body'), color: 'var(--text-muted)' }}>Sign in to list an item</div>
        <Link href="/login" style={{ ...btn('primary'), textDecoration: 'none' }}>Sign In</Link>
      </div>
    );
  }

  if (status === 'done' && result) {
    return (
      <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: S[5] }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: `${C.green}22`, border: `2px solid ${C.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: S[4] }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div style={{ ...t('title'), color: 'var(--text-strong)', marginBottom: S[1] }}>Item Minted!</div>
        <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[6], textAlign: 'center' }}>Your item is live on Visby</div>

        <div style={{ ...card(), width: '100%', maxWidth: 400, padding: S[5], marginBottom: S[5] }}>
          <div style={{ ...sectionLabel(), marginBottom: S[1] }}>Mint Address</div>
          <div style={{ ...t('meta'), color: 'var(--text-strong)', wordBreak: 'break-all', marginBottom: S[3] }}>{result.mintAddress}</div>
          <a href={explorerTx(result.txHash)} target="_blank" rel="noopener noreferrer"
            style={{ ...t('meta'), display: 'flex', alignItems: 'center', gap: S[1], color: 'var(--text-strong)', textDecoration: 'none' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            View on Explorer
          </a>
        </div>

        <div style={{ display: 'flex', gap: S[3], width: '100%', maxWidth: 400 }}>
          <Link href={`/item/${result.itemId}`} style={{ ...btn('primary', { full: true }), textDecoration: 'none', textAlign: 'center' }}>
            View Listing
          </Link>
          <button onClick={() => { setStatus('idle'); setResult(null); setImages([]); setName(''); setSerial(''); setCategory(''); setCondition(''); setDescription(''); setPrice(''); }}
            style={btn('secondary', { full: true })}>
            List Another
          </button>
        </div>
      </div>
    );
  }

  const busy = status === 'uploading' || status === 'minting';
  const canSubmit = name && serial && category && condition && (!listNow || price);

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)', padding: `${S[3]}px ${S[4]}px`, display: 'flex', alignItems: 'center', gap: S[3] }}>
        <Link href="/" style={{ display: 'flex', textDecoration: 'none' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </Link>
        <div style={{ ...t('title'), color: 'var(--text-strong)' }}>List an Item</div>
        <div style={{ marginLeft: 'auto' }}><HeaderMenu /></div>
      </div>

      <form onSubmit={handleMint} style={{ maxWidth: 600, margin: '0 auto', padding: `${S[5]}px ${S[4]}px 120px` }}>

        {/* Photo upload */}
        <div style={{ marginBottom: S[5] }}>
          <div style={{ ...sectionLabel(), marginBottom: S[2] }}>Photos (up to 4)</div>
          <div style={{ display: 'flex', gap: S[2] }}>
            {/* Add photo button */}
            <button type="button" onClick={() => fileRef.current?.click()}
              style={{ ...surface({ radius: 'var(--r)' }), width: images.length === 0 ? '100%' : 80, height: images.length === 0 ? 180 : 80, border: `2px dashed var(--glass-border)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: S[2], cursor: 'pointer', flexShrink: 0 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              {images.length === 0 && <div style={{ ...t('body'), color: 'var(--text-muted)' }}>Add Photos</div>}
            </button>
            {/* Previews */}
            {images.map((img, i) => {
              const url = img.useCut && img.cutUrl ? img.cutUrl : img.originalUrl;
              return (
              <div key={img.id} style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
                <img src={url} alt="" title="Tap to remove background" onClick={() => setEditId(img.id)} style={{ width: '100%', height: '100%', objectFit: img.useCut ? 'contain' : 'cover', borderRadius: 12, border: i === 0 ? `2px solid var(--glass-border)` : '2px solid transparent', cursor: 'pointer' }} />
                {i === 0 && <div style={{ ...t('micro'), position: 'absolute', bottom: S[1], left: S[1], background: 'var(--glass-bg-strong)', borderRadius: 4, color: 'var(--text)', padding: '1px 5px' }}>Cover</div>}
                {img.busy && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--img-scrim)', borderRadius: 12 }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #fff', borderTopColor: 'transparent', animation: 'spin .8s linear infinite' }} />
                  </div>
                )}
                {img.cutFile && !img.busy && (
                  <button type="button" title={img.useCut ? 'Show original' : 'Remove background'}
                    onClick={() => setImages(prev => prev.map(m => m.id === img.id ? { ...m, useCut: !m.useCut } : m))}
                    style={{ position: 'absolute', bottom: -6, right: -6, width: 22, height: 22, background: img.useCut ? 'var(--grad-brand)' : 'var(--glass-bg-strong)', border: 'none', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.2)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={img.useCut ? '#fff' : 'var(--text)'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 3l2 2M19 3l-2 2M3 12h2M19 12h2M12 7a5 5 0 0 0-5 5c0 2 1 3 2 4h6c1-1 2-2 2-4a5 5 0 0 0-5-5z"/>
                    </svg>
                  </button>
                )}
                <button type="button" onClick={() => setImages(prev => prev.filter(m => m.id !== img.id))}
                  style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, background: C.red, border: 'none', borderRadius: '50%', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>×</button>
              </div>
              );
            })}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => pickImages(e.target.files)} />
        </div>

        {/* Title */}
        <Field label="Item Title *">
          <input style={input()} value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Nike Air Max 1 '86 OG Green" />
        </Field>

        {/* Category */}
        <Field label="Category *">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[2] }}>
            {CATS.map(c => (
              <button key={c} type="button" onClick={() => setCategory(c)}
                style={category === c ? btn('primary') : btn('secondary')}>
                {c}
              </button>
            ))}
          </div>
        </Field>

        {/* Condition */}
        <Field label="Condition *">
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {CONDS.map(c => (
              <button key={c.key} type="button" onClick={() => setCondition(c.key)}
                style={{ ...surface({ radius: 'var(--r-sm)' }), display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer', textAlign: 'left', borderColor: condition === c.key ? T.textStrong : undefined }}>
                <div>
                  <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>{c.key}</div>
                  <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: S[1] }}>{c.desc}</div>
                </div>
                {condition === c.key && (
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--grad-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </Field>

        {/* Serial number */}
        <Field label="Serial Number *">
          <input style={input()} value={serial} onChange={e => setSerial(e.target.value)} required placeholder="e.g. NK-2024-XR9471" />
          <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: S[2] }}>Found on the tag, box, or back of the item.</div>
        </Field>

        {/* Description */}
        <Field label="Description">
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Describe the item — size, colorway, any flaws, original packaging, etc."
            style={{ ...input(), resize: 'none', lineHeight: 1.6 }} />
        </Field>

        {/* Price / list toggle */}
        <div style={{ ...card(), padding: S[4], marginBottom: S[5] }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: listNow ? S[3] : 0 }}>
            <div>
              <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>List for Sale Now</div>
              <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: S[1] }}>Buyers can purchase immediately</div>
            </div>
            {/* Toggle */}
            <div onClick={() => setListNow(l => !l)} style={{ width: 48, height: 26, borderRadius: 13, background: listNow ? T.gradBrand : 'var(--glass-hairline)', cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 3, left: listNow ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
            </div>
          </div>
          {listNow && (
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: S[4], top: '50%', transform: 'translateY(-50%)', ...t('title'), color: 'var(--text-muted)', zIndex: 1 }}>$</div>
              <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" min="0.01" step="0.01"
                style={{ ...input(), ...t('title'), paddingLeft: S[7] }} />
              <div style={{ position: 'absolute', right: S[4], top: '50%', transform: 'translateY(-50%)', ...t('meta'), color: 'var(--text-muted)' }}>USDC</div>
            </div>
          )}
          {/* 7.11 fee transparency — show the seller their net after the 9% fee before they list */}
          {listNow && parseFloat(price) > 0 && (() => {
            const bd = feeBreakdown(parseFloat(price));
            return (
              <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: S[2], lineHeight: 1.6 }}>
                Visby fee (9%) −${bd.platform_fee_usd.toFixed(2)} · shipping is deducted at sale
                <br />
                <span style={{ color: 'var(--text-strong)', fontWeight: 700 }}>You net ~${bd.seller_net_usd.toFixed(2)}</span> before shipping
              </div>
            );
          })()}
        </div>

        {/* Error */}
        {(error || status === 'error') && (
          <div style={{ ...surface({ radius: 'var(--r-sm)' }), background: `${C.red}15`, borderColor: `${C.red}44`, padding: '12px 16px', marginBottom: S[5], ...t('body'), color: C.red }}>
            {error || 'Something went wrong. Try again.'}
          </div>
        )}

        {/* Wallet preview */}
        <div style={{ ...surface({ radius: 'var(--r-sm)' }), display: 'flex', alignItems: 'center', gap: S[2], marginBottom: S[5], padding: '12px 16px' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text-muted)' }} />
          <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
            Minting to: <span style={{ color: 'var(--text-strong)' }}>{walletAddress ? `${walletAddress.slice(0,6)}…${walletAddress.slice(-6)}` : 'No wallet'}</span>
          </div>
        </div>

        {/* Submit */}
        <button type="submit" disabled={busy || !canSubmit}
          style={{ ...btn('primary', { full: true }), opacity: busy || !canSubmit ? 0.5 : 1, cursor: busy || !canSubmit ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: S[2] }}>
          {busy ? (
            <>
              <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', animation: 'spin .8s linear infinite' }} />
              {status === 'uploading' ? 'Uploading photos…' : 'Minting…'}
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              {listNow ? `Mint & List for $${price || '—'} USDC` : 'Mint NFT'}
            </>
          )}
        </button>
      </form>

      {editId && (() => {
        const target = images.find(m => m.id === editId);
        if (!target) return null;
        return (
          <CutoutEditor
            file={target.original}
            getAccessToken={getAccessToken}
            onDone={(f, isCut) => applyCutout(editId, f, isCut)}
            onCancel={() => setEditId(null)}
          />
        );
      })()}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
