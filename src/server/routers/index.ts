import { createTRPCRouter } from '@/server/trpc';
import { listingsRouter } from './listings';
import { nftRouter } from './nft';

export const appRouter = createTRPCRouter({
  listings: listingsRouter,
    nft: nftRouter,
    });

    export type AppRouter = typeof appRouter;
