'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useVisbWallet } from '@/lib/wallet';
import CheckoutModal from '@/components/checkout-modal';
import { OffersPanel } from '@/components/offers-panel';
import { S, t, price, card, surface, btn, badge, avatar, sectionLabel, input, sheet, T } from '@/lib/ui';
import { CutoutEditor } from '@/components/cutout-editor';
import { explorerAddress } from '@/lib/explorer';
import { trpc } from '@/lib/trpc/client';
import { ReputationBadge } from '@/components/reviews';
import { isCutout } from '@/components/listing-card';
import { LikeButton } from '@/components/like-button';
import { feeBreakdown } from '@/lib/fees';
import { AuthBadge } from '@/components/auth-badge';
import { BrandBadge } from '@/components/brand-badge';
import { AvatarCircle } from '@/components/owner-stack';
import { isAdminWallet } from '@/lib/admin';
import { useCurrency, formatCurrency, CURRENCIES, type Currency } from '@/lib/currency';
import { HeaderMenu } from '@/components/layout/header-menu';
import { TallyExplainerCard } from '@/components/tally-explainer';
import { friendlyError } from '@/lib/friendly-error';
import { AddToCartButton } from '@/components/add-to-cart-button';

const C = {
  navy: 'transparent', teal: '#22C6B7', cyan: '#25CDB8',
  blue: '#2A8AED', mag: '#BC2DE6', muted: 'var(--text-muted)',
  green: 'var(--ok)', red: 'var(--danger)', border: 'var(--glass-border)',
};
const GH = `linear-gradient(90deg,${C.cyan},${C.blue} 50%,${C.mag})`;

function shortAddr(a: string) {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-6)}`;
}
function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60)   return 'just now';
  if (d < 3600) return `${Math.floor(d/60)}m ago`;
  if (d < 86400) return `${Math.floor(d/3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
// L4c: a seller's saved preferred_currency is an arbitrary string from the profiles table —
// this narrows it to a known Currency before it's ever passed to formatCurrency().
function isValidCurrency(c: string): c is Currency {
  return (CURRENCIES as readonly string[]).includes(c);
}

interface OwnershipRecord {
  id: string; owner_wallet: string; from_wallet?: string;
  tx_hash: string; event_type: 'mint' | 'transfer'; price_usdc?: number; created_at: string;
}
interface Item {
  id: string; name: string; serial_number: string; condition: string;
  category: string; description?: string; image_url?: string;
  extra_image_urls?: string[];
  nft_mint_address: string; current_owner_wallet: string;
  is_listed: boolean; price_usdc?: number; created_at: string;
  weight_oz?: number; ship_service_pref?: string;
  auth_status?: string;
  ownership_history?: OwnershipRecord[];
  profiles?: Record<string, { avatar_url: string | null; display_name: string | null; preferred_currency?: string | null }>;
}

const MAX_EXTRA_PHOTOS = 8;

// Owner-only edit sheet (12b L2). Title is permanently locked (tied to the serial) and the original
// cover photo is never replaced or removed — this only APPENDS new photos and can update the
// description. Reuses the same upload path + cutout flow as mint/relist.
function EditListingSheet({
  item,
  walletAddress,
  getAccessToken,
  onClose,
  onSaved,
}: {
  item: Item;
  walletAddress: string;
  getAccessToken: () => Promise<string | null>;
  onClose: () => void;
  onSaved: (patch: { description?: string; extra_image_urls?: string[] }) => void;
}) {
  const [description, setDescription] = useState(item.description ?? '');
  const [newPhotos, setNewPhotos] = useState<{ id: string; file: File; previewUrl: string }[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const existingCount = 1 + (item.extra_image_urls?.length ?? 0); // cover + already-added extras
  const remainingSlots = Math.max(0, MAX_EXTRA_PHOTOS - existingCount - newPhotos.length);

  function pickPhotos(files: FileList | null) {
    if (!files) return;
    const adds = Array.from(files).slice(0, remainingSlots).map(file => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setNewPhotos(prev => [...prev, ...adds]);
  }

  function applyCutout(id: string, file: File) {
    setNewPhotos(prev => prev.map(p => {
      if (p.id !== id) return p;
      URL.revokeObjectURL(p.previewUrl);
      return { ...p, file, previewUrl: URL.createObjectURL(file) };
    }));
    setEditId(null);
  }

  function removePhoto(id: string) {
    setNewPhotos(prev => {
      const found = prev.find(p => p.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter(p => p.id !== id);
    });
  }

  async function save() {
    if (busy) return;
    setErr('');
    setBusy(true);
    try {
      const token = await getAccessToken();
      const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const uploadedUrls: string[] = [];
      for (const p of newPhotos) {
        const fd = new FormData();
        fd.append('file', p.file);
        const res = await fetch('/api/upload-image', { method: 'POST', headers: authHeaders, body: fd });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error((b as any).error ?? 'Photo upload failed');
        }
        const { url } = await res.json();
        uploadedUrls.push(url);
      }

      const trimmedDesc = description.trim();
      const descChanged = trimmedDesc !== (item.description ?? '').trim();

      if (!descChanged && uploadedUrls.length === 0) {
        onClose();
        return;
      }

      const res = await fetch('/api/items/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          item_id: item.id,
          wallet: walletAddress,
          ...(descChanged ? { description: trimmedDesc } : {}),
          ...(uploadedUrls.length ? { add_image_urls: uploadedUrls } : {}),
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as any).error ?? 'Failed to save changes');
      }

      onSaved({
        ...(descChanged ? { description: trimmedDesc } : {}),
        ...(uploadedUrls.length ? { extra_image_urls: [...(item.extra_image_urls ?? []), ...uploadedUrls] } : {}),
      });
    } catch (e: any) {
      setErr(friendlyError(e, 'Failed to save changes — try again.'));
    } finally {
      setBusy(false);
    }
  }

  const editTarget = newPhotos.find(p => p.id === editId);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'var(--img-scrim)' }}
    >
      <div style={{ ...sheet(), width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: S[5], display: 'flex', flexDirection: 'column', gap: S[4], borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ ...t('heading'), color: T.textStrong }}>Edit listing</span>
          <button onClick={onClose} style={{ ...btn('text'), padding: S[1] }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Title is locked — shown read-only for clarity, no input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
          <label style={{ ...t('meta'), color: T.textMuted, display: 'flex', alignItems: 'center', gap: S[1] }}>
            Title
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </label>
          <div style={{ ...input(), display: 'flex', alignItems: 'center', color: 'var(--text-muted)', background: 'var(--surface-bg)', cursor: 'not-allowed' }}>
            {item.name}
          </div>
          <span style={{ ...t('micro'), color: T.textMuted }}>Locked — tied to the item&rsquo;s serial number</span>
        </div>

        {/* Description */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
          <label style={{ ...t('meta'), color: T.textMuted }}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 4000))}
            rows={5}
            placeholder="Describe the item..."
            style={{ ...input(), resize: 'vertical', minHeight: 100, fontFamily: 'inherit' }}
          />
          <span style={{ ...t('micro'), color: T.textMuted, textAlign: 'right' }}>{description.length}/4000</span>
        </div>

        {/* Photos — original cover is locked; this only adds new ones */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          <label style={{ ...t('meta'), color: T.textMuted }}>Add photos</label>
          <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
            {item.image_url && (
              <div style={{ position: 'relative', width: 72, height: 72, borderRadius: 'var(--r-sm)', overflow: 'hidden', background: 'var(--surface-bg)' }}>
                <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <span style={{ position: 'absolute', bottom: 2, left: 2, ...t('micro'), fontSize: 9, color: '#fff', background: 'var(--img-scrim)', borderRadius: 4, padding: '1px 4px' }}>Original</span>
              </div>
            )}
            {(item.extra_image_urls ?? []).map((url) => (
              <div key={url} style={{ width: 72, height: 72, borderRadius: 'var(--r-sm)', overflow: 'hidden', background: 'var(--surface-bg)' }}>
                <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
            {newPhotos.map((p) => (
              <div key={p.id} style={{ position: 'relative', width: 72, height: 72, borderRadius: 'var(--r-sm)', overflow: 'hidden', background: 'var(--surface-bg)' }}>
                <img src={p.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button onClick={() => removePhoto(p.id)} aria-label="Remove"
                  style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'var(--img-scrim)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <button onClick={() => setEditId(p.id)}
                  style={{ position: 'absolute', bottom: 2, right: 2, ...t('micro'), fontSize: 9, color: '#fff', background: 'var(--img-scrim)', border: 'none', borderRadius: 4, padding: '1px 4px', cursor: 'pointer' }}>
                  Cutout
                </button>
              </div>
            ))}
            {remainingSlots > 0 && (
              <label style={{ width: 72, height: 72, borderRadius: 'var(--r-sm)', border: '2px dashed var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <input type="file" accept="image/*" multiple hidden onChange={(e) => { pickPhotos(e.target.files); e.currentTarget.value = ''; }} />
              </label>
            )}
          </div>
          <span style={{ ...t('micro'), color: T.textMuted }}>The original photo can&rsquo;t be removed or replaced — new photos are added alongside it.</span>
        </div>

        {err && <span style={{ ...t('meta'), color: 'var(--danger)' }}>{err}</span>}

        <button onClick={save} disabled={busy} style={{ ...btn('primary', { full: true }), opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {editTarget && (
        <CutoutEditor
          file={editTarget.file}
          getAccessToken={getAccessToken}
          onDone={(f) => applyCutout(editTarget.id, f)}
          onCancel={() => setEditId(null)}
        />
      )}
    </div>
  );
}

const REPORT_REASONS = ['Counterfeit', 'Stolen', 'Prohibited item', 'Other'] as const;

// S2: the report flow's own 3-step sheet. Payload + auth header mirror ReportButton's
// POST /api/reports (src/components/report-button.tsx) — built inline here rather than
// reusing that component so the trigger can live in the "•••" menu next to the like button.
function ListingReportFlow({
  itemId,
  reporterWallet,
  getAccessToken,
  onClose,
}: {
  itemId: string;
  reporterWallet: string;
  getAccessToken: () => Promise<string | null>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          reporter_wallet: reporterWallet,
          target_type: 'listing',
          target_id: itemId,
          reason,
          details: details.slice(0, 2000) || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? 'Failed to submit report');
      }
      setDone(true);
    } catch (e: any) {
      setErr(friendlyError(e, 'Could not submit report — try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'var(--img-scrim)' }}
    >
      <div style={{ ...sheet(), width: '100%', maxWidth: 480, padding: S[5], display: 'flex', flexDirection: 'column', gap: S[4], borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ ...t('heading'), color: T.textStrong }}>Report listing</span>
          <button onClick={onClose} style={{ ...btn('text'), padding: S[1] }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {done ? (
          <div style={{ ...t('body'), color: T.text, padding: `${S[4]}px 0`, textAlign: 'center' }}>
            Reported — our team will review.
          </div>
        ) : step === 1 ? (
          <>
            <div style={{ ...t('meta'), color: T.textMuted }}>Step 1 of 3 · What&rsquo;s wrong with this listing?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
              {REPORT_REASONS.map((r) => (
                <label key={r} style={{ display: 'flex', alignItems: 'center', gap: S[3], ...t('body'), color: T.text, cursor: 'pointer', padding: `${S[2]}px 0` }}>
                  <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
                  {r}
                </label>
              ))}
            </div>
            <button onClick={() => setStep(2)} style={btn('primary', { full: true })}>Next</button>
          </>
        ) : step === 2 ? (
          <>
            <div style={{ ...t('meta'), color: T.textMuted }}>Step 2 of 3 · Add detail (optional)</div>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value.slice(0, 2000))}
              rows={4}
              placeholder="Describe the issue..."
              style={{ ...input(), resize: 'vertical', minHeight: 80, fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: S[2] }}>
              <button onClick={() => setStep(1)} style={{ ...btn('secondary', { full: true }), flex: 1 }}>Back</button>
              <button onClick={() => setStep(3)} style={{ ...btn('primary', { full: true }), flex: 1 }}>Next</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ ...t('meta'), color: T.textMuted }}>Step 3 of 3 · Review &amp; submit</div>
            <div style={{ ...surface({ pad: S[4] }), display: 'flex', flexDirection: 'column', gap: S[1] }}>
              <span style={{ ...t('meta'), color: T.textMuted }}>Reason</span>
              <span style={{ ...t('body'), color: T.text }}>{reason}</span>
              {details && (
                <>
                  <span style={{ ...t('meta'), color: T.textMuted, marginTop: S[2] }}>Detail</span>
                  <span style={{ ...t('body'), color: T.text }}>{details}</span>
                </>
              )}
            </div>
            {err && <span style={{ ...t('meta'), color: 'var(--danger)' }}>{err}</span>}
            <div style={{ display: 'flex', gap: S[2] }}>
              <button onClick={() => setStep(2)} style={{ ...btn('secondary', { full: true }), flex: 1 }}>Back</button>
              <button onClick={submit} disabled={busy} style={{ ...btn('primary', { full: true }), flex: 1, opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Submitting…' : 'Submit Report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// S2: the obvious report/flag entry point — a "•••" button next to the like button that opens a
// tiny dropdown. Signed-out visitors get a sign-in prompt instead of the reason picker.
function ListingMoreMenu({
  itemId,
  walletAddress,
  getAccessToken,
}: {
  itemId: string;
  walletAddress: string | null;
  getAccessToken: () => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [showReport, setShowReport] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="More options"
        title="More options"
        style={{ ...btn('text'), padding: S[1], minWidth: 0 }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />
          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: S[1], zIndex: 201, ...surface({ pad: 0, radius: 'var(--r-sm)' }), minWidth: 170, overflow: 'hidden' }}>
            {walletAddress ? (
              <button
                onClick={() => { setOpen(false); setShowReport(true); }}
                style={{ display: 'flex', alignItems: 'center', gap: S[2], width: '100%', padding: `${S[3]}px ${S[4]}px`, background: 'none', border: 'none', cursor: 'pointer', ...t('body'), color: 'var(--text)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                Report
              </button>
            ) : (
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                style={{ display: 'flex', alignItems: 'center', gap: S[2], width: '100%', padding: `${S[3]}px ${S[4]}px`, ...t('body'), color: 'var(--text-muted)', textDecoration: 'none' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                Sign in to report
              </Link>
            )}
          </div>
        </>
      )}

      {showReport && walletAddress && (
        <ListingReportFlow
          itemId={itemId}
          reporterWallet={walletAddress}
          getAccessToken={getAccessToken}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}

export default function ItemPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { user, getAccessToken } = usePrivy();
  const { address: walletAddress, ready: walletReady } = useVisbWallet();
  const { format: fmtPrice, currency } = useCurrency();
  const [item, setItem]       = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');
  const [listPrice, setListPrice]       = useState('');
  const [listStatus, setListStatus]     = useState<'idle' | 'listing' | 'done'>('idle');
  const [unlistStatus, setUnlistStatus] = useState<'idle' | 'unlisting'>('idle');
  const [editingPrice, setEditingPrice] = useState(false);
  const [buyStatus,  setBuyStatus]      = useState<'idle' | 'done'>('idle');
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [descOverflows, setDescOverflows] = useState(false);
  const descRef = useRef<HTMLDivElement>(null);
  const [copiedTx, setCopiedTx]       = useState<string | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [privateMode, setPrivateMode] = useState(false);
  const [itemOrder, setItemOrder] = useState<{ status: string; shipped_at: string | null; delivered_at: string | null } | null | undefined>(undefined);
  const [shipEst, setShipEst] = useState<number | null>(null);
  const [showEditListing, setShowEditListing] = useState(false);
  const [activeImage, setActiveImage] = useState<string | undefined>(undefined);

  const isAdmin = isAdminWallet(walletAddress);

  const { data: sellerRep, isLoading: repLoading } = trpc.reviews.getReputation.useQuery(
    { wallet: item?.current_owner_wallet ?? '' },
    { enabled: !!item?.current_owner_wallet },
  );
  useEffect(() => {
    try { setPrivateMode(localStorage.getItem('visby-private-mode') === '1'); } catch {}
  }, []);

  // navigator.clipboard.writeText throws/rejects "SecurityError: The operation is insecure" when the
  // Clipboard API is denied — insecure context, an embedding iframe without clipboard-write permission,
  // or a browser privacy policy. Guarded so a denial degrades to a no-op instead of an uncaught error.
  const copyTx = useCallback((tx: string) => {
    try {
      navigator.clipboard?.writeText(tx).then(() => {
        setCopiedTx(tx);
        setTimeout(() => setCopiedTx(null), 1500);
      }).catch(() => {});
    } catch {}
  }, []);

  const isOwner = !!(walletAddress && item?.current_owner_wallet === walletAddress);

  useEffect(() => {
    if (!id) return;
    const k = 'viewed:' + id;
    try {
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, '1');
    } catch {}
    fetch('/api/items/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: id, viewer_wallet: walletAddress ?? undefined }),
    }).catch(() => {});
  }, [id, walletAddress]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/orders/item/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { order: { status: string; shipped_at: string | null; delivered_at: string | null } | null } | null) => {
        setItemOrder(d?.order ?? null);
      })
      .catch(() => setItemOrder(null));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/item/${id}`)
      .then(async r => {
        const text = await r.text();
        try { return JSON.parse(text); }
        catch { throw new Error('Could not load this item — try again.'); }
      })
      .then(d => { if (d.error) setErr(d.error); else { setItem(d); setActiveImage(d.image_url); } })
      .catch((e: any) => setErr(friendlyError(e, 'Failed to load — try again.')))
      .finally(() => setLoading(false));
  }, [id]);

  // Estimate shipping for the seller payout breakdown (only meaningful for a listed item with a weight).
  useEffect(() => {
    const w = item?.weight_oz;
    if (!item?.is_listed || !item?.price_usdc || !w) { setShipEst(null); return; }
    fetch('/api/shipping/estimate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weight_oz: Number(w), service: item.ship_service_pref || '2day' }),
    })
      .then(r => r.json())
      .then(d => { if (typeof d.amount === 'number') setShipEst(d.amount); })
      .catch(() => {});
  }, [item]);

  // L4b: only show the Show more/less toggle when the clamped description is actually cut off.
  useEffect(() => {
    const el = descRef.current;
    if (!el) { setDescOverflows(false); return; }
    setShowFullDesc(false);
    setDescOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [item?.description]);

  async function handleList(e: React.FormEvent) {
    e.preventDefault();
    if (!walletAddress || !item) return;
    setListStatus('listing');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ serial: item.serial_number, price_usdc: parseFloat(listPrice), seller_wallet: walletAddress }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to list item');
      setItem(prev => prev ? { ...prev, is_listed: true, price_usdc: parseFloat(listPrice) } : prev);
      setListStatus('done');
      setEditingPrice(false);
      setTimeout(() => setListStatus('idle'), 2500);
    } catch (err: any) {
      console.error('[handleList]', err);
      alert(friendlyError(err, 'Failed to list item — try again.'));
      setListStatus('idle');
    }
  }

  async function handleUnlist() {
    if (!walletAddress || !item) return;
    setUnlistStatus('unlisting');
    const token = await getAccessToken();
    const res = await fetch('/api/listing', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ serial: item.serial_number, seller_wallet: walletAddress }),
    });
    if (res.ok) {
      setItem(prev => prev ? { ...prev, is_listed: false, price_usdc: undefined } : prev);
      setListStatus('idle');
      setEditingPrice(false);
      setListPrice('');
    }
    setUnlistStatus('idle');
  }

  if (loading) return (
    <div style={{ background: 'transparent', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: `3px solid var(--text-muted)`, borderTopColor: 'transparent', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (err || !item) return (
    <div style={{ background: 'transparent', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: S[4] }}>
      <div style={{ ...t('body'), color: C.red }}>{err || 'Item not found'}</div>
      <Link href="/" style={{ ...btn('secondary') }}>Browse marketplace</Link>
    </div>
  );

  const profiles = item.profiles ?? {};
  const sellerProfile = profiles[item.current_owner_wallet];
  const sellerDisplay = sellerProfile?.display_name || shortAddr(item.current_owner_wallet);
  const sellerAvatar  = sellerProfile?.avatar_url ?? null;
  const sellerInitial = (item.current_owner_wallet[0] ?? '?').toUpperCase();
  const history = item.ownership_history ?? [];
  // POL1: every transfer event counts as an owner, even if a wallet reappears
  // (e.g. person1 -> person2 -> back to person1 reads as 3 owners), so this
  // counts ownership_history rows rather than deduping by owner_wallet.
  const ownerCount = history.length || 1;
  // L4c: the seller's saved display currency, shown as a secondary line only when it's set
  // and differs from what the viewer is currently looking at — never a raw "≈ … USDC" figure.
  const rawSellerCurrency = sellerProfile?.preferred_currency ?? null;
  const sellerCurrency: Currency | undefined = rawSellerCurrency && isValidCurrency(rawSellerCurrency) ? rawSellerCurrency : undefined;
  const showSellerCurrency = !!(sellerCurrency && sellerCurrency !== currency);

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>

      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)' }}>
        <div className="visby-inner" style={{ paddingTop: S[3], paddingBottom: S[3], display: 'flex', alignItems: 'center', gap: S[3] }}>
          <Link href="/marketplace" style={{ display: 'flex', textDecoration: 'none' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </Link>
          <div style={{ ...t('heading'), flex: 1, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
          <HeaderMenu />
        </div>
      </div>

      {/* Hero image — full width up to page container */}
      <div className="visby-inner" style={{ paddingTop: S[4], paddingBottom: 0 }}>
        <div style={{ background: isCutout(activeImage) ? 'transparent' : 'var(--surface-bg)', width: '100%', height: 360, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
          {activeImage ? (
            <img src={activeImage} alt={item.name} style={isCutout(activeImage)
              ? { width: '100%', height: '100%', objectFit: 'contain', padding: 12 }
              : { width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ ...t('micro'), color: 'var(--text-muted)' }}>{item.category}</div>
          )}
          {/* Condition badge */}
          <span style={{ ...badge('onImage'), position: 'absolute', bottom: S[3], left: S[3] }}>
            {history.length > 1 ? 'Used' : item.condition}
          </span>
        </div>
        {/* Additional owner-added photos — original cover always shown first */}
        {(item.extra_image_urls?.length ?? 0) > 0 && (
          <div style={{ display: 'flex', gap: S[2], marginTop: S[3], overflowX: 'auto' }}>
            {[item.image_url, ...(item.extra_image_urls ?? [])].filter(Boolean).map((url, i) => (
              <button key={`${url}-${i}`} onClick={() => setActiveImage(url as string)}
                style={{
                  width: 64, height: 64, borderRadius: 'var(--r-sm)', overflow: 'hidden', flexShrink: 0,
                  padding: 0, cursor: 'pointer', background: 'var(--surface-bg)',
                  border: '1px solid var(--glass-border)',
                  boxShadow: activeImage === url ? '0 4px 14px rgba(42,138,237,.32)' : 'none',
                }}>
                <img src={url as string} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="visby-inner" style={{ paddingBottom: S[8] + S[7] }}>

        {/* Name + category */}
        <div style={{ paddingTop: S[5], paddingBottom: S[5], borderBottom: `1px solid var(--divider)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginBottom: S[3], flexWrap: 'wrap' }}>
            <span style={{ ...badge('default') }}>{item.category}</span>
            <BrandBadge status={(item as any).serial_status} brand={(item as any).brand} />
            {isOwner && <span style={{ ...badge('default') }}>You own this</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
            <h1 style={{ ...t('title'), color: 'var(--text-strong)', margin: 0, flex: 1 }}>{item.name}</h1>
            <AuthBadge status={item.auth_status} />
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><title>Name is locked at mint</title><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <LikeButton itemId={item.id} variant="inline" showCount />
            <ListingMoreMenu itemId={item.id} walletAddress={walletAddress ?? null} getAccessToken={getAccessToken} />
          </div>
        </div>

        {/* Price + buy/owner controls */}
        <div style={{ padding: `${S[5]}px 0`, borderBottom: `1px solid var(--divider)` }}>

          {/* Wait for wallet before deciding owner vs buyer view */}
          {!walletReady ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid var(--text-muted)`, borderTopColor: 'transparent', animation: 'spin .8s linear infinite' }} />
              <span style={{ ...t('body'), color: C.muted }}>Loading wallet…</span>
            </div>
          ) : isOwner ? (
            item.is_listed && item.price_usdc && !editingPrice ? (
              /* Listed — show controls */
              <div>
                <div style={price('lg')}>
                  {fmtPrice(item.price_usdc)}
                </div>
                <div style={{ ...sectionLabel(), marginTop: S[2], marginBottom: S[5] }}>Listed for sale</div>
                <div style={{ display: 'flex', gap: S[3] }}>
                  <button onClick={() => { setEditingPrice(true); setListPrice(String(item.price_usdc ?? '')); }}
                    style={{ ...btn('secondary', { full: true, pill: false }), flex: 1 }}>
                    Edit Price
                  </button>
                  <button onClick={handleUnlist} disabled={unlistStatus === 'unlisting'}
                    style={{ ...btn('danger', { full: true, pill: false }), flex: 1, opacity: unlistStatus === 'unlisting' ? 0.6 : 1 }}>
                    {unlistStatus === 'unlisting' ? 'Removing…' : 'Unlist'}
                  </button>
                </div>
                <button onClick={() => setShowEditListing(true)}
                  style={{ ...btn('text', { full: true }), marginTop: S[2] }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Edit Photos &amp; Description
                </button>

                {/* Seller payout breakdown — Visby cut + shipping deducted from the sale price */}
                <div style={{ ...surface({ pad: S[4] }), marginTop: S[4], display: 'flex', flexDirection: 'column', gap: S[2] }}>
                  <div style={{ ...sectionLabel(), marginBottom: S[1] }}>Your payout</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>List price</span>
                    <span style={{ ...t('meta'), color: 'var(--text)' }}>${item.price_usdc.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Visby fee (9%)</span>
                    <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>−${feeBreakdown(item.price_usdc, 0).platform_fee_usd.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Estimated shipping</span>
                    <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>{shipEst != null ? `−$${shipEst.toFixed(2)}` : 'set at fulfillment'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: S[1], paddingTop: S[2], borderTop: '1px solid var(--divider)' }}>
                    <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>You net</span>
                    <span style={{ ...t('heading'), color: C.green }}>{shipEst != null ? '' : '~'}${feeBreakdown(item.price_usdc, shipEst ?? 0).seller_net_usd.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ) : (
              /* Not listed or editing price — show list/update form */
              listStatus === 'done' ? (
                <div style={{ ...t('body'), color: C.green, fontWeight: 700, display: 'flex', alignItems: 'center', gap: S[2] }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {editingPrice ? 'Price updated!' : 'Listed successfully!'}
                </div>
              ) : (
                <form onSubmit={handleList}>
                  <div style={{ position: 'relative', marginBottom: S[3] }}>
                    <div style={{ position: 'absolute', left: S[4], top: '50%', transform: 'translateY(-50%)', ...t('heading'), color: 'var(--text-muted)' }}>$</div>
                    <input type="number" value={listPrice} onChange={e => setListPrice(e.target.value)} placeholder="0.00" required min="0.01" step="0.01"
                      style={{ ...input(), padding: '13px 60px 13px 30px', boxSizing: 'border-box' }} />
                    <div style={{ position: 'absolute', right: S[4], top: '50%', transform: 'translateY(-50%)', ...t('meta'), color: C.muted }}>USDC</div>
                  </div>
                  <button type="submit" disabled={listStatus === 'listing'}
                    style={{ ...btn('primary', { full: true }), cursor: listStatus === 'listing' ? 'not-allowed' : 'pointer', opacity: listStatus === 'listing' ? 0.6 : 1 }}>
                    {listStatus === 'listing' ? (
                      <><div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', animation: 'spin .8s linear infinite' }} /> Listing…</>
                    ) : editingPrice ? `Update Price${listPrice ? ` · $${parseFloat(listPrice).toFixed(2)}` : ''}` : `List Now${listPrice ? ` · $${parseFloat(listPrice).toFixed(2)}` : ''}`}
                  </button>
                  {editingPrice && (
                    <button type="button" onClick={() => setEditingPrice(false)}
                      style={{ ...btn('text', { full: true }), marginTop: S[2] }}>
                      Cancel
                    </button>
                  )}
                </form>
              )
            )
          ) : (
            /* ── BUYER VIEW ── */
            item.is_listed && item.price_usdc ? (
              <>
                {/* L4c: primary price is always the viewer's own preferred currency — never a raw
                    "≈ … USDC" figure. A secondary line only appears when the seller's saved
                    preferred currency is known and differs from what the viewer is looking at. */}
                <div style={{ ...price('lg'), marginBottom: showSellerCurrency ? S[2] : S[3] }}>
                  {fmtPrice(item.price_usdc)}
                </div>
                {showSellerCurrency && sellerCurrency && (
                  <div style={{ ...t('meta'), color: 'var(--text-muted)', marginBottom: S[3] }}>
                    Seller sees ≈ {formatCurrency(item.price_usdc, sellerCurrency)}
                  </div>
                )}

                {/* Universal Visby free shipping — buyer pays only the listed price */}
                <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginBottom: S[5] }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                  <span style={{ ...t('body'), color: 'var(--text-strong)', fontWeight: 700 }}>All Visby Orders have universal free shipping</span>
                </div>

                {walletAddress && buyStatus === 'done' ? (
                  <div style={{ ...badge('success'), display: 'flex', alignItems: 'center', gap: S[2], padding: S[4], borderRadius: 'var(--r)' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <span style={{ ...t('heading'), color: C.green }}>Purchase complete!</span>
                  </div>
                ) : walletAddress ? (
                  <>
                    <button onClick={() => setShowCheckout(true)} style={btn('primary', { full: true })}>
                      Buy Now · {fmtPrice(item.price_usdc)}
                    </button>
                    <div style={{ marginTop: S[3] }}>
                      <AddToCartButton itemId={item.id} sellerWallet={item.current_owner_wallet} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginTop: S[3] }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                      <span style={{ ...t('meta'), color: 'var(--text-muted)' }}>Seller is paid only after you confirm delivery.</span>
                    </div>
                  </>
                ) : (
                  <Link href="/login" style={btn('primary', { full: true })}>
                    Sign In to Buy
                  </Link>
                )}
              </>
            ) : itemOrder ? (
              <div>
                <span style={{ ...badge('default') }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Sold
                </span>
                <div style={{ ...t('meta'), color: C.muted, marginTop: S[2] }}>
                  {itemOrder.status === 'shipped'
                    ? 'In transit'
                    : itemOrder.status === 'delivered'
                    ? 'Delivered'
                    : 'Awaiting shipment'}
                </div>
              </div>
            ) : (
              <div style={{ ...t('body'), color: C.muted }}>Not listed for sale</div>
            )
          )}

          {/* Offers (7.3): buyer proposes a price / seller accepts. Self-gates by role + listed state. */}
          <OffersPanel
            itemId={item.id}
            listPrice={item.price_usdc ?? 0}
            viewerWallet={walletAddress ?? null}
            isOwner={isOwner}
            listed={!!(item.is_listed && item.price_usdc)}
          />
        </div>

        {/* Seller */}
        <div style={{ padding: `${S[5]}px 0`, borderBottom: `1px solid var(--divider)` }}>
          <div style={{ ...sectionLabel(), marginBottom: S[3] }}>Seller</div>
          <div style={{ ...card({ pad: S[4] }) }}>
            {/* P3a: avatar + name link to the seller's public profile; Message Seller / Report /
                Admin controls stay outside the link as siblings so they don't fight it for clicks. */}
            <Link href={`/p/${item.current_owner_wallet}`}
              style={{ display: 'flex', alignItems: 'center', gap: S[3], textDecoration: 'none' }}>
              <div style={{ ...avatar('md'), background: sellerAvatar ? 'var(--surface-bg)' : GH }}>
                {sellerAvatar ? <img src={sellerAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : sellerInitial}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>
                  {sellerDisplay}
                </div>
                <div style={{ marginTop: S[1] }}>
                  {repLoading
                    ? null
                    : sellerRep && sellerRep.count > 0
                      ? <ReputationBadge avg={sellerRep.avg} count={sellerRep.count} />
                      : <span style={{ ...t('meta'), color: C.muted }}>New seller</span>}
                </div>
              </div>
            </Link>
            {!isOwner && !privateMode && (
              <Link href={`/dashboard?msg=${item.current_owner_wallet}`}
                style={{ ...btn('secondary', { full: true }), marginTop: S[4] }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Message Seller
              </Link>
            )}
            {isAdmin && (
              <div style={{ marginTop: S[4], paddingTop: S[4], borderTop: '1px solid var(--divider)' }}>
                <div style={{ ...t('micro'), color: 'var(--text-muted)', marginBottom: S[2], letterSpacing: '0.05em', textTransform: 'uppercase' }}>Admin</div>
                <Link href="/admin/reports" style={{ ...btn('secondary', { full: true, pill: false }), fontSize: 12 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                  Review in moderation queue
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Description — L4b: visible immediately, clamped to 4 lines; Show more/less only
            appears once the measured content actually overflows the clamp. */}
        {item.description && (
          <div style={{ padding: `${S[5]}px 0`, borderBottom: `1px solid var(--divider)` }}>
            <span style={{ ...t('heading'), color: 'var(--text-strong)' }}>Description</span>
            <div
              ref={descRef}
              style={{
                ...t('body'), color: 'var(--text)', lineHeight: 1.75, marginTop: S[3],
                ...(showFullDesc ? null : { display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
              }}
            >
              {item.description}
            </div>
            {descOverflows && (
              <button onClick={() => setShowFullDesc(s => !s)}
                style={{ ...btn('text'), padding: 0, marginTop: S[2] }}>
                {showFullDesc ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}

        {/* ── Tally — the provenance NFT, rendered as a tangible glossy object ── */}
        <div id="history" style={{ padding: `${S[5]}px 0`, scrollMarginTop: 72 }}>
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--r-xl)', background: 'var(--grad-tally)', color: '#15121C', boxShadow: '0 14px 34px rgba(30,30,45,.20), inset 0 1px 0 rgba(255,255,255,.75)' }}>
            {/* shine */}
            <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(125deg, rgba(255,255,255,0) 38%, rgba(255,255,255,.45) 50%, rgba(255,255,255,0) 62%), radial-gradient(120% 70% at 12% 0%, rgba(255,255,255,.45), rgba(255,255,255,0) 55%)' }} />

            <div style={{ position: 'relative', padding: S[5] }}>
              {/* Header */}
              <TallyExplainerCard />

              {/* L4a: serial number lives in the provenance panel, not the listing-info area above.
                  Owner-masking is unchanged — only the owner ever sees the real value. */}
              <div style={{ ...t('meta'), color: 'rgba(21,18,28,.6)', marginBottom: S[5] }}>
                {isOwner
                  ? `SN: ${item.serial_number}`
                  : <span>SN: <span style={{ letterSpacing: '0.1em' }}>••••••••</span> <span style={{ fontStyle: 'italic' }}>· visible to owner</span></span>
                }
              </div>

              {/* Provenance — mint address */}
              <div style={{ ...t('micro'), color: 'rgba(21,18,28,.5)', letterSpacing: '.06em', marginBottom: S[1] }}>MINT ADDRESS</div>
              <div style={{ ...t('meta'), color: '#15121C', fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: S[2] }}>{item.nft_mint_address || '—'}</div>
              {item.nft_mint_address && (
                <a href={explorerAddress(item.nft_mint_address)} target="_blank" rel="noopener noreferrer"
                  style={{ ...t('meta'), display: 'inline-flex', alignItems: 'center', gap: S[1], color: '#15121C', fontWeight: 700, textDecoration: 'none' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  View on explorer
                </a>
              )}

              {/* TallyTracker — the ownership history (newest first), full wallets for transparency */}
              <div style={{ height: 1, background: 'rgba(21,18,28,.14)', margin: `${S[5]}px 0` }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: S[3] }}>
                <span style={{ ...t('heading'), color: '#15121C', fontWeight: 800 }}>TallyTracker</span>
                <span style={{ ...t('meta'), color: 'rgba(21,18,28,.6)' }}>{ownerCount} owner{ownerCount !== 1 ? 's' : ''}</span>
              </div>
              {history.length === 0 ? (
                <div style={{ ...t('body'), color: 'rgba(21,18,28,.6)' }}>No history yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {[...history].reverse().map((r, idx, arr) => {
                    const w    = r.owner_wallet;
                    const prof = profiles[w];
                    const date = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    return (
                      <Link key={r.id} href={`/p/${w}`}
                        style={{ display: 'flex', alignItems: 'flex-start', gap: S[3], padding: `${S[3]}px 0`,
                                 borderBottom: idx < arr.length - 1 ? '1px solid rgba(21,18,28,.12)' : 'none', textDecoration: 'none' }}>
                        <AvatarCircle wallet={w} avatarUrl={prof?.avatar_url} size={40} ring="rgba(255,255,255,.65)" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: S[2], flexWrap: 'wrap' }}>
                            <span style={{ ...t('body'), color: '#15121C', fontWeight: 700 }}>{prof?.display_name || shortAddr(w)}</span>
                            {idx === 0 && <span style={{ fontSize: 10, fontWeight: 800, color: '#15121C', background: 'rgba(255,255,255,.6)', borderRadius: 999, padding: '2px 8px' }}>Current</span>}
                          </div>
                          <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(21,18,28,.66)', wordBreak: 'break-all', marginTop: 2 }}>
                            {w}{r.price_usdc ? ` · $${r.price_usdc.toFixed(2)}` : ''}
                          </div>
                        </div>
                        <div style={{ ...t('meta'), color: 'rgba(21,18,28,.6)', textAlign: 'right', flexShrink: 0 }}>{date}</div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {showCheckout && item && walletAddress && (
        <CheckoutModal
          itemId={item.id}
          itemName={item.name}
          priceUsdc={item.price_usdc!}
          buyerWallet={walletAddress}
          sellerCurrency={sellerCurrency}
          onClose={() => setShowCheckout(false)}
          onSuccess={(purchasedItemId) => {
            setShowCheckout(false);
            router.push(`/order/${purchasedItemId}`);
          }}
        />
      )}

      {showEditListing && item && walletAddress && (
        <EditListingSheet
          item={item}
          walletAddress={walletAddress}
          getAccessToken={getAccessToken}
          onClose={() => setShowEditListing(false)}
          onSaved={(patch) => {
            setItem(prev => prev ? { ...prev, ...patch } : prev);
            setShowEditListing(false);
          }}
        />
      )}
    </div>
  );
}
