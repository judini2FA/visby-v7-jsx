'use client';

import { useState, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useVisbWallet } from '@/lib/wallet';

const C = {
  navy: 'transparent', teal: '#5ED9D1', cyan: '#6DE4D5',
  blue: '#59B4F5', mag: '#D54AF2', muted: 'var(--text-muted)',
  green: '#00C48C', red: '#FF3B5C',
};
const GH = `linear-gradient(90deg,${C.cyan},${C.blue} 50%,${C.mag})`;
const GD = `linear-gradient(135deg,${C.cyan},${C.blue} 50%,${C.mag})`;

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
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "'Quicksand',sans-serif", letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', background: 'var(--field-input-bg)',
  border: '1px solid var(--glass-border)', borderRadius: 'var(--r-sm)',
  padding: '13px 16px', color: 'var(--text)', fontSize: 15, outline: 'none',
  fontFamily: "'Quicksand', sans-serif",
};

export default function MintPage() {
  const { ready, authenticated, user } = usePrivy();
  const { address: walletAddress } = useVisbWallet();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [images, setImages]         = useState<{ file: File; preview: string }[]>([]);
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


  function pickImages(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).slice(0, 4 - images.length).map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setImages(prev => [...prev, ...next].slice(0, 4));
  }

  async function uploadImage(file: File): Promise<string> {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload-image', { method: 'POST', body: fd });
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
        imageUrl = await uploadImage(images[0].file);
      } catch (err: any) {
        setError(err.message);
        setStatus('idle');
        return;
      }
    }

    setStatus('minting');

    try {
      const res = await fetch('/api/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      <div style={{ background: 'transparent', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 15, color: 'var(--text-muted)' }}>Sign in to list an item</div>
        <Link href="/login" style={{ background: GH, borderRadius: 14, padding: '12px 28px', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>Sign In</Link>
      </div>
    );
  }

  if (status === 'done' && result) {
    return (
      <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: `${C.green}22`, border: `2px solid ${C.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 6 }}>Item Minted!</div>
        <div style={{ fontSize: 14, color: C.muted, marginBottom: 28, textAlign: 'center' }}>Your item is on Solana devnet and recorded on Visby</div>

        <div style={{ width: '100%', maxWidth: 400, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow), var(--glass-inner)', borderRadius: 20, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: "'Quicksand',sans-serif", marginBottom: 6 }}>NFT MINT ADDRESS</div>
          <div style={{ fontSize: 11, color: 'var(--text-strong)', fontFamily: "'Quicksand',sans-serif", wordBreak: 'break-all', marginBottom: 14 }}>{result.mintAddress}</div>
          <a href={`https://explorer.solana.com/tx/${result.txHash}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-strong)', textDecoration: 'none' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            View on Solana Explorer
          </a>
        </div>

        <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 400 }}>
          <Link href={`/item/${result.itemId}`} style={{ flex: 1, background: GH, borderRadius: 14, padding: '13px', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none', textAlign: 'center' }}>
            View Listing
          </Link>
          <button onClick={() => { setStatus('idle'); setResult(null); setImages([]); setName(''); setSerial(''); setCategory(''); setCondition(''); setDescription(''); setPrice(''); }}
            style={{ flex: 1, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 16, padding: '13px', color: 'var(--text-strong)', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'Quicksand', sans-serif" }}>
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
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link href="/" style={{ display: 'flex', textDecoration: 'none' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </Link>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)' }}>List an Item</div>
        <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', fontFamily: "'Quicksand',sans-serif", background: 'var(--glass-bg)', borderRadius: 6, padding: '3px 8px' }}>DEVNET</div>
      </div>

      <form onSubmit={handleMint} style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px 120px' }}>

        {/* Photo upload */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: "'Quicksand',sans-serif", letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Photos (up to 4)</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {/* Add photo button */}
            <button type="button" onClick={() => fileRef.current?.click()}
              style={{ width: images.length === 0 ? '100%' : 80, height: images.length === 0 ? 180 : 80, background: 'var(--glass-hairline)', border: `2px dashed var(--glass-border)`, borderRadius: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', transition: 'border-color .2s', flexShrink: 0 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              {images.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>Add Photos</div>}
            </button>
            {/* Previews */}
            {images.map((img, i) => (
              <div key={i} style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
                <img src={img.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12, border: i === 0 ? `2px solid var(--glass-border)` : '2px solid transparent' }} />
                {i === 0 && <div style={{ position: 'absolute', bottom: 4, left: 4, background: 'var(--glass-bg-strong)', borderRadius: 4, fontSize: 9, fontWeight: 700, color: 'var(--text)', padding: '1px 5px' }}>COVER</div>}
                <button type="button" onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                  style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, background: C.red, border: 'none', borderRadius: '50%', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>×</button>
              </div>
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => pickImages(e.target.files)} />
        </div>

        {/* Title */}
        <Field label="Item Title *">
          <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Nike Air Max 1 '86 OG Green" style={INPUT_STYLE} />
        </Field>

        {/* Category */}
        <Field label="Category *">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {CATS.map(c => (
              <button key={c} type="button" onClick={() => setCategory(c)}
                style={{ background: category === c ? GH : 'var(--glass-bg)', border: `1px solid ${category === c ? 'transparent' : 'var(--glass-border)'}`, borderRadius: 20, padding: '8px 16px', fontSize: 13, fontWeight: category === c ? 700 : 500, color: category === c ? '#fff' : 'var(--text)', cursor: 'pointer', fontFamily: "'Quicksand', sans-serif" }}>
                {c}
              </button>
            ))}
          </div>
        </Field>

        {/* Condition */}
        <Field label="Condition *">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CONDS.map(c => (
              <button key={c.key} type="button" onClick={() => setCondition(c.key)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: condition === c.key ? 'var(--glass-bg-strong)' : 'var(--glass-bg)', border: `1px solid ${condition === c.key ? 'var(--glass-border)' : 'var(--glass-border)'}`, borderRadius: 14, padding: '11px 14px', cursor: 'pointer', textAlign: 'left' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: condition === c.key ? 'var(--text-strong)' : 'var(--text-strong)' }}>{c.key}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{c.desc}</div>
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
          <input value={serial} onChange={e => setSerial(e.target.value)} required placeholder="e.g. NK-2024-XR9471" style={{ ...INPUT_STYLE, fontFamily: "'Quicksand',sans-serif", fontSize: 14 }} />
          <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Found on the tag, box, or back of the item. This is how Visby tracks provenance.</div>
        </Field>

        {/* Description */}
        <Field label="Description">
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Describe the item — size, colorway, any flaws, original packaging, etc."
            style={{ ...INPUT_STYLE, resize: 'none', lineHeight: 1.6 }} />
        </Field>

        {/* Price / list toggle */}
        <div style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow), var(--glass-inner)', borderRadius: 20, padding: 16, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: listNow ? 14 : 0 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>List for Sale Now</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Set a price and buyers can purchase immediately</div>
            </div>
            {/* Toggle */}
            <div onClick={() => setListNow(l => !l)} style={{ width: 48, height: 26, borderRadius: 13, background: listNow ? GH : 'var(--glass-hairline)', cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 3, left: listNow ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
            </div>
          </div>
          {listNow && (
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, fontWeight: 700, color: 'var(--text-muted)' }}>$</div>
              <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" min="0.01" step="0.01"
                style={{ ...INPUT_STYLE, paddingLeft: 30, fontSize: 20, fontWeight: 700 }} />
              <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: C.muted, fontFamily: "'Quicksand',sans-serif" }}>USDC</div>
            </div>
          )}
        </div>

        {/* Error */}
        {(error || status === 'error') && (
          <div style={{ background: `${C.red}15`, border: `1px solid ${C.red}44`, borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: C.red }}>
            {error || 'Something went wrong. Try again.'}
          </div>
        )}

        {/* Wallet preview */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '10px 14px', background: 'var(--glass-bg)', borderRadius: 14 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text-muted)' }} />
          <div style={{ fontSize: 11, color: C.muted, fontFamily: "'Quicksand',sans-serif" }}>
            Minting to: <span style={{ color: 'var(--text-strong)' }}>{walletAddress ? `${walletAddress.slice(0,6)}…${walletAddress.slice(-6)}` : 'No wallet'}</span>
          </div>
        </div>

        {/* Submit */}
        <button type="submit" disabled={busy || !canSubmit}
          style={{ width: '100%', background: busy || !canSubmit ? 'var(--glass-bg)' : GH, border: 'none', borderRadius: 18, padding: '16px 20px', fontWeight: 700, fontSize: 16, color: busy || !canSubmit ? 'var(--text-muted)' : '#fff', cursor: busy || !canSubmit ? 'not-allowed' : 'pointer', fontFamily: "'Quicksand', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'all .2s' }}>
          {busy ? (
            <>
              <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', animation: 'spin .8s linear infinite' }} />
              {status === 'uploading' ? 'Uploading photos…' : 'Minting on Solana…'}
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              {listNow ? `Mint & List for $${price || '—'} USDC` : 'Mint NFT'}
            </>
          )}
        </button>
        <div style={{ fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 10 }}>Free on Solana devnet · takes ~2 seconds</div>
      </form>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
