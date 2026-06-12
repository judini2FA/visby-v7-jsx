'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { trpc } from '@/lib/trpc/client';
import { useVisbWallet } from '@/lib/wallet';

const C = {
  navy: 'transparent', teal: '#5ED9D1', cyan: '#6DE4D5',
  blue: '#59B4F5', mag: '#D54AF2', muted: 'var(--text-muted)',
  green: '#00C48C', red: '#FF3B5C', border: 'var(--glass-border)',
};
const GH = `linear-gradient(90deg,${C.cyan},${C.blue} 50%,${C.mag})`;

const CATS  = ['Sneakers','Watches','Bags','Memorabilia','Vintage','Electronics','Other'];
const CONDS = [
  { key: 'New',       desc: 'Brand new, never used' },
  { key: 'Like New',  desc: 'Used once or twice, no flaws' },
  { key: 'Excellent', desc: 'Lightly used, minor signs of wear' },
  { key: 'Good',      desc: 'Used, visible wear' },
  { key: 'Fair',      desc: 'Heavy wear, flaws noted in description' },
];

const INPUT: React.CSSProperties = {
  width: '100%', background: 'var(--field-input-bg)',
  border: '1px solid var(--glass-border)', borderRadius: 'var(--r-sm)',
  padding: '13px 16px', color: 'var(--text)', fontSize: 15, outline: 'none',
  fontFamily: "'Quicksand',sans-serif",
};

type Mode = 'mint' | 'resell';
type MintStatus = 'idle' | 'uploading' | 'minting' | 'done' | 'error';

// ─────────────────────────────────────────────────────────────
// MINT NEW form
// ─────────────────────────────────────────────────────────────
function MintForm({ wallet }: { wallet: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [images, setImages]       = useState<{ file: File; preview: string }[]>([]);
  const [name, setName]           = useState('');
  const [serial, setSerial]       = useState('');
  const [category, setCategory]   = useState('');
  const [condition, setCondition] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice]         = useState('');
  const [listNow, setListNow]     = useState(true);
  const [status, setStatus]       = useState<MintStatus>('idle');
  const [result, setResult]       = useState<{ txHash: string; mintAddress: string; serial: string; itemId: string } | null>(null);
  const [error, setError]         = useState('');

  function pickImages(files: FileList | null) {
    if (!files) return;
    setImages(prev => [...prev, ...Array.from(files).slice(0, 4 - prev.length).map(f => ({ file: f, preview: URL.createObjectURL(f) }))].slice(0, 4));
  }

  async function uploadImage(file: File): Promise<string | null> {
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload-image', { method: 'POST', body: fd });
      if (!res.ok) return null;
      const { url } = await res.json();
      return url ?? null;
    } catch { return null; }
  }

  async function handleMint(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet) { setError('Connect your wallet first'); return; }
    if (!name || !serial || !category || !condition) { setError('Fill in all required fields'); return; }
    if (listNow && !price) { setError('Enter a price to list'); return; }
    setError('');
    setStatus('uploading');
    const imageUrl = images.length > 0 ? await uploadImage(images[0].file) : null;
    setStatus('minting');
    try {
      const res  = await fetch('/api/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, serial_number: serial, condition, category, description, owner_wallet: wallet, image_url: imageUrl, price_usdc: listNow && price ? parseFloat(price) : null, is_listed: listNow && !!price }),
      });
      const data = await res.json();
      if (res.status === 402 && data.action === 'fund_wallet') throw new Error(`Mint wallet needs devnet SOL. Visit faucet.solana.com and paste: ${data.mint_authority_address}`);
      if (!res.ok || data.error) throw new Error(data.error ?? 'Mint failed');
      if (!data.item_id) throw new Error('NFT minted but database save failed — try again');
      setResult({ txHash: data.tx_hash, mintAddress: data.mint_address, serial, itemId: data.item_id });
      setStatus('done');
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
      setStatus('error');
    }
  }

  function reset() {
    setStatus('idle'); setResult(null); setImages([]);
    setName(''); setSerial(''); setCategory(''); setCondition('');
    setDescription(''); setPrice('');
  }

  if (status === 'done' && result) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', gap: 20, textAlign: 'center' }}>
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: `${C.green}22`, border: `2px solid ${C.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 6 }}>Item Minted!</div>
          <div style={{ fontSize: 13, color: C.muted }}>Recorded on Solana · NFT provenance locked</div>
        </div>
        <div style={{ width: '100%', background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: '1px solid var(--glass-border)', borderRadius: 'var(--r)', boxShadow: 'var(--glass-shadow), var(--glass-inner)', padding: 18, textAlign: 'left' }}>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>SERIAL NUMBER (permanent)</div>
          <div style={{ fontSize: 13, color: 'var(--text-strong)', marginBottom: 14 }}>{result.serial}</div>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>NFT MINT ADDRESS</div>
          <div style={{ fontSize: 11, color: 'var(--text-strong)', wordBreak: 'break-all', marginBottom: 14 }}>{result.mintAddress}</div>
          <a href={`https://explorer.solana.com/tx/${result.txHash}`} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 12, color: 'var(--text-strong)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            View on Solana Explorer
          </a>
        </div>
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <Link href={`/item/${result.itemId}`} style={{ flex: 1, background: GH, borderRadius: 14, padding: '13px', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none', textAlign: 'center' }}>
            View Listing
          </Link>
          <button onClick={reset} style={{ flex: 1, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--r-sm)', padding: '13px', color: 'var(--text-strong)', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'Quicksand',sans-serif" }}>
            Mint Another
          </button>
        </div>
      </div>
    );
  }

  const busy      = status === 'uploading' || status === 'minting';
  const canSubmit = !!(name && serial && category && condition && (!listNow || price));

  return (
    <form onSubmit={handleMint} style={{ paddingTop: 20, paddingBottom: 40 }}>
      {/* Photos */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Photos (up to 4)</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={() => fileRef.current?.click()}
            style={{ width: images.length === 0 ? '100%' : 80, height: images.length === 0 ? 160 : 80, background: 'var(--glass-bg)', border: '2px dashed var(--glass-border)', borderRadius: 'var(--r)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', flexShrink: 0, transition: 'all .2s' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            {images.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Add Photos</div>}
          </button>
          {images.map((img, i) => (
            <div key={i} style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
              <img src={img.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12, border: i === 0 ? `2px solid var(--text-muted)` : '2px solid transparent' }} />
              {i === 0 && <div style={{ position: 'absolute', bottom: 4, left: 4, background: 'var(--glass-bg-strong)', borderRadius: 4, fontSize: 8, fontWeight: 700, color: 'var(--text)', padding: '1px 5px' }}>COVER</div>}
              <button type="button" onClick={() => setImages(p => p.filter((_, j) => j !== i))}
                style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, background: C.red, border: 'none', borderRadius: '50%', color: '#fff', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
          ))}
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => pickImages(e.target.files)} />
      </div>

      {/* Item title */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Item Title *</div>
        <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Nike Air Max 1 '86 OG Green" style={INPUT} />
      </div>

      {/* Serial number */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Serial Number *</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--glass-bg)', borderRadius: 6, padding: '3px 8px' }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.06em', fontWeight: 700 }}>LOCKED AFTER MINT</span>
          </div>
        </div>
        <input value={serial} onChange={e => setSerial(e.target.value)} required placeholder="Brand serial · SKU · custom ID"
          style={{ ...INPUT, letterSpacing: '0.04em', borderColor: serial ? 'var(--text-muted)' : 'var(--glass-border)' }} />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          Written into the NFT permanently — use the manufacturer serial or any permanent identifier.
        </div>
      </div>

      {/* Category */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Category *</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CATS.map(c => (
            <button key={c} type="button" onClick={() => setCategory(c)}
              style={{ background: category === c ? GH : 'var(--glass-bg)', border: `1px solid ${category === c ? 'transparent' : 'var(--glass-border)'}`, borderRadius: 20, padding: '7px 16px', fontSize: 13, fontWeight: category === c ? 700 : 400, color: category === c ? '#fff' : 'var(--text-muted)', cursor: 'pointer', fontFamily: "'Quicksand',sans-serif", transition: 'all .15s' }}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Condition */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Condition *</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {CONDS.map(c => (
            <button key={c.key} type="button" onClick={() => setCondition(c.key)}
              style={{ background: condition === c.key ? 'var(--glass-bg-strong)' : 'var(--glass-bg)', border: `1px solid ${condition === c.key ? 'var(--text-muted)' : 'var(--glass-border)'}`, borderRadius: 'var(--r-sm)', padding: '11px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: condition === c.key ? 700 : 500, color: condition === c.key ? 'var(--text-strong)' : 'var(--text-strong)' }}>{c.key}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{c.desc}</div>
              </div>
              {condition === c.key && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-strong)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Description</div>
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the item — size, color, any flaws, extras included…" rows={3}
          style={{ ...INPUT, resize: 'vertical', lineHeight: 1.6 }} />
      </div>

      {/* List for sale toggle */}
      <div style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: '1px solid var(--glass-border)', borderRadius: 'var(--r)', boxShadow: 'var(--glass-shadow), var(--glass-inner)', padding: '16px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: listNow ? 14 : 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>List for Sale Now</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Buyers can find and purchase this item immediately</div>
          </div>
          <button type="button" onClick={() => setListNow(p => !p)}
            style={{ width: 44, height: 24, borderRadius: 12, background: listNow ? 'var(--text-strong)' : 'var(--glass-hairline)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: 2, left: listNow ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.3)' }} />
          </button>
        </div>
        {listNow && (
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, fontWeight: 700, color: 'var(--text-muted)' }}>$</div>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" min="0.01" step="0.01"
              style={{ ...INPUT, paddingLeft: 30, fontSize: 18, fontWeight: 700 }} />
            <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: C.muted }}>USDC</div>
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: 'rgba(255,59,92,.1)', border: '1px solid rgba(255,59,92,.3)', borderRadius: 12, padding: '12px 14px', marginBottom: 16, fontSize: 13, color: C.red }}>
          {error}
        </div>
      )}

      <button type="submit" disabled={busy || !canSubmit}
        style={{ width: '100%', background: busy || !canSubmit ? 'var(--glass-bg)' : GH, border: 'none', borderRadius: 'var(--r)', padding: '16px 20px', fontWeight: 800, fontSize: 16, color: busy || !canSubmit ? 'var(--text-muted)' : '#fff', cursor: busy || !canSubmit ? 'not-allowed' : 'pointer', fontFamily: "'Quicksand',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'background .2s' }}>
        {busy ? (
          <><div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', animation: 'spin .8s linear infinite' }} />
          {status === 'uploading' ? 'Uploading photo…' : 'Minting NFT…'}</>
        ) : `Mint Item${listNow && price ? ` · List at $${price} USDC` : ''}`}
      </button>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// RELIST panel
// ─────────────────────────────────────────────────────────────
function RelistPanel({ wallet }: { wallet: string }) {
  const [editSerial, setEditSerial] = useState<string | null>(null);
  const [editPrice,  setEditPrice]  = useState('');
  const [unlisting,  setUnlisting]  = useState<string | null>(null);

  const { data: ownedItems = [], isLoading, refetch } = trpc.listings.getByOwner.useQuery({ wallet }, { enabled: !!wallet });
  const listMut   = trpc.listings.listForSale.useMutation({ onSuccess: () => { refetch(); setEditSerial(null); } });
  const unlistMut = trpc.listings.unlist.useMutation({ onSuccess: () => { refetch(); setUnlisting(null); } });

  const listed   = ownedItems.filter((i: any) => i.is_listed);
  const unlisted = ownedItems.filter((i: any) => !i.is_listed);

  if (isLoading) return (
    <div style={{ paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1,2,3].map(i => <div key={i} style={{ height: 76, background: 'var(--glass-bg)', borderRadius: 'var(--r-sm)', animation: 'pulse 2s infinite' }} />)}
    </div>
  );

  if (ownedItems.length === 0) return (
    <div style={{ textAlign: 'center', padding: '60px 0' }}>
      <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 8 }}>No items in your wallet yet</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 24 }}>Mint something first to add it to your wallet</div>
    </div>
  );

  function ItemRow({ item }: { item: any }) {
    const isEditing   = editSerial === item.serial_number;
    const isListed    = item.is_listed;
    const isUnlisting = unlisting === item.serial_number;

    return (
      <div style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: `1px solid ${isListed ? 'var(--text-muted)' : 'var(--glass-border)'}`, borderRadius: 'var(--r-sm)', boxShadow: 'var(--glass-shadow), var(--glass-inner)', padding: '12px 14px', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: isEditing ? 12 : 0 }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--glass-hairline)', overflow: 'hidden', flexShrink: 0 }}>
            {item.image_url
              ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><title>Name is locked at mint</title><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>SN: {item.serial_number} · {item.condition}</div>
            {(item as any).transfer_count > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '5px 10px', marginTop: 6, fontSize: 10, color: 'var(--text-muted)' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Will list as Used — condition was set at mint
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            {isListed ? (
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, background: GH, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>${item.price_usdc}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>LISTED</div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>not listed</div>
            )}
          </div>
        </div>

        {isEditing && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: 'var(--text-muted)' }}>$</span>
              <input autoFocus type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)}
                placeholder={isListed ? String(item.price_usdc) : '0.00'} min="0.01" step="0.01"
                style={{ width: '100%', background: 'var(--field-input-bg)', border: '1px solid var(--glass-border)', borderRadius: 10, padding: '10px 12px 10px 28px', color: 'var(--text)', fontSize: 15, fontWeight: 700, outline: 'none', fontFamily: "'Quicksand',sans-serif" }} />
              <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: C.muted }}>USDC</span>
            </div>
            <button onClick={() => { if (editPrice) listMut.mutate({ serial: item.serial_number, price_usdc: parseFloat(editPrice), seller_wallet: wallet }); }}
              disabled={!editPrice || listMut.isPending}
              style={{ background: GH, border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
              {listMut.isPending ? '…' : 'List'}
            </button>
            <button onClick={() => setEditSerial(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20 }}>×</button>
          </div>
        )}

        {!isEditing && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--divider)' }}>
            <Link href={`/item/${item.id}`}
              style={{ flex: 1, textAlign: 'center', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '7px', fontSize: 11, color: 'var(--text)', textDecoration: 'none' }}>
              View
            </Link>
            <button onClick={() => { setEditSerial(item.serial_number); setEditPrice(isListed ? String(item.price_usdc) : ''); }}
              style={{ flex: 1, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '7px', fontSize: 11, color: 'var(--text)', cursor: 'pointer', fontFamily: "'Quicksand',sans-serif" }}>
              {isListed ? 'Edit Price' : 'Set Price'}
            </button>
            {isListed && (
              <button onClick={() => { setUnlisting(item.serial_number); unlistMut.mutate({ serial: item.serial_number, seller_wallet: wallet }); }}
                disabled={!!isUnlisting}
                style={{ flex: 1, background: `${C.red}12`, border: `1px solid ${C.red}30`, borderRadius: 8, padding: '7px', fontSize: 11, color: C.red, cursor: 'pointer', fontFamily: "'Quicksand',sans-serif", opacity: isUnlisting ? 0.5 : 1 }}>
                {isUnlisting ? '…' : 'Unlist'}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 20 }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        {[
          { label: 'In Wallet',  value: ownedItems.length, color: C.muted },
          { label: 'Listed',     value: listed.length,     color: 'var(--text-strong)' },
          { label: 'Not Listed', value: unlisted.length,   color: 'var(--text-muted)' },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', border: '1px solid var(--glass-border)', borderRadius: 'var(--r-sm)', boxShadow: 'var(--glass-shadow), var(--glass-inner)', padding: '12px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {listed.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Active Listings</div>
          {listed.map((item: any) => <ItemRow key={item.id} item={item} />)}
        </div>
      )}
      {unlisted.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Ready to List</div>
          {unlisted.map((item: any) => <ItemRow key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────
export default function SellerDashboardPage() {
  const { ready, authenticated } = usePrivy();
  const { address: wallet } = useVisbWallet();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('mint');

  if (ready && !authenticated) {
    router.replace('/login');
    return null;
  }

  return (
    <div style={{ background: C.navy, minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)' }}>
        <div className="visby-page" style={{ paddingTop: 13, paddingBottom: 13, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>Sell</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--glass-bg)', borderRadius: 6, padding: '3px 8px' }}>SOLANA</div>
        </div>
      </div>

      <div className="visby-page" style={{ paddingBottom: 100 }}>

        {/* Toggle */}
        <div style={{ margin: '20px 0 0', background: 'var(--glass-bg)', borderRadius: 'var(--r)', padding: 4, display: 'flex', gap: 4, overflow: 'hidden' }}>
          {([
            { id: 'mint'   as Mode, label: 'Mint New',  sub: 'New NFT'     },
            { id: 'resell' as Mode, label: 'Relist',    sub: 'From wallet' },
          ]).map(t => (
            <button key={t.id} onClick={() => setMode(t.id)}
              style={{ flex: 1, background: mode === t.id ? GH : 'none', border: 'none', borderRadius: 'var(--r-sm)', padding: '12px 4px', cursor: 'pointer', fontFamily: "'Manrope',sans-serif", transition: 'all .15s', textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: mode === t.id ? 700 : 500, color: mode === t.id ? '#fff' : 'var(--text-muted)' }}>{t.label}</div>
              <div style={{ fontSize: 10, color: mode === t.id ? '#fff' : 'var(--text-muted)', marginTop: 2 }}>{t.sub}</div>
            </button>
          ))}
        </div>

        {mode === 'mint'   && <MintForm    wallet={wallet} />}
        {mode === 'resell' && <RelistPanel wallet={wallet} />}
      </div>

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }
      `}</style>
    </div>
  );
}
