src/lib/supabase/server.ts
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export function createServerSupabaseClient() {
  return createServerComponentClient(
      { cookies },
          {
                supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
                      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                          }
                            );
                            }