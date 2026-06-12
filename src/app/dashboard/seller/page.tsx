'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { trpc } from '@/lib/trpc/client';
import { useVisbWallet } from '@/lib/wallet';
import { t, S, price, card, surface, btn, badge, sectionLabel, input, tabSlider } from '@/lib/ui';

const C = {
  navy: 'transparent', teal: '#22C6B7', cyan: '#25CDB8',
  blue: '#2A8AED', mag: '#BC2DE6', muted: 'var(--text-muted)',
  green: '#00C48C', red: '#FF3B5C', border: 'var(--glass-border)',
};

const CATS  = ['Sneakers','Watches','Bags','Memorabilia','Vintage','Electronics','Other'];
const CONDS = [
  { key: 'New',       desc: 'Brand new, never used' },
  { key: 'Like New',  desc: 'Used once or twice, no flaws' },
  { key: 'Excellent', desc: 'Lightly used, minor signs of wear' },
  { key: 'Good',      desc: 'Used, visible wear' },
  { key: 'Fair',      desc: 'Heavy wear, flaws noted in description' },
];

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
          <a href={`https://explorer.solana.com/tx/${result.txHash}`} target="_blank" rel="noopener noreferrer"
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
  const canSubmit = !!(name && serial && category && condition && (!listNow || price));

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
          {images.map((img, i) => (
            <div key={i} style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
              <img src={img.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--r-sm)', border: i === 0 ? `2px solid var(--text-muted)` : '2px solid transparent' }} />
              {i === 0 && <span style={{ ...badge('onImage'), position: 'absolute', bottom: S[1], left: S[1] }}>COVER</span>}
              <button type="button" onClick={() => setImages(p => p.filter((_, j) => j !== i))}
                style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, background: C.red, border: 'none', borderRadius: '50%', color: '#fff', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
          ))}
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

      {/* Condition */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
        <div style={sectionLabel()}>Condition</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          {CONDS.map(c => (
            <button key={c.key} type="button" onClick={() => setCondition(c.key)}
              style={{ ...surface({ pad: '12px 16px' }), borderColor: condition === c.key ? 'var(--text-muted)' : 'var(--glass-hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[3], cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
                <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>{c.key}</div>
                <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>{c.desc}</div>
              </div>
              {condition === c.key && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-strong)" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>}
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
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: S[4], top: '50%', transform: 'translateY(-50%)', ...t('heading'), color: 'var(--text-muted)' }}>$</div>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" min="0.01" step="0.01"
              style={{ ...input(), paddingLeft: S[6] }} />
            <div style={{ position: 'absolute', right: S[4], top: '50%', transform: 'translateY(-50%)', ...t('meta'), color: 'var(--text-muted)' }}>USDC</div>
          </div>
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
    <div style={{ paddingTop: S[5], display: 'flex', flexDirection: 'column', gap: S[2] }}>
      {[1,2,3].map(i => <div key={i} style={{ height: 76, background: 'var(--glass-bg)', borderRadius: 'var(--r-sm)', animation: 'pulse 2s infinite' }} />)}
    </div>
  );

  if (ownedItems.length === 0) return (
    <div style={{ textAlign: 'center', paddingTop: S[8], paddingBottom: S[8], display: 'flex', flexDirection: 'column', gap: S[2] }}>
      <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>No items in your wallet yet</div>
      <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Mint something first to add it to your wallet</div>
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
              ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
            }
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: S[1] }}>
            <div style={{ ...t('heading'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: S[1] }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><title>Name is locked at mint</title><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>SN: {item.serial_number} · {item.condition}</div>
            {(item as any).transfer_count > 0 && (
              <div style={{ ...surface({ pad: '6px 10px' }), display: 'flex', alignItems: 'center', gap: S[1], marginTop: S[1], ...t('meta'), color: 'var(--text-muted)' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Will list as Used — condition was set at mint
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
        <div className="visby-page" style={{ paddingTop: S[3], paddingBottom: S[3], display: 'flex', alignItems: 'center', gap: S[3] }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: S[1], display: 'flex' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{ flex: 1, ...t('heading'), color: 'var(--text-strong)' }}>Sell</div>
        </div>
      </div>

      <div className="visby-page" style={{ paddingTop: S[5], paddingBottom: 100 }}>

        {/* Toggle */}
        <div style={tabSlider().wrap}>
          {([
            { id: 'mint'   as Mode, label: 'Mint New' },
            { id: 'resell' as Mode, label: 'Relist'   },
          ]).map(tab => (
            <button key={tab.id} onClick={() => setMode(tab.id)}
              style={{ ...tabSlider().item, ...(mode === tab.id ? tabSlider().itemActive : null) }}>
              {tab.label}
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
