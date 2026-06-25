import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '@/server/trpc';
import { createServiceClient } from '@/lib/supabase/service';

// Read-only and unauthenticated by design: exposes ONLY the unread COUNT for the nav badge, never
// notification content (content is fetched via the authed REST route). Tolerant — any error
// (missing table before migration, etc.) returns 0 so the badge never breaks the nav.
export const notificationsRouter = createTRPCRouter({
  unreadCount: publicProcedure
    .input(z.object({ wallet: z.string() }))
    .query(async ({ input }): Promise<number> => {
      try {
        const supabase = createServiceClient();
        const { count } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('recipient_wallet', input.wallet)
          .eq('read', false)
          // Messages are counted by getConversations (the Messages tab owns its own unread); exclude
          // any 'message'-type rows here so the Inbox badge can never double-count them.
          .neq('type', 'message');
        return count ?? 0;
      } catch {
        return 0;
      }
    }),
});
