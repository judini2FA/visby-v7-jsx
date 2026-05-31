import { createTRPCRouter } from '@/server/trpc';
import { listingsRouter } from './listings';
import { nftRouter } from './nft';
import { profileRouter } from './profile';
import { paymentsRouter } from './payments';

export const appRouter = createTRPCRouter({
  listings: listingsRouter,
    nft: nftRouter,
      profile: profileRouter,
        payments: paymentsRouter,
        });

        export type AppRouter = typeof appRouter;