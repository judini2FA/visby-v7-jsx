import { createTRPCRouter } from '@/server/trpc';
import { listingsRouter } from './listings';
import { nftRouter } from './nft';
import { profilesRouter } from './profiles';
import { followsRouter } from './follows';
import { likesRouter } from './likes';
import { messagesRouter } from './messages';

export const appRouter = createTRPCRouter({
  listings: listingsRouter,
  nft: nftRouter,
  profiles: profilesRouter,
  follows: followsRouter,
  likes: likesRouter,
  messages: messagesRouter,
});

export type AppRouter = typeof appRouter;
