'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { trpc } from '@/lib/trpc/client';
import { useVisbWallet } from '@/lib/wallet';
import { t, S, price, card, surface, btn, badge, sectionLabel, input, tabSlider } from '@/lib/ui';
import { explorerTx } from '@/lib/explorer';
import ShippingEstimator, { SHIP_DEFAULTS, type ShipValues } from '@/components/shipping-estimator';
import { HeaderMenu } from '@/components/layout/header-menu';
import { isCutout } from '@/components/listing-card';
import { feeBreakdown } from '@/lib/fees';
import { localShipEstimate } from '@/lib/shipping-estimate';
import KycVerify from '@/components/kyc-verify';
import { EmptyState } from '@/components/empty-state';
import { CutoutEditor } from '@/components/cutout-editor';

const C = {
  navy: 'transparent', teal: '#22C6B7', cyan: '#25CDB8',
  blue: '#2A8AED', mag: '#BC2DE6', muted: 'var(--text-muted)',
  green: 'var(--ok)', red: 'var(--danger)', border: 'var(--glass-border)',
};

const CATS  = ['Sneakers','Watches','Bags','Memorabilia','Vintage','Electronics','Other'];
const CONDS = [
  { key: 'New',       desc: 'Brand new, never used' },
  { key: 'Like New',  desc: 'Used once or twice, no flaws' },
  { key: 'Excellent', desc: 'Lightly used, minor signs of wear' },
  { key: 'Good',      desc: 'Used, visible wear' },
  { key: 'Fair',      desc: 'Heavy wear, flaws noted in description' },
];

type Mode = 'mint' | 'resell' | 'bulk';
type MintStatus = 'idle' | 'uploading' | 'minting' | 'done' | 'error';
type PendingSerial = {
  id: string; serial_number: string; name: string; category: string | null; condition: string | null;
  description: string | null; image_url: string | null; brand: string | null; price_usdc: number | null;
  available: boolean; status: 'pending' | 'minted' | 'cancelled'; created_at: string;
};

// ─────────────────────────────────────────────────────────────
// MINT NEW form
// ─────────────────────────────────────────────────────────────
function MintForm({ wallet }: { wallet: string }) {
  const { getAccessToken } = usePrivy();
  const fileRef = useRef<HTMLInputElement>(null);
  const [images, setImages]       = useState<{ id: string; original: File; originalUrl: string; cutFile?: File; cutUrl?: string; useCut: boolean; busy: boolean }[]>([]);
  const [name, setName]           = useState('');
  const [serial, setSerial]       = useState('');
  const [category, setCategory]   = useState('');
  const [condition, setCondition] = useState('New');   // minted items are always New; resales auto-show as Used
  const [description, setDescription] = useState('');
  const [price, setPrice]         = useState('');
  const [listNow, setListNow]     = useState(true);
  const [ship, setShip]           = useState<ShipValues>(SHIP_DEFAULTS);
  const [status, setStatus]       = useState<MintStatus>('idle');
  const [result, setResult]       = useState<{ txHash: string; mintAddress: string; serial: string; itemId: string } | null>(null);
  const [error, setError]         = useState('');
  const [editId, setEditId]       = useState<string | null>(null); // image whose cutout editor is open

  function pickImages(files: FileList | null) {
    if (!files) return;
    const adds = Array.from(files).slice(0, 4 - images.length).map(f => ({
      id: crypto.randomUUID(), original: f, originalUrl: URL.createObjectURL(f), useCut: false, busy: false,
    }));
    setImages(prev => [...prev, ...adds].slice(0, 4));
    // Open the cutout flow (auto → "looks good?" → manual) for the first freshly-added photo.
    if (adds[0]) setEditId(adds[0].id);
  }

  // Result of the cutout editor: adopt the returned file as this image's cutout (or clear it).
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

  async function uploadImage(file: File, cutout: boolean): Promise<string | null> {
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (cutout) fd.append('cutout', '1');
      const token = await getAccessToken();
      const res = await fetch('/api/upload-image', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
      if (!res.ok) return null;
      const { url } = await res.json();
      return url ?? null;
    } catch { return null; }
  }

  async function handleMint(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet) { setError('Connect your wallet first'); return; }
    if (!name || !serial || !category) { setError('Fill in all required fields'); return; }
    if (listNow && !price) { setError('Enter a price to list'); return; }
    setError('');
    setStatus('uploading');
    const cover = images[0];
    const imageUrl = cover
      ? await uploadImage(cover.useCut && cover.cutFile ? cover.cutFile : cover.original, cover.useCut && !!cover.cutFile)
      : null;
    setStatus('minting');
    try {
      const token = await getAccessToken();
      const res  = await fetch('/api/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          name, serial_number: serial, condition, category, description, owner_wallet: wallet, image_url: imageUrl,
          destination_wallet: (() => { try { return localStorage.getItem('visby-tally-wallet') || undefined; } catch { return undefined; } })(),
          price_usdc: listNow && price ? parseFloat(price) : null, is_listed: listNow && !!price,
          weight_oz: parseFloat(ship.weight_oz) || null,
          length_in: parseFloat(ship.length_in) || null,
          width_in:  parseFloat(ship.width_in)  || null,
          height_in: parseFloat(ship.height_in) || null,
          ship_service_pref: ship.service || 'cheapest_2day',
        }),
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
    setName(''); setSerial(''); setCategory(''); setCondition('New');
    setDescription(''); setPrice(''); setShip(SHIP_DEFAULTS);
  }

  if (status === 'done' && result) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: S[7], paddingBottom: S[7], gap: S[5], textAlign: 'center' }}>
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: `${C.green}22`, border: `2px solid ${C.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div style={{ ...t('title'), color: 'var(--text-strong)' }}>Item Minted</div>
        <div style={{ ...card({ pad: S[4] }), width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: S[4] }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
            <div style={sectionLabel()}>Serial Number</div>
            <div style={{ ...t('body'), color: 'var(--text-strong)' }}>{result.serial}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
            <div style={sectionLabel()}>Mint Address</div>
            <div style={{ ...t('meta'), color: 'var(--text-strong)', wordBreak: 'break-all' }}>{result.mintAddress}</div>
          </div>
          <a href={explorerTx(result.txHash)} target="_blank" rel="noopener noreferrer"
            style={{ ...t('meta'), color: 'var(--text-strong)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: S[1] }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            View on Explorer
          </a>
        </div>
        <div style={{ display: 'flex', gap: S[2], width: '100%' }}>
          <Link href={`/item/${result.itemId}`} style={{ ...btn('primary'), flex: 1 }}>
            View Listing
          </Link>
          <button onClick={reset} style={{ ...btn('secondary'), flex: 1 }}>
            Mint Another
          </button>
        </div>
      </div>
    );
  }

  const busy      = status === 'uploading' || status === 'minting';
  const canSubmit = !!(name && serial && category && (!listNow || price));

  return (
    <form onSubmit={handleMint} style={{ paddingTop: S[5], paddingBottom: S[7], display: 'flex', flexDirection: 'column', gap: S[5] }}>
      {/* Photos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
        <div style={sectionLabel()}>Photos (up to 4)</div>
        <div style={{ display: 'flex', gap: S[2] }}>
          <button type="button" onClick={() => fileRef.current?.click()}
            style={{ ...surface({ radius: 'var(--r)' }), width: images.length === 0 ? '100%' : 80, height: images.length === 0 ? 160 : 80, borderStyle: 'dashed', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: S[2], cursor: 'pointer', flexShrink: 0 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            {images.length === 0 && <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Add Photos</div>}
          </button>
          {images.map((img, i) => {
            const url = img.useCut && img.cutUrl ? img.cutUrl : img.originalUrl;
            return (
            <div key={img.id} style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
              <img src={url} alt="" title="Tap to remove background" onClick={() => setEditId(img.id)} style={{ width: '100%', height: '100%', objectFit: img.useCut ? 'contain' : 'cover', borderRadius: 'var(--r-sm)', border: i === 0 ? `2px solid var(--text-muted)` : '2px solid transparent', cursor: 'pointer' }} />
              {i === 0 && <span style={{ ...badge('onImage'), position: 'absolute', bottom: S[1], left: S[1] }}>COVER</span>}
              {img.busy && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--img-scrim)', borderRadius: 'var(--r-sm)' }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #fff', borderTopColor: 'transparent', animation: 'spin .8s linear infinite' }} />
                </div>
              )}
              {img.cutFile && !img.busy && (
                <button type="button" title={img.useCut ? 'Show original' : 'Remove background'}
                  onClick={() => setImages(p => p.map(m => m.id === img.id ? { ...m, useCut: !m.useCut } : m))}
                  style={{ position: 'absolute', bottom: -6, right: -6, width: 22, height: 22, background: img.useCut ? 'var(--grad-brand)' : 'var(--glass-bg-strong)', border: 'none', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.2)' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={img.useCut ? '#fff' : 'var(--text)'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 3l2 2M19 3l-2 2M3 12h2M19 12h2M12 7a5 5 0 0 0-5 5c0 2 1 3 2 4h6c1-1 2-2 2-4a5 5 0 0 0-5-5z"/>
                  </svg>
                </button>
              )}
              <button type="button" onClick={() => setImages(p => p.filter(m => m.id !== img.id))}
                style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, background: C.red, border: 'none', borderRadius: '50%', color: '#fff', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            );
          })}
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => pickImages(e.target.files)} />
      </div>

      {/* Item title */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
        <div style={sectionLabel()}>Item Title</div>
        <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Nike Air Max 1 '86 OG Green" style={input()} />
      </div>

      {/* Serial number */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[2] }}>
          <div style={sectionLabel()}>Serial Number</div>
          <span style={{ ...badge('default'), gap: S[1] }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            LOCKED AFTER MINT
          </span>
        </div>
        <input value={serial} onChange={e => setSerial(e.target.value)} required placeholder="Brand serial · SKU · custom ID"
          style={{ ...input(), borderColor: serial ? 'var(--text-muted)' : 'var(--glass-border)' }} />
        <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
          Written permanently — use the manufacturer serial or any permanent identifier.
        </div>
      </div>

      {/* Category */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
        <div style={sectionLabel()}>Category</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[2] }}>
          {CATS.map(c => (
            <button key={c} type="button" onClick={() => setCategory(c)}
              style={{ ...btn(category === c ? 'primary' : 'secondary'), padding: '7px 16px' }}>
              {c}
            </button>
          ))}
        </div>
      </div>


      {/* Description */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
        <div style={sectionLabel()}>Description</div>
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the item — size, color, any flaws, extras included…" rows={3}
          style={{ ...input(), resize: 'vertical', lineHeight: 1.6 }} />
      </div>

      {/* List for sale toggle */}
      <div style={{ ...card({ pad: S[4] }), display: 'flex', flexDirection: 'column', gap: listNow ? S[3] : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[3] }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
            <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>List for Sale Now</div>
            <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Buyers can find and purchase this item immediately</div>
          </div>
          <button type="button" onClick={() => setListNow(p => !p)}
            style={{ width: 44, height: 24, borderRadius: 12, background: listNow ? 'var(--text-strong)' : 'var(--glass-hairline)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: 2, left: listNow ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.3)' }} />
          </button>
        </div>
        {listNow && (
          <>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: S[4], top: '50%', transform: 'translateY(-50%)', ...t('heading'), color: 'var(--text-muted)' }}>$</div>
              <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" min="0.01" step="0.01"
                style={{ ...input(), paddingLeft: S[6] }} />
              <div style={{ position: 'absolute', right: S[4], top: '50%', transform: 'translateY(-50%)', ...t('meta'), color: 'var(--text-muted)' }}>USDC</div>
            </div>
            <ShippingEstimator priceUsd={parseFloat(price) || undefined} value={ship} onChange={setShip} />
          </>
        )}
      </div>

      {error && (
        <div style={{ ...badge('danger'), display: 'flex', padding: '12px 16px', borderRadius: 'var(--r-sm)', ...t('body'), letterSpacing: 0 }}>
          {error}
        </div>
      )}

      <button type="submit" disabled={busy || !canSubmit}
        style={{ ...btn(busy || !canSubmit ? 'secondary' : 'primary', { full: true, pill: false }), opacity: busy || !canSubmit ? 0.6 : 1, cursor: busy || !canSubmit ? 'not-allowed' : 'pointer' }}>
        {busy ? (
          <><div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', animation: 'spin .8s linear infinite' }} />
          {status === 'uploading' ? 'Uploading photo…' : 'Minting…'}</>
        ) : `Mint Item${listNow && price ? ` · $${price} USDC` : ''}`}
      </button>

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
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// RELIST panel
// ─────────────────────────────────────────────────────────────
function RelistPanel({ wallet, onMintClick }: { wallet: string; onMintClick: () => void }) {
  const [editSerial, setEditSerial] = useState<string | null>(null);
  const [editPrice,  setEditPrice]  = useState('');
  const [unlisting,  setUnlisting]  = useState<string | null>(null);

  const { data: ownedItems = [], isLoading, refetch } = trpc.listings.getByOwner.useQuery({ wallet }, { enabled: !!wallet });
  const listMut   = trpc.listings.listForSale.useMutation({ onSuccess: () => { refetch(); setEditSerial(null); } });
  const unlistMut = trpc.listings.unlist.useMutation({ onSuccess: () => { refetch(); setUnlisting(null); } });

  const listed   = ownedItems.filter((i: any) => i.is_listed);
  const unlisted = ownedItems.filter((i: any) => !i.is_listed);

  if (isLoading) return (
    <div style={{ paddingTop: S[5], display: 'flex', flexDirection: 'column', gap: S[2] }}>
      {[1,2,3].map(i => <div key={i} style={{ height: 76, background: 'var(--glass-bg)', borderRadius: 'var(--r-sm)', animation: 'pulse 2s infinite' }} />)}
    </div>
  );

  if (ownedItems.length === 0) return (
    <div style={{ paddingTop: S[8], paddingBottom: S[8] }}>
      <EmptyState
        icon={<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>}
        title="Nothing to relist yet"
        message="Mint something first, then it'll show up here ready to list."
        action={{ label: 'Mint an item', onClick: onMintClick }}
      />
    </div>
  );

  function ItemRow({ item }: { item: any }) {
    const isEditing   = editSerial === item.serial_number;
    const isListed    = item.is_listed;
    const isUnlisting = unlisting === item.serial_number;

    return (
      <div style={{ ...card({ pad: '12px 16px' }), borderColor: isListed ? 'var(--text-muted)' : 'var(--glass-border)', marginBottom: S[2] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: S[3], marginBottom: isEditing ? S[3] : 0 }}>
          <div style={{ ...surface({ radius: 'var(--r-sm)' }), width: 48, height: 48, overflow: 'hidden', flexShrink: 0 }}>
            {item.image_url
              ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: isCutout(item.image_url) ? 'contain' : 'cover', padding: isCutout(item.image_url) ? 4 : 0 }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
            }
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: S[1] }}>
            <div style={{ ...t('heading'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: S[1] }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><title>Name is locked at mint</title><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>SN: {item.serial_number} · {(item as any).transfer_count > 0 ? 'Used' : 'New'}</div>
            {(item as any).transfer_count > 0 && (
              <div style={{ ...surface({ pad: '6px 10px' }), display: 'flex', alignItems: 'center', gap: S[1], marginTop: S[1], ...t('meta'), color: 'var(--text-muted)' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Lists as Used — it&apos;s been owned before
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: S[1] }}>
            {isListed ? (
              <>
                <div style={price('sm')}>${item.price_usdc}</div>
                <div style={{ ...t('micro'), color: 'var(--text-muted)' }}>LISTED</div>
              </>
            ) : (
              <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Not listed</div>
            )}
          </div>
        </div>

        {isEditing && (
          <>
          <div style={{ display: 'flex', gap: S[2], alignItems: 'center', marginTop: S[3] }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <span style={{ position: 'absolute', left: S[3], top: '50%', transform: 'translateY(-50%)', ...t('body'), color: 'var(--text-muted)' }}>$</span>
              <input autoFocus type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)}
                placeholder={isListed ? String(item.price_usdc) : '0.00'} min="0.01" step="0.01"
                style={{ ...input(), padding: '10px 44px 10px 28px' }} />
              <span style={{ position: 'absolute', right: S[3], top: '50%', transform: 'translateY(-50%)', ...t('meta'), color: 'var(--text-muted)' }}>USDC</span>
            </div>
            <button onClick={() => { if (editPrice) listMut.mutate({ serial: item.serial_number, price_usdc: parseFloat(editPrice), seller_wallet: wallet }); }}
              disabled={!editPrice || listMut.isPending}
              style={btn('primary', { pill: false })}>
              {listMut.isPending ? '…' : 'List'}
            </button>
            <button onClick={() => setEditSerial(null)} style={{ ...btn('text', { pill: false }), fontSize: 20 }}>×</button>
          </div>
          {editPrice && parseFloat(editPrice) > 0 && (() => {
            const ship = localShipEstimate(item.weight_oz, item.ship_service_pref);
            const bd = feeBreakdown(parseFloat(editPrice), ship);
            return (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: S[2], gap: S[2], flexWrap: 'wrap' }}>
                <span style={{ ...t('micro'), color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>
                  Visby fee (9%) −${bd.platform_fee_usd.toFixed(2)} · {ship > 0 ? `est. shipping −$${ship.toFixed(2)}` : 'seller is subject to shipping fees'}
                </span>
                <span style={{ ...t('meta'), color: 'var(--ok)', fontWeight: 700 }}>
                  You net ~${bd.seller_net_usd.toFixed(2)}{ship > 0 ? '' : ' minus shipping fees'}
                </span>
              </div>
            );
          })()}
          </>
        )}

        {!isEditing && (
          <div style={{ display: 'flex', gap: S[2], marginTop: S[3], paddingTop: S[3], borderTop: '1px solid var(--divider)' }}>
            <Link href={`/item/${item.id}`} style={{ ...btn('secondary', { pill: false }), flex: 1, padding: '8px' }}>
              View
            </Link>
            <button onClick={() => { setEditSerial(item.serial_number); setEditPrice(isListed ? String(item.price_usdc) : ''); }}
              style={{ ...btn('secondary', { pill: false }), flex: 1, padding: '8px' }}>
              {isListed ? 'Edit Price' : 'Set Price'}
            </button>
            {isListed && (
              <button onClick={() => { setUnlisting(item.serial_number); unlistMut.mutate({ serial: item.serial_number, seller_wallet: wallet }); }}
                disabled={!!isUnlisting}
                style={{ ...btn('danger', { pill: false }), flex: 1, padding: '8px', opacity: isUnlisting ? 0.5 : 1 }}>
                {isUnlisting ? '…' : 'Unlist'}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ paddingTop: S[5], display: 'flex', flexDirection: 'column', gap: S[6] }}>
      <div style={{ display: 'flex', gap: S[2] }}>
        {[
          { label: 'In Wallet',  value: ownedItems.length, color: 'var(--text-muted)' },
          { label: 'Listed',     value: listed.length,     color: 'var(--text-strong)' },
          { label: 'Not Listed', value: unlisted.length,   color: 'var(--text-muted)' },
        ].map(s => (
          <div key={s.label} style={{ ...card({ pad: '12px 10px' }), flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: S[1] }}>
            <div style={{ ...t('title'), color: s.color }}>{s.value}</div>
            <div style={{ ...t('micro'), color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {listed.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
          <div style={sectionLabel()}>Active Listings</div>
          {listed.map((item: any) => <ItemRow key={item.id} item={item} />)}
        </div>
      )}
      {unlisted.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
          <div style={sectionLabel()}>Ready to List</div>
          {unlisted.map((item: any) => <ItemRow key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// BULK LOG panel (business accounts only) — pre-log genuine inventory serials as
// pending/unminted. Minting happens later, when each item actually sells (2.3, not here).
// ─────────────────────────────────────────────────────────────
const CSV_HINT = 'serial_number, name, category, condition, description, image_url, brand, price_usdc';

// Small on/off switch — mirrors the Toggle in src/app/settings/page.tsx so every switch in the
// app looks and behaves the same.
function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onToggle} disabled={disabled}
      style={{ width: 44, height: 26, borderRadius: 13, background: on ? 'var(--grad-brand)' : 'var(--surface-bg)', border: `1.5px solid ${on ? 'transparent' : 'var(--glass-border)'}`, position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, transition: 'all .2s', flexShrink: 0, padding: 0 }}>
      <div style={{ width: 20, height: 20, borderRadius: '50%', background: on ? '#fff' : 'var(--text-muted)', position: 'absolute', top: 1, left: on ? 20 : 1, transition: 'left .2s, background .2s' }} />
    </button>
  );
}

function BulkLogPanel({ wallet }: { wallet: string }) {
  const { getAccessToken } = usePrivy();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv]           = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]     = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);
  const [error, setError]       = useState('');
  const [rows, setRows]         = useState<PendingSerial[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [rowBusy, setRowBusy]   = useState<Record<string, boolean>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});

  async function loadRows() {
    if (!wallet) return;
    setLoadingRows(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/business/bulk-serials?wallet=${encodeURIComponent(wallet)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) { const j = await res.json(); setRows(j.rows ?? []); }
    } catch { /* non-fatal */ } finally { setLoadingRows(false); }
  }
  useEffect(() => { loadRows(); }, [wallet]); // eslint-disable-line react-hooks/exhaustive-deps

  async function patchRow(id: string, patch: { available?: boolean; price_usdc?: number | null }): Promise<boolean> {
    setRowBusy(prev => ({ ...prev, [id]: true }));
    setRowError(prev => ({ ...prev, [id]: '' }));
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/business/bulk-serials', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ wallet, id, ...patch }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? j.error ?? 'Could not update — try again');
      setRows(prev => prev.map(r => (r.id === id ? { ...r, ...j.row } : r)));
      return true;
    } catch (err: any) {
      setRowError(prev => ({ ...prev, [id]: err.message ?? 'Unknown error' }));
      return false;
    } finally {
      setRowBusy(prev => ({ ...prev, [id]: false }));
    }
  }

  function pickFile(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ''));
    reader.readAsText(f);
  }

  async function submit() {
    if (!wallet || !csv.trim() || submitting) return;
    setSubmitting(true); setError(''); setResult(null);
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/business/bulk-serials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ wallet, csv }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'Could not log serials — try again');
      setResult({ inserted: j.inserted ?? 0, skipped: j.skipped ?? 0, errors: j.errors ?? [] });
      setCsv('');
      await loadRows();
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
    } finally { setSubmitting(false); }
  }

  const pending = rows.filter(r => r.status === 'pending');

  return (
    <div style={{ paddingTop: S[5], paddingBottom: S[7], display: 'flex', flexDirection: 'column', gap: S[6] }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
        <div style={sectionLabel()}>Paste or upload CSV</div>
        <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
          Columns, in order: {CSV_HINT}
        </div>
        <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={6}
          placeholder={`serial_number,name,category,condition\nSN-001,Air Jordan 1,Sneakers,New`}
          style={{ ...input(), resize: 'vertical', lineHeight: 1.6, fontFamily: "'Manrope',monospace" }} />
        <div style={{ display: 'flex', gap: S[2] }}>
          <button type="button" onClick={() => fileRef.current?.click()} style={{ ...btn('secondary'), flex: 1 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload CSV file
          </button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => pickFile(e.target.files)} />
        </div>

        {error && (
          <div style={{ ...badge('danger'), display: 'flex', padding: '12px 16px', borderRadius: 'var(--r-sm)', ...t('body'), letterSpacing: 0 }}>
            {error}
          </div>
        )}

        <button type="button" onClick={submit} disabled={submitting || !csv.trim()}
          style={{ ...btn(submitting || !csv.trim() ? 'secondary' : 'primary', { full: true, pill: false }), opacity: submitting || !csv.trim() ? 0.6 : 1, cursor: submitting || !csv.trim() ? 'not-allowed' : 'pointer' }}>
          {submitting ? (
            <><div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', animation: 'spin .8s linear infinite' }} />Logging…</>
          ) : 'Log serials'}
        </button>

        {result && (
          <div style={{ ...card({ pad: S[4] }), display: 'flex', flexDirection: 'column', gap: S[2] }}>
            <div style={{ display: 'flex', gap: S[5] }}>
              <div>
                <div style={{ ...t('title'), color: 'var(--ok)' }}>{result.inserted}</div>
                <div style={{ ...t('micro'), color: 'var(--text-muted)' }}>Logged</div>
              </div>
              <div>
                <div style={{ ...t('title'), color: 'var(--text-muted)' }}>{result.skipped}</div>
                <div style={{ ...t('micro'), color: 'var(--text-muted)' }}>Duplicate / Skipped</div>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
                {result.errors.slice(0, 10).map((e, i) => (
                  <div key={i} style={{ ...t('meta'), color: 'var(--danger)' }}>{e}</div>
                ))}
                {result.errors.length > 10 && (
                  <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>+{result.errors.length - 10} more</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
        <div style={sectionLabel()}>Pending serials ({pending.length})</div>
        {loadingRows ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {[1, 2, 3].map(i => <div key={i} style={{ height: 60, background: 'var(--glass-bg)', borderRadius: 'var(--r-sm)', animation: 'pulse 2s infinite' }} />)}
          </div>
        ) : pending.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: S[7], paddingBottom: S[7], display: 'flex', flexDirection: 'column', gap: S[2] }}>
            <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>No pending serials yet</div>
            <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Paste or upload a CSV above to pre-log inventory</div>
          </div>
        ) : (
          pending.map(r => {
            const draft = priceDrafts[r.id] ?? (r.price_usdc != null ? String(r.price_usdc) : '');
            const busy = !!rowBusy[r.id];
            const rowErr = rowError[r.id];

            async function commitPrice() {
              const trimmed = draft.trim();
              const next = trimmed === '' ? null : Number(trimmed);
              if (next != null && (!Number.isFinite(next) || next <= 0)) {
                setRowError(prev => ({ ...prev, [r.id]: 'Enter a positive price' }));
                return;
              }
              if (next === r.price_usdc) return; // unchanged — skip the round trip
              await patchRow(r.id, { price_usdc: next });
            }

            async function togglePublish() {
              if (busy) return;
              const nextAvailable = !r.available;
              if (nextAvailable) {
                // Publishing — make sure a price is set (draft may not be committed yet).
                const trimmed = draft.trim();
                const draftPrice = trimmed === '' ? null : Number(trimmed);
                if (!(typeof draftPrice === 'number' && Number.isFinite(draftPrice) && draftPrice > 0) && !(r.price_usdc != null && r.price_usdc > 0)) {
                  setRowError(prev => ({ ...prev, [r.id]: 'Set a price before publishing this serial' }));
                  return;
                }
                // If the price was edited but not yet saved, send both in one PATCH.
                if (draftPrice != null && draftPrice !== r.price_usdc) {
                  await patchRow(r.id, { price_usdc: draftPrice, available: true });
                  return;
                }
              }
              await patchRow(r.id, { available: nextAvailable });
            }

            return (
              <div key={r.id} style={{ ...surface({ pad: '12px 16px' }), display: 'flex', flexDirection: 'column', gap: S[2] }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: S[3] }}>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: S[1] }}>
                    <div style={{ ...t('heading'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                    <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>SN: {r.serial_number}{r.category ? ` · ${r.category}` : ''}</div>
                  </div>
                  <span style={r.available ? badge('success') : badge('default')}>{r.available ? 'LIVE' : 'PENDING'}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: S[3] }}>
                  <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', ...t('body'), color: 'var(--text-muted)' }}>$</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      inputMode="decimal"
                      value={draft}
                      disabled={busy}
                      onChange={e => setPriceDrafts(prev => ({ ...prev, [r.id]: e.target.value }))}
                      onBlur={commitPrice}
                      placeholder="Price (USD)"
                      style={{ ...input(), padding: '10px 12px 10px 24px', fontSize: 14 }}
                    />
                  </div>
                  <Toggle on={r.available} onToggle={togglePublish} disabled={busy} />
                </div>

                {rowErr && <div style={{ ...t('meta'), color: 'var(--danger)' }}>{rowErr}</div>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────
export default function SellerDashboardPage() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { address: wallet } = useVisbWallet();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('mint');
  const [isBusiness, setIsBusiness] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch('/api/kyc/status', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const j = await res.json();
        if (!cancelled) setIsBusiness(j.account_type === 'business');
      } catch { /* best-effort — tab just stays hidden */ }
    })();
    return () => { cancelled = true; };
  }, [getAccessToken, authenticated]);

  if (ready && !authenticated) {
    router.replace('/login');
    return null;
  }

  return (
    <div style={{ background: C.navy, minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)' }}>
        <div className="visby-page" style={{ paddingTop: S[3], paddingBottom: S[3], display: 'flex', alignItems: 'center' }}>
          <div style={{ ...t('title'), color: 'var(--text-strong)' }}>Sell</div>
          <div style={{ marginLeft: 'auto' }}><HeaderMenu /></div>
        </div>
      </div>

      <div className="visby-page" style={{ paddingTop: S[5], paddingBottom: 100 }}>

        <div style={{ marginBottom: S[5] }}>
          <KycVerify />
        </div>

        {/* Toggle */}
        <div style={tabSlider().wrap}>
          {([
            { id: 'mint'   as Mode, label: 'Mint New' },
            { id: 'resell' as Mode, label: 'Relist'   },
            ...(isBusiness ? [{ id: 'bulk' as Mode, label: 'Bulk log' }] : []),
          ]).map(tab => (
            <button key={tab.id} onClick={() => setMode(tab.id)}
              style={{ ...tabSlider().item, ...(mode === tab.id ? tabSlider().itemActive : null) }}>
              {tab.label}
            </button>
          ))}
        </div>

        {mode === 'mint'   && <MintForm     wallet={wallet} />}
        {mode === 'resell' && <RelistPanel  wallet={wallet} onMintClick={() => setMode('mint')} />}
        {mode === 'bulk' && isBusiness && <BulkLogPanel wallet={wallet} />}
      </div>

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }
      `}</style>
    </div>
  );
}
