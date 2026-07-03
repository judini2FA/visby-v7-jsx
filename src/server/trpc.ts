import { initTRPC, TRPCError } from '@trpc/server';
import { ZodError } from 'zod';
import superjson from 'superjson';
import { getAuthedWallets } from '@/lib/auth';
import { isBanned } from '@/lib/account-status';

// The raw request is carried in context so protectedProcedure can verify the Privy bearer token lazily —
// public procedures never touch Privy, so they pay no auth cost.
export type Context = { req: Request };

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

// Requires a valid Privy token; resolves the caller's verified linked wallets and exposes them as
// ctx.wallets. Procedures must still check that ctx.wallets includes the specific wallet they act on.
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const wallets = await getAuthedWallets(ctx.req);
  if (!wallets || wallets.length === 0) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in required' });
  }
  // A banned account is locked out of every protected action (fail-open on a DB hiccup — see
  // account-status.ts). Suspension is enforced per-action at the sell/write routes, not here.
  if (await isBanned(wallets)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'account_banned' });
  }
  return next({ ctx: { wallets } });
});
