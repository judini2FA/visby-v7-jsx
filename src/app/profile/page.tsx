'use client';

import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { createStepUpProof, stepUpHeader, STEP_UP_ON } from '@/lib/step-up-client';
import { tallyTransferAction } from '@/lib/step-up-shared';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { useVisbWallet } from '@/lib/wallet';
import { ThemeToggle, useTheme } from '@/lib/theme';
import { t, S, price, card, surface, sheet, btn, badge, avatar, input, sectionLabel, tabSlider, T } from '@/lib/ui';
import { useCurrency } from '@/lib/currency';
import { TallyCard } from '@/components/tally-card';
import { ListingCard } from '@/components/listing-card';
import { HeaderMenu } from '@/components/layout/header-menu';
import { EmptyState } from '@/components/empty-state';

const C = {
  navy: 'transparent', teal: '#22C6B7', cyan: '#25CDB8',
  blue: '#2A8AED', mag: '#BC2DE6', muted: 'var(--text-muted)',
  green: 'var(--ok)', red: 'var(--danger)', border: 'var(--glass-border)',
};
const GD = `linear-gradient(135deg,${C.cyan},${C.blue} 50%,${C.mag})`;

type Tab = 'public' | 'items';

function shortAddr(a: string) {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-6)}`;
}

// ─────────────────────────────────────────────────────────────
// MY ITEMS TAB
// ─────────────────────────────────────────────────────────────
type ConnWallet = { id: string; chain: 'solana' | 'ethereum' | 'bitcoin'; address: string; label?: string };

function MyItemsTab({ wallet }: { wallet: string }) {
  const { getAccessToken } = usePrivy();
  const { wallets: solSigners } = useSolanaWallets();
  const [connected, setConnected] = useState<ConnWallet[]>([]);
  const [transferItem, setTransferItem] = useState<any | null>(null);
  const [destAddr, setDestAddr] = useState('');
  const [xfer, setXfer] = useState<'idle' | 'sending' | 'done'>('idle');
  const [xferErr, setXferErr] = useState('');

  useEffect(() => {
    try { setConnected(JSON.parse(localStorage.getItem('visby-connected-wallets') || '[]')); } catch {}
  }, []);

  // Prefer the server-synced wallet list (cross-device); fall back to the local cache. These are private
  // fields, so read them from the AUTHED route (the public getProfile no longer exposes them).
  const [serverWallets, setServerWallets] = useState<ConnWallet[] | null>(null);
  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch(`/api/profile/private?wallet=${encodeURIComponent(wallet)}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const d = await res.json();
        if (!cancelled && Array.isArray(d.connected_wallets)) setServerWallets(d.connected_wallets);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [wallet, getAccessToken]);
  const effectiveConnected: ConnWallet[] = serverWallets && serverWallets.length ? serverWallets : connected;
  const solWallets = effectiveConnected.filter(w => w.chain === 'solana' && w.address);
  const allWallets = [...new Set([wallet, ...solWallets.map(w => w.address)].filter(Boolean))];

  const { data: ownedItems = [], isLoading, refetch } = trpc.listings.getByOwnerBatch.useQuery(
    { wallets: allWallets },
    { enabled: allWallets.length > 0 },
  );

  // Destinations = the user's registered Solana wallets other than the one that holds the Tally.
  const destsFor = (item: any) =>
    [{ address: wallet, label: 'Visby wallet' }, ...solWallets.map(w => ({ address: w.address, label: w.label || 'Solana wallet' }))]
      .filter(d => d.address && d.address !== item.current_owner_wallet);

  async function doTransfer() {
    if (!transferItem || !destAddr) return;
    setXfer('sending'); setXferErr('');
    try {
      const token = await getAccessToken();
      // Step-up (when enforcement is on): sign an action-bound challenge — which prompts MFA — before
      // the Tally leaves this wallet. Dormant until NEXT_PUBLIC_STEP_UP_ENFORCED=1.
      let stepUpHeaders: Record<string, string> = {};
      if (STEP_UP_ON) {
        const signer = solSigners.find((w: any) => w.address === transferItem.current_owner_wallet);
        if (!signer?.signMessage) throw new Error('This wallet can’t authorize the transfer on this device.');
        const proof = await createStepUpProof({ action: tallyTransferAction(transferItem.id, destAddr), signMessage: (m) => signer.signMessage(m) });
        stepUpHeaders = stepUpHeader(proof);
      }
      const res = await fetch('/api/tally/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...stepUpHeaders },
        body: JSON.stringify({ item_id: transferItem.id, from_wallet: transferItem.current_owner_wallet, to_wallet: destAddr }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Transfer failed');
      setXfer('done');
      await refetch();
      setTimeout(() => { setTransferItem(null); setDestAddr(''); setXfer('idle'); }, 1100);
    } catch (e: any) { setXfer('idle'); setXferErr(e?.message ?? 'Transfer failed'); }
  }

  if (isLoading) return (
    <div style={{ paddingTop: S[4], display: 'flex', flexDirection: 'column', gap: S[2] }}>
      {[1,2,3].map(i => <div key={i} style={{ height: 72, background: 'var(--surface-bg)', borderRadius: 'var(--r-sm)', animation: 'pulse 2s infinite' }} />)}
    </div>
  );

  if (ownedItems.length === 0) return (
    <div style={{ paddingTop: S[6] }}>
      <EmptyState
        icon={<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>}
        title="No items yet"
        message="Mint your first item to see it here."
        action={{ label: 'Sell an item', href: '/dashboard/seller' }}
      />
    </div>
  );

  return (
    <>
      <div className="visby-grid" style={{ paddingTop: S[4] }}>
        {ownedItems.map((item: any) => {
          const canTransfer = item.current_owner_wallet === wallet;   // only the Privy-authed wallet can authorize a move
          return (
            <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
              <TallyCard
                href={`/item/${item.id}`}
                name={item.name}
                serial={item.serial_number}
                owners={item.owners?.length ? item.owners : [{ wallet: item.current_owner_wallet }]}
              />
              {canTransfer && (
                <button onClick={() => { setTransferItem(item); setDestAddr(''); setXfer('idle'); setXferErr(''); }}
                  style={{ ...t('meta'), fontWeight: 700, color: 'var(--text-muted)', background: 'none', border: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 4px', alignSelf: 'flex-start' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                  Transfer
                </button>
              )}
            </div>
          );
        })}
      </div>

      {transferItem && (
        <>
          <div onClick={() => xfer !== 'sending' && setTransferItem(null)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--modal-scrim)' }} />
          <div style={{ ...sheet({ radius: '30px 30px 0 0' }), position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 600, zIndex: 201, padding: `0 ${S[5]}px ${S[7]}px`, maxHeight: '82vh', overflowY: 'auto' }}>
            <div style={{ width: 36, height: 4, background: 'var(--divider)', borderRadius: 2, margin: `${S[4]}px auto ${S[5]}px` }} />
            <div style={{ ...t('title'), color: 'var(--text-strong)', marginBottom: S[1] }}>Transfer Tally</div>
            <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[4] }}>Send “{transferItem.name}” to one of your wallets.</div>

            {destsFor(transferItem).length === 0 ? (
              <div style={{ ...surface({ pad: S[4] }), ...t('meta'), color: 'var(--text-muted)' }}>
                Add another Solana wallet under Wallet → Details → Tally Destination to transfer to.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                {destsFor(transferItem).map(d => (
                  <button key={d.address} onClick={() => setDestAddr(d.address)}
                    style={{ ...surface({ pad: '12px 14px' }), display: 'flex', alignItems: 'center', gap: S[3], textAlign: 'left', cursor: 'pointer', border: destAddr === d.address ? '1.5px solid var(--text-strong)' : undefined }}>
                    <span style={{ ...surface({ radius: 8 }), width: 30, height: 30, color: 'var(--text-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, flexShrink: 0 }}>SOL</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ ...t('body'), fontWeight: 700, color: 'var(--text-strong)' }}>{d.label}</div>
                      <div style={{ ...t('meta'), color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.address.slice(0, 6)}…{d.address.slice(-5)}</div>
                    </div>
                    {destAddr === d.address && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-strong)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </button>
                ))}
              </div>
            )}

            {xferErr && <div style={{ ...t('meta'), color: 'var(--danger)', marginTop: S[3] }}>{xferErr}</div>}

            <button onClick={doTransfer} disabled={!destAddr || xfer !== 'idle'}
              style={{ ...btn('primary', { full: true, pill: false }), marginTop: S[5], opacity: (!destAddr || xfer !== 'idle') ? 0.6 : 1 }}>
              {xfer === 'sending' ? 'Transferring…' : xfer === 'done' ? 'Transferred' : 'Confirm transfer'}
            </button>
            <div style={{ ...t('micro'), color: 'var(--text-muted)', textAlign: 'center', marginTop: S[3] }}>On-chain Solana transfer · devnet</div>
          </div>
        </>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// PUBLIC VIEW TAB
// ─────────────────────────────────────────────────────────────
function PublicViewTab({ wallet, displayName, bio, avatarUrl }: { wallet: string; displayName: string; bio?: string | null; avatarUrl?: string | null }) {
  const { data: ownedItems = [] } = trpc.listings.getByOwner.useQuery({ wallet }, { enabled: !!wallet });
  const listedItems = ownedItems.filter((i: any) => i.is_listed);
  const { format: fmtPrice } = useCurrency();

  return (
    <div style={{ paddingTop: S[4] }}>
      {/* Avatar card */}
      <div style={{ ...surface({ pad: S[4] }), display: 'flex', alignItems: 'center', gap: S[3], marginBottom: S[5] }}>
        <div style={{ ...avatar('md'), width: 56, height: 56, fontSize: 20, background: avatarUrl ? 'var(--surface-bg)' : (wallet ? `linear-gradient(135deg, hsl(${(wallet.charCodeAt(0)*7)%360},70%,55%), hsl(${(wallet.charCodeAt(4)*13)%360},70%,45%))` : GD) }}>
          {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (displayName[0] ?? '?').toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[1] }}>{displayName}</div>
          {bio && <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[1] }}>{bio}</div>}
          <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>{shortAddr(wallet)}</div>
        </div>
      </div>

      {/* Active listings preview */}
      {listedItems.length > 0 && (
        <>
          <div style={{ ...sectionLabel(), marginBottom: S[3] }}>
            {listedItems.length} active listing{listedItems.length !== 1 ? 's' : ''}
          </div>
          <div className="visby-grid">
            {listedItems.map((item: any) => (
              <ListingCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      {listedItems.length === 0 && (
        <div style={{ ...t('body'), textAlign: 'center', padding: `${S[6]}px 0`, color: 'var(--text-muted)' }}>
          No active listings
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// EDIT PROFILE FORM
// ─────────────────────────────────────────────────────────────
function EditProfileForm({ wallet, email, onClose }: { wallet: string; email?: string; onClose: () => void }) {
  const { getAccessToken } = usePrivy();
  const { data: existing } = trpc.profiles.getProfile.useQuery({ wallet }, { enabled: !!wallet });
  const utils = trpc.useUtils();
  const upsert = trpc.profiles.upsertProfile.useMutation({ onSuccess: () => utils.profiles.getProfile.invalidate() });
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio,  setBio]  = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const [saved, setSaved] = useState(false);

  // Hydrate the form from the loaded profile EXACTLY ONCE. Re-running on every `existing` change (e.g. the
  // refetch after save) would clobber the user's in-progress edits — that race is part of the data-wipe bug.
  const hydrated = useRef(false);
  useEffect(() => {
    if (existing && !hydrated.current) {
      hydrated.current = true;
      setName(existing.display_name ?? '');
      setUsername((existing as any).username ?? '');
      setBio(existing.bio ?? '');
      setAvatarUrl(existing.avatar_url ?? '');
    }
  }, [existing]);

  const displayName = name || existing?.display_name || '';

  // Debounced live availability check — only queries once the candidate differs from what's saved
  // and looks like a legal username, so we're not pinging the server on every keystroke or for the
  // user's own already-saved handle.
  const [debouncedUsername, setDebouncedUsername] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedUsername(username.trim().toLowerCase()), 400);
    return () => clearTimeout(id);
  }, [username]);
  const existingUsername = ((existing as any)?.username ?? '') as string;
  const usernameFormatOk = /^[a-z0-9_]{3,20}$/.test(debouncedUsername);
  const usernameUnchanged = debouncedUsername === existingUsername.toLowerCase();
  const checkUsername = trpc.profiles.usernameAvailable.useQuery(
    { username: debouncedUsername, wallet },
    { enabled: debouncedUsername.length > 0 && usernameFormatOk && !usernameUnchanged, retry: false },
  );

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setUploadErr('Image must be under 8MB.'); return; }
    setUploading(true); setUploadErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const token = await getAccessToken();
      const res = await fetch('/api/upload-image', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
      const json = await res.json();
      if (res.ok && json.url) setAvatarUrl(json.url);
      else setUploadErr(json.error || 'Upload failed — try again.');
    } catch {
      setUploadErr('Upload failed — check your connection.');
    } finally {
      setUploading(false);
    }
  }

  const usernameInput = username.trim().toLowerCase();
  const usernameTouched = usernameInput !== existingUsername.toLowerCase();
  // Block save while the field holds an illegal or known-taken value. A pending/unchecked debounce
  // is allowed through — upsertProfile re-validates format server-side and 23505 catches a last-second
  // collision, so this is a UX guard, not the source of truth.
  const usernameBlocksSave = usernameTouched && usernameInput.length > 0 && (!usernameFormatOk || (checkUsername.data && !checkUsername.data.available));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (usernameBlocksSave) return;
    // avatar_url guarded like the others: an empty value means "not loaded yet / no change" — never send ''
    // (which upsertProfile would persist as null and wipe the avatar). Uploading a new photo sets a real URL.
    try {
      await upsert.mutateAsync({
        wallet,
        display_name: name.trim() || undefined,
        username: usernameTouched ? (usernameInput || undefined) : undefined,
        bio: bio.trim() || undefined,
        avatar_url: avatarUrl || undefined,
      });
      setSaved(true);
      setTimeout(() => { setSaved(false); onClose(); }, 1200);
    } catch {
      // upsert.isError below renders the message; CONFLICT (username taken) surfaces the same way.
    }
  }

  return (
    <div style={{ padding: `0 ${S[4]}px ${S[7]}px`, maxWidth: 600, margin: '0 auto' }}>

      {/* Preview + profile-picture upload */}
      <div style={{ ...card({ pad: S[4] }), display: 'flex', alignItems: 'center', gap: S[3], marginBottom: S[5] }}>
        <label title="Upload a profile picture"
          style={{ ...avatar('lg'), position: 'relative', cursor: uploading ? 'wait' : 'pointer',
                   background: avatarUrl ? 'var(--surface-bg)' : (wallet ? `linear-gradient(135deg, hsl(${(wallet.charCodeAt(0)*7)%360},70%,55%), hsl(${(wallet.charCodeAt(4)*13)%360},70%,45%))` : GD) }}>
          {avatarUrl
            ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 22 }}>{wallet.slice(0,2).toUpperCase()}</span>}
          <span aria-hidden style={{ position: 'absolute', right: -1, bottom: -1, width: 20, height: 20, borderRadius: '50%', background: 'var(--text-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px var(--glass-bg)' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--bg-0)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          </span>
          <input type="file" accept="image/*" onChange={handleFile} disabled={uploading}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'inherit' }} />
        </label>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...t('heading'), color: 'var(--text-strong)', marginBottom: S[1] }}>
            {displayName || wallet.slice(0,6) + '…' + wallet.slice(-4)}
          </div>
          {uploading
            ? <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Uploading photo…</div>
            : avatarUrl
              ? <button type="button" onClick={() => setAvatarUrl('')} style={{ ...t('meta'), color: C.red, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>Remove photo</button>
              : <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Tap the photo to upload one</div>}
          <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>{email ?? shortAddr(wallet)}</div>
        </div>
      </div>
      {uploadErr && (
        <div style={{ ...surface({ pad: '10px 14px' }), ...t('meta'), color: C.red, borderColor: 'var(--danger-soft)', marginBottom: S[4] }}>{uploadErr}</div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: S[4] }}>
        <div>
          <div style={{ ...sectionLabel(), marginBottom: S[2] }}>Display Name</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={existing?.display_name ?? 'e.g. sneaker.vault'} maxLength={40} style={input()} />
          <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: S[1] }}>Shown instead of your wallet address</div>
        </div>
        <div>
          <div style={{ ...sectionLabel(), marginBottom: S[2] }}>Username</div>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 15, pointerEvents: 'none' }}>@</span>
            <input
              value={username}
              onChange={e => setUsername(e.target.value.replace(/\s/g, '').slice(0, 20))}
              placeholder="e.g. sneaker_vault"
              maxLength={20}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              style={{ ...input(), paddingLeft: 28 }}
            />
          </div>
          <div style={{ ...t('meta'), marginTop: S[1], color: usernameBlocksSave ? C.red : (usernameTouched && checkUsername.data?.available ? C.green : 'var(--text-muted)') }}>
            {usernameInput.length === 0
              ? 'Lets people send you money by @handle'
              : !usernameFormatOk
                ? '3-20 characters: letters, numbers, underscore'
                : usernameUnchanged
                  ? 'This is your current username'
                  : checkUsername.isFetching
                    ? 'Checking availability…'
                    : checkUsername.data
                      ? (checkUsername.data.available ? 'Available' : (checkUsername.data.reason ?? 'That username is taken.'))
                      : 'Lets people send you money by @handle'}
          </div>
        </div>
        <div>
          <div style={{ ...sectionLabel(), marginBottom: S[2] }}>Bio</div>
          <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder={existing?.bio ?? 'What do you sell?'} maxLength={200} rows={3}
            style={{ ...input(), resize: 'vertical', lineHeight: 1.6 }} />
          <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: S[1], textAlign: 'right' }}>{bio.length}/200</div>
        </div>
        <div style={surface({ pad: '12px 16px' })}>
          <div style={{ ...sectionLabel(), marginBottom: S[1] }}>Wallet (read-only)</div>
          <div style={{ ...t('meta'), color: 'var(--text-muted)', wordBreak: 'break-all' }}>{wallet}</div>
        </div>
        {email && (
          <div style={surface({ pad: '12px 16px' })}>
            <div style={{ ...sectionLabel(), marginBottom: S[1] }}>Email (read-only)</div>
            <div style={{ ...t('body'), color: 'var(--text-muted)' }}>{email}</div>
          </div>
        )}
        {upsert.isError && (
          <div style={{ ...surface({ pad: '10px 14px' }), ...t('meta'), color: C.red, borderColor: 'var(--danger-soft)' }}>
            {upsert.error?.data?.code === 'CONFLICT' ? upsert.error.message : 'Could not save — check your connection and try again.'}
          </div>
        )}
        <div style={{ display: 'flex', gap: S[2] }}>
          <button type="button" onClick={onClose}
            style={{ ...btn('secondary'), flex: 1 }}>
            Cancel
          </button>
          <button type="submit" disabled={upsert.isPending || usernameBlocksSave}
            style={{ ...btn(saved ? 'secondary' : 'primary'), flex: 2, opacity: (upsert.isPending || usernameBlocksSave) ? 0.6 : 1, cursor: (upsert.isPending || usernameBlocksSave) ? 'not-allowed' : 'pointer', color: saved ? C.green : undefined }}>
            {saved ? 'Saved!' : upsert.isPending ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { ready, authenticated, user, logout, exportWallet, getAccessToken } = usePrivy();
  const { address: walletAddress, ready: walletReady } = useVisbWallet();
  const router = useRouter();
  const [tab, setTab]         = useState<Tab>('public');
  useEffect(() => {
    const tp = new URLSearchParams(window.location.search).get('tab');
    if (tp === 'items' || tp === 'public') setTab(tp as Tab);
  }, []);
  const [editOpen, setEditOpen] = useState(false);

  const { data: profile }        = trpc.profiles.getProfile.useQuery({ wallet: walletAddress }, { enabled: !!walletAddress });
  const { data: ownedItems = [] } = trpc.listings.getByOwner.useQuery({ wallet: walletAddress }, { enabled: !!walletAddress });
  const { data: soldItems  = [] } = trpc.listings.getSoldByWallet.useQuery({ wallet: walletAddress }, { enabled: !!walletAddress });
  const { data: counts }          = trpc.follows.getCounts.useQuery({ wallet: walletAddress }, { enabled: !!walletAddress });

  const displayName = profile?.display_name ?? user?.email?.address ?? shortAddr(walletAddress);
  const initial     = (displayName[0] ?? '?').toUpperCase();
  const listedCount = ownedItems.filter((i: any) => i.is_listed).length;
  const email       = user?.email?.address;

  const [kycApproved, setKycApproved] = useState(false);
  useEffect(() => {
    if (!walletAddress) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch('/api/kyc/status', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const j = await res.json();
        if (!cancelled) setKycApproved(j.kyc_status === 'approved');
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [walletAddress, getAccessToken]);

  useEffect(() => {
    if (ready && !authenticated) router.push('/login');
  }, [ready, authenticated, router]);

  if (!ready || !authenticated || !walletReady) {
    return (
      <div style={{ background: C.navy, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: `3px solid var(--text-muted)`, borderTopColor: 'transparent', animation: 'spin .8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'public', label: 'Public Listings' },
    { id: 'items',  label: 'My Tallys'        },
  ];

  return (
    <div style={{ background: C.navy, minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>

      {/* ── Header ─────────────────────────────────────── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)' }}>
        <div className="visby-page" style={{ paddingTop: S[3], paddingBottom: S[3], display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ ...t('title'), color: 'var(--text-strong)' }}>Profile</div>
          <HeaderMenu />
        </div>
      </div>

      {/* ── Edit form (full-area overlay when open) ─────── */}
      {editOpen && (
        <EditProfileForm wallet={walletAddress} email={email} onClose={() => setEditOpen(false)} />
      )}

      {/* ── Normal profile view ─────────────────────────── */}
      {!editOpen && (
        <>
          <div className="visby-page" style={{ paddingTop: S[5], paddingBottom: 0 }}>

            {/* Avatar + info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: S[4], marginBottom: S[5] }}>
              <div style={{ ...avatar('lg'), fontSize: 24, background: profile?.avatar_url ? 'var(--surface-bg)' : (walletAddress ? `linear-gradient(135deg, hsl(${(walletAddress.charCodeAt(0)*7)%360},70%,55%), hsl(${(walletAddress.charCodeAt(4)*13)%360},70%,45%))` : GD) }}>
                {profile?.avatar_url ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initial}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginBottom: S[1] }}>
                  <div style={{ ...t('title'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{displayName}</div>
                  {kycApproved && (
                    <span style={{ ...badge('success'), gap: 4, flexShrink: 0 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#00C48C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
                      ID Verified
                    </span>
                  )}
                  <button onClick={() => setEditOpen(o => !o)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: S[1], marginLeft: 'auto' }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={editOpen ? 'var(--text-strong)' : 'var(--text-muted)'} strokeWidth="2" strokeLinecap="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                </div>
                {profile?.bio && (
                  <div style={{ ...t('meta'), color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.bio}</div>
                )}
              </div>
            </div>

            {/* Stats — all numbers floating in one row, no boxes */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: S[2], marginBottom: S[5] }}>
              {([
                { label: 'Followers', value: counts?.followers ?? 0, href: `/connections/${walletAddress}?tab=followers` },
                { label: 'Following', value: counts?.following ?? 0, href: `/connections/${walletAddress}?tab=following` },
                { label: 'Owned',     value: ownedItems.length },
                { label: 'Listed',    value: listedCount },
                { label: 'Sold',      value: soldItems.length },
              ] as { label: string; value: number; href?: string }[]).map(s => {
                const inner = (
                  <>
                    <div style={{ ...t('title'), color: 'var(--text-strong)' }}>{s.value}</div>
                    <div style={{ ...t('micro'), fontSize: 9.5, letterSpacing: '0.01em', color: 'var(--text-muted)', marginTop: S[1], whiteSpace: 'nowrap' }}>{s.label}</div>
                  </>
                );
                return s.href
                  ? <Link key={s.label} href={s.href} style={{ flex: 1, textAlign: 'center', textDecoration: 'none', minWidth: 0 }}>{inner}</Link>
                  : <div key={s.label} style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>{inner}</div>;
              })}
            </div>

            {/* Tab slider */}
            <div style={tabSlider().wrap}>
              {TABS.map(tt => (
                <button key={tt.id} onClick={() => setTab(tt.id)}
                  style={{ ...tabSlider().item, ...(tab === tt.id ? tabSlider().itemActive : null) }}>
                  {tt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="visby-page" style={{ paddingBottom: 100 }}>
            <div style={{ marginTop: S[2] }}>
              {tab === 'items'  && <MyItemsTab wallet={walletAddress} />}
              {tab === 'public' && <PublicViewTab wallet={walletAddress} displayName={displayName} bio={profile?.bio} avatarUrl={profile?.avatar_url} />}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </div>
  );
}
