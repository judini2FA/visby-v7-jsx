import { createServiceClient } from '@/lib/supabase/service';

export type OwnerRef = { wallet: string; avatar_url: string | null };
export type ProfileRef = { avatar_url: string | null; display_name: string | null };

type SB = ReturnType<typeof createServiceClient>;

// Tolerant profile lookup: select('*') so a not-yet-migrated avatar_url column simply yields null
// (the UI falls back to an initials avatar) instead of erroring the whole query.
export async function fetchProfileMap(supabase: SB, wallets: (string | null | undefined)[]): Promise<Record<string, ProfileRef>> {
  const uniq = [...new Set(wallets.filter((w): w is string => !!w))];
  if (!uniq.length) return {};
  const { data } = await supabase.from('profiles').select('*').in('wallet', uniq);
  const map: Record<string, ProfileRef> = {};
  for (const p of (data ?? []) as any[]) map[p.wallet] = { avatar_url: p.avatar_url ?? null, display_name: p.display_name ?? null };
  return map;
}

// Ordered distinct owner chain (oldest → newest) per item, from ownership_history, each enriched with
// the owner's avatar. Falls back to [current_owner_wallet] when an item has no history rows yet (e.g.
// just minted). Batched: at most one ownership_history query + one profiles query regardless of count.
export async function ownersForItems(
  supabase: SB,
  items: { id: string; current_owner_wallet?: string | null }[],
): Promise<Record<string, OwnerRef[]>> {
  const ids = items.map(i => i.id);
  const out: Record<string, OwnerRef[]> = {};
  if (!ids.length) return out;

  const { data: hist } = await supabase
    .from('ownership_history')
    .select('item_id, owner_wallet, from_wallet, created_at')
    .in('item_id', ids)
    .order('created_at', { ascending: true });

  const chainByItem = new Map<string, string[]>();
  for (const h of (hist ?? []) as any[]) {
    const arr = chainByItem.get(h.item_id) ?? [];
    if (h.from_wallet && !arr.includes(h.from_wallet)) arr.push(h.from_wallet);
    if (h.owner_wallet && !arr.includes(h.owner_wallet)) arr.push(h.owner_wallet);
    chainByItem.set(h.item_id, arr);
  }

  const profiles = await fetchProfileMap(supabase, [...new Set([...chainByItem.values()].flat())]);

  for (const it of items) {
    const chain = chainByItem.get(it.id) ?? (it.current_owner_wallet ? [it.current_owner_wallet] : []);
    out[it.id] = chain.map(w => ({ wallet: w, avatar_url: profiles[w]?.avatar_url ?? null }));
  }
  return out;
}
