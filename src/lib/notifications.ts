import { createServiceClient } from '@/lib/supabase/service';

// A notification is a fire-and-forget side effect of a settlement/lifecycle event. These helpers
// swallow EVERY error (missing table before migration, transient insert failure, etc.) so that a
// notification can never break the surrounding flow — a sale, shipment, delivery, message, or
// review must complete even if the notification write fails. Mirrors the swallow-and-continue
// tolerance of src/lib/orders.ts.

export type NotificationInput = {
  recipient_wallet: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  data?: Record<string, unknown>;
};

export async function notify(n: NotificationInput): Promise<void> {
  if (!n.recipient_wallet) return;
  try {
    const supabase = createServiceClient();
    await supabase.from('notifications').insert({
      recipient_wallet: n.recipient_wallet,
      type:             n.type,
      title:            n.title,
      body:             n.body ?? null,
      link:             n.link ?? null,
      data:             n.data ?? null,
      read:             false,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.debug('notify skipped', err);
  }
}

export async function notifyMany(ns: NotificationInput[]): Promise<void> {
  const rows = ns
    .filter((n) => n.recipient_wallet)
    .map((n) => ({
      recipient_wallet: n.recipient_wallet,
      type:             n.type,
      title:            n.title,
      body:             n.body ?? null,
      link:             n.link ?? null,
      data:             n.data ?? null,
      read:             false,
    }));
  if (!rows.length) return;
  try {
    const supabase = createServiceClient();
    await supabase.from('notifications').insert(rows);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.debug('notifyMany skipped', err);
  }
}
