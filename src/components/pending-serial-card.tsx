'use client';

import Link from 'next/link';
import { t, price, card, badge } from '@/lib/ui';
import { isCutout } from '@/components/listing-card';
import { useCurrency } from '@/lib/currency';

export interface PendingSerialItem {
  kind: 'pending';
  id: string;
  name: string;
  image_url?: string | null;
  price_usdc: number;
  category?: string | null;
  condition?: string | null;
  business_wallet: string;
}

// Unminted business inventory — same visual shell as ListingCard (image hero + overlapping info
// box) so a mixed grid reads as one system, but no like/owner affordances (no like or ownership
// rows exist yet) and it links to /business-item/[id] instead of /item/[id].
export function PendingSerialCard({ item }: { item: PendingSerialItem }) {
  const { format: fmtPrice } = useCurrency();

  return (
    <Link href={`/business-item/${item.id}`}
      style={{ display: 'block', position: 'relative', alignSelf: 'start', textDecoration: 'none' }}>

      <div style={{ position: 'relative', aspectRatio: '1 / 1', background: 'var(--surface-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
        {item.image_url
          ? <img src={item.image_url} alt={item.name} style={isCutout(item.image_url)
              ? { width: '100%', height: '100%', objectFit: 'contain', padding: 12 }
              : { width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ ...t('micro'), color: 'var(--text-muted)' }}>{item.category}</span>
        }
        <div style={{ position: 'absolute', top: 10, left: 10 }}>
          <span style={badge('onImage')}>Direct from seller</span>
        </div>
      </div>

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
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
          <div style={price('md')}>
            {fmtPrice(item.price_usdc ?? 0)}
          </div>
          {item.condition && (
            <span style={{ ...t('meta'), color: 'var(--text-muted)', textTransform: 'capitalize' }}>
              {item.condition.replace(/_/g, ' ')}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
