'use client';

import Link from 'next/link';
import { t, price, card, badge, S } from '@/lib/ui';
import { LikeButton } from '@/components/like-button';
import { OwnerStack } from '@/components/owner-stack';
import { useCurrency } from '@/lib/currency';

export interface ListingItem {
  id: string; name: string; serial_number?: string;
  condition?: string; category?: string; description?: string | null;
  image_url?: string | null; current_owner_wallet: string;
  is_listed?: boolean; price_usdc?: number | null; created_at?: string;
  transfer_count?: number;
  owners?: { wallet: string; avatar_url?: string | null }[];
}

// Transparent cutouts are stored as .png (PhotoCutoutPicker + sharp); render them `contain` so the
// item floats instead of being cropped to fill.
export const isCutout = (url?: string | null): boolean => !!url && /\.png(\?|$)/i.test(url);

// The single canonical listing card — photo + an overlapping white box holding the title, like
// button, price, and the owner stack. Used everywhere a listing is shown (home, profiles, etc.).
export function ListingCard({ item }: { item: ListingItem }) {
  const { format: fmtPrice } = useCurrency();

  return (
    <Link href={`/item/${item.id}`}
      style={{ display: 'block', position: 'relative', alignSelf: 'start', textDecoration: 'none' }}>

      {/* Image — transparent cutouts (.png) float (contain + padding); photos fill (cover). */}
      <div style={{ position: 'relative', aspectRatio: '1 / 1', background: 'var(--surface-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
        {item.image_url
          ? <img src={item.image_url} alt={item.name} style={isCutout(item.image_url)
              ? { width: '100%', height: '100%', objectFit: 'contain', padding: 12 }
              : { width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ ...t('micro'), color: 'var(--text-muted)' }}>{item.category}</span>
        }
      </div>

      {/* Info box — white card, drop shadow, slight overlap with the photo */}
      <div style={{
        ...card({ radius: 'var(--r-lg)' }),
        position: 'relative', zIndex: 2,
        margin: '-14px 8px 0',
        padding: '12px 13px',
        boxShadow: '0 10px 26px rgba(15,15,30,.18), 0 3px 8px rgba(15,15,30,.12)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ ...t('heading'), color: 'var(--text-strong)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', flex: 1, minWidth: 0 }}>
            {item.name}
          </div>
          <LikeButton itemId={item.id} variant="bare" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
          <div style={price('md')}>
            {fmtPrice(item.price_usdc ?? 0)}
          </div>
          <OwnerStack
            owners={item.owners?.length ? item.owners : [{ wallet: item.current_owner_wallet }]}
            href={`/item/${item.id}#history`}
          />
        </div>
      </div>
    </Link>
  );
}
