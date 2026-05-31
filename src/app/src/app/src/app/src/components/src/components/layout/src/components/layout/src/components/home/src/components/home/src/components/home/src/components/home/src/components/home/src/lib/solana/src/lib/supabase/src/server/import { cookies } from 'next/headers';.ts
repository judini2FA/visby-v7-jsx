src/lib/supabase/server.ts
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * tRPC context — attaches Supabase session to every request
  */
  export async function createTRPCContext(opts: { headers: Headers }) {
    const supabase = createServerSupabaseClient();
      const {
          data: { session },
            } = await supabase.auth.getSession();

              return {
                  supabase,
                      session,
                          headers: opts.headers,
                            };
                            }

                            type Context = Awaited<ReturnType<typeof createTRPCContext>>;

                            const t = initTRPC.context<Context>().create({
                              transformer: superjson,
                                errorFormatter({ shape, error }) {
                                    return {
                                          ...shape,
                                                data: {
                                                        ...shape.data,
                                                                zodError:
                                                                          error.cause instanceof ZodError ? error.cause.flatten() : null,
                                                                                },
                                                                                    };
                                                                                      },
                                                                                      });

                                                                                      export const createCallerFactory = t.createCallerFactory;
                                                                                      export const createTRPCRouter = t.router;

                                                                                      /**
                                                                                       * Public (unauthenticated) procedure
                                                                                        */
                                                                                        export const publicProcedure = t.procedure;

                                                                                        /**
                                                                                         * Protected (authenticated) procedure — throws if not logged in
                                                                                          */
                                                                                          export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
                                                                                            if (!ctx.session?.user) {
                                                                                                throw new TRPCError({ code: 'UNAUTHORIZED' });
                                                                                                  }
                                                                                                    return next({
                                                                                                        ctx: {
                                                                                                              ...ctx,
                                                                                                                    session: { ...ctx.session, user: ctx.session.user },
                                                                                                                        },
                                                                                                                          });
                                                                                                                          });