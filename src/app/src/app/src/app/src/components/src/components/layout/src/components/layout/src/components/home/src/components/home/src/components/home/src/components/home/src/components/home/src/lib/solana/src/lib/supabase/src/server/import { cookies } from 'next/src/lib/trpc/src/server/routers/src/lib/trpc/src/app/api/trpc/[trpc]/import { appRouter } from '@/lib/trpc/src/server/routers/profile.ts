import { z } from 'zod';
import { createTRPCRouter, publicProcedure, protectedProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';

export const profileRouter = createTRPCRouter({
  getByUsername: publicProcedure
      .input(z.object({ username: z.string() }))
          .query(async ({ ctx, input }) => {
                const { data, error } = await ctx.supabase
                        .from('profiles')
                                .select('id, username, avatar_url, bio, verified, wallet_address, created_at')
                                        .eq('username', input.username)
                                                .single();

                                                      if (error || !data)
                                                              throw new TRPCError({ code: 'NOT_FOUND', message: 'Profile not found' });
                                                                    return data;
                                                                        }),

                                                                          getMyProfile: protectedProcedure.query(async ({ ctx }) => {
                                                                              const { data, error } = await ctx.supabase
                                                                                    .from('profiles')
                                                                                          .select('*')
                                                                                                .eq('id', ctx.session.user.id)
                                                                                                      .single();

                                                                                                          if (error || !data)
                                                                                                                throw new TRPCError({ code: 'NOT_FOUND', message: 'Profile not found' });
                                                                                                                    return data;
                                                                                                                      }),

                                                                                                                        upsertProfile: protectedProcedure
                                                                                                                            .input(
                                                                                                                                  z.object({
                                                                                                                                          username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/),
                                                                                                                                                  bio: z.string().max(500).optional(),
                                                                                                                                                          avatarUrl: z.string().url().optional(),
                                                                                                                                                                  walletAddress: z.string().optional(),
                                                                                                                                                                        })
                                                                                                                                                                            )
                                                                                                                                                                                .mutation(async ({ ctx, input }) => {
                                                                                                                                                                                      const { data, error } = await ctx.supabase
                                                                                                                                                                                              .from('profiles')
                                                                                                                                                                                                      .upsert({
                                                                                                                                                                                                                id: ctx.session.user.id,
                                                                                                                                                                                                                          username: input.username,
                                                                                                                                                                                                                                    bio: input.bio,
                                                                                                                                                                                                                                              avatar_url: input.avatarUrl,
                                                                                                                                                                                                                                                        wallet_address: input.walletAddress,
                                                                                                                                                                                                                                                                  updated_at: new Date().toISOString(),
                                                                                                                                                                                                                                                                          })
                                                                                                                                                                                                                                                                                  .select()
                                                                                                                                                                                                                                                                                          .single();

                                                                                                                                                                                                                                                                                                if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
                                                                                                                                                                                                                                                                                                      return data;
                                                                                                                                                                                                                                                                                                          }),
                                                                                                                                                                                                                                                                                                          });