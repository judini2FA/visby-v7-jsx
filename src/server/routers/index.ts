import { createTRPCRouter } from '@/server/trpc';
import { listingsRouter } from './listings';
import { profilesRouter } from './profiles';
import { followsRouter } from './follows';
import { likesRouter } from './likes';
import { messagesRouter } from './messages';
import { reviewsRouter } from './reviews';
import { blocksRouter } from './blocks';
import { notificationsRouter } from './notifications';

export const appRouter = createTRPCRouter({
  listings: listingsRouter,
  profiles: profilesRouter,
  follows: followsRouter,
  likes: likesRouter,
  messages: messagesRouter,
  reviews: reviewsRouter,
  blocks: blocksRouter,
  notifications: notificationsRouter,
});

export type AppRouter = typeof appRouter;
