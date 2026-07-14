import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveRecipient } from '@/lib/transfers';

export const transfersRouter = createTRPCRouter({
  // Live recipient lookup for the "Send to Someone" field — by wallet address or Visby handle.
  resolve: protectedProcedure
    .input(z.object({ to: z.string().min(1).max(60) }))
    .query(async ({ input }) => {
      return await resolveRecipient(input.to);
    }),

  // The caller's own send/receive ledger (both directions), newest first.
  history: protectedProcedure
    .input(z.object({ wallet: z.string(), limit: z.number().max(100).default(40) }))
    .query(async ({ input, ctx }) => {
      if (!ctx.wallets.includes(input.wallet)) throw new TRPCError({ code: 'FORBIDDEN' });
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from('transfers')
        .select('*')
        .or(`from_wallet.eq.${input.wallet},to_wallet.eq.${input.wallet}`)
        .order('created_at', { ascending: false })
        .limit(input.limit);
      if (error) return [];
      return (data ?? []).map((r: any) => ({ ...r, direction: r.from_wallet === input.wallet ? 'out' : 'in' }));
    }),

  // Single payment request — powers the dedicated /request/[id] page. Either party (payer or requester)
  // may view it; anyone else is refused so a leaked/guessed id can't expose someone else's request or its
  // amount. When it's already paid, resolves the settling transfer's tx_hash too, for the receipt link.
  byId: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const supabase = createServiceClient();
      const { data: pr } = await supabase.from('payment_requests').select('*').eq('id', input.id).maybeSingle();
      if (!pr) return null;
      const row = pr as any;
      const isPayer = ctx.wallets.includes(row.payer_wallet);
      const isRequester = ctx.wallets.includes(row.requester_wallet);
      if (!isPayer && !isRequester) throw new TRPCError({ code: 'FORBIDDEN' });

      const others = [...new Set([row.requester_wallet, row.payer_wallet])];
      const { data: profs } = await supabase.from('profiles').select('wallet, display_name, avatar_url').in('wallet', others);
      const profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      for (const p of profs ?? []) profileMap[(p as any).wallet] = { display_name: (p as any).display_name ?? null, avatar_url: (p as any).avatar_url ?? null };

      let tx_hash: string | null = null;
      if (row.status === 'paid' && row.transfer_id) {
        const { data: tr } = await supabase.from('transfers').select('tx_hash').eq('id', row.transfer_id).maybeSingle();
        tx_hash = (tr as any)?.tx_hash ?? null;
      }

      return {
        ...row,
        viewer_role: isPayer ? 'payer' as const : 'requester' as const,
        requester: profileMap[row.requester_wallet] ?? null,
        payer: profileMap[row.payer_wallet] ?? null,
        tx_hash,
      };
    }),

  // Payment requests for the "Pay" tab: `incoming` = requests waiting for the caller to pay (pending),
  // `outgoing` = requests the caller has sent. Each is enriched with the other party's profile.
  requests: protectedProcedure
    .input(z.object({ wallet: z.string() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.wallets.includes(input.wallet)) throw new TRPCError({ code: 'FORBIDDEN' });
      const supabase = createServiceClient();
      const [incomingRes, outgoingRes] = await Promise.all([
        supabase.from('payment_requests').select('*').eq('payer_wallet', input.wallet).eq('status', 'pending').order('created_at', { ascending: false }).limit(40),
        supabase.from('payment_requests').select('*').eq('requester_wallet', input.wallet).order('created_at', { ascending: false }).limit(40),
      ]);
      const incoming = incomingRes.data ?? [];
      const outgoing = outgoingRes.data ?? [];
      const others = [...new Set([...incoming.map((r: any) => r.requester_wallet), ...outgoing.map((r: any) => r.payer_wallet)])];
      const profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      if (others.length) {
        const { data: profs } = await supabase.from('profiles').select('wallet, display_name, avatar_url').in('wallet', others);
        for (const p of profs ?? []) profileMap[(p as any).wallet] = { display_name: (p as any).display_name ?? null, avatar_url: (p as any).avatar_url ?? null };
      }
      return {
        incoming: incoming.map((r: any) => ({ ...r, other: profileMap[r.requester_wallet] ?? null })),
        outgoing: outgoing.map((r: any) => ({ ...r, other: profileMap[r.payer_wallet] ?? null })),
      };
    }),

  // Distinct people the caller has recently sent to / received from — the "Recents" row in the picker.
  recents: protectedProcedure
    .input(z.object({ wallet: z.string(), limit: z.number().max(20).default(8) }))
    .query(async ({ input, ctx }) => {
      if (!ctx.wallets.includes(input.wallet)) throw new TRPCError({ code: 'FORBIDDEN' });
      const supabase = createServiceClient();
      const { data } = await supabase
        .from('transfers')
        .select('from_wallet, to_wallet, created_at')
        .or(`from_wallet.eq.${input.wallet},to_wallet.eq.${input.wallet}`)
        .order('created_at', { ascending: false })
        .limit(60);
      const seen = new Set<string>();
      const others: string[] = [];
      for (const r of data ?? []) {
        const other = (r as any).from_wallet === input.wallet ? (r as any).to_wallet : (r as any).from_wallet;
        if (other && other !== input.wallet && !seen.has(other)) { seen.add(other); others.push(other); }
        if (others.length >= input.limit) break;
      }
      if (!others.length) return [] as Array<{ wallet: string; display_name: string | null; avatar_url: string | null }>;
      const { data: profs } = await supabase.from('profiles').select('wallet, display_name, avatar_url').in('wallet', others);
      const pm: Record<string, any> = Object.fromEntries((profs ?? []).map((p: any) => [p.wallet, p]));
      return others.map((w) => ({ wallet: w, display_name: pm[w]?.display_name ?? null, avatar_url: pm[w]?.avatar_url ?? null }));
    }),
});
