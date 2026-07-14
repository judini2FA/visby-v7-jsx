import { createTRPCRouter } from '@/server/trpc';
import { listingsRouter } from './listings';
import { profilesRouter } from './profiles';
import { followsRouter } from './follows';
import { likesRouter } from './likes';
import { messagesRouter } from './messages';
import { reviewsRouter } from './reviews';
import { blocksRouter } from './blocks';
import { notificationsRouter } from './notifications';
import { transfersRouter } from './transfers';
import { cartRouter } from './cart';

export const appRouter = createTRPCRouter({
  listings: listingsRouter,
  profiles: profilesRouter,
  follows: followsRouter,
  likes: likesRouter,
  messages: messagesRouter,
  reviews: reviewsRouter,
  blocks: blocksRouter,
  notifications: notificationsRouter,
  transfers: transfersRouter,
  cart: cartRouter,
});

export type AppRouter = typeof appRouter;
