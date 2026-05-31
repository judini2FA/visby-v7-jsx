import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@/server/routers/_app';

export const trpc = createTRPCReact<AppRouter>();

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
      return `http://localhost:${process.env.PORT ?? 3000}`;
      }

      export const trpcClient = trpc.createClient({
        links: [
            httpBatchLink({
                  url: `${getBaseUrl()}/api/trpc`,
                        transformer: superjsoimport { createBrowserClient } from '@supabase/ssr';
                        import type { Database } from './types';
                        
                        export function createClient() {
                          return createBrowserClient<Database>(
                              process.env.NEXT_PUBLIC_SUPABASE_URL!,
                                  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                                    );
                                    }
                                    
                                    // Singleton for client-side usage
                                    let client: ReturnType<typeof createClient> | null = null;
                                    
                                    export function getSupabaseClient() {
                                      if (!client) {
                                          client = createClient();
                                            }
                                              return client;
                                              }n,
                              headers() {
                                      return {
                                                'x-trpc-source': 'react',
                                                        };
                                                              },
                                                                  }),
                                                                    ],
                                                                    });