import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';

/**
 * Request-scoped Supabase client for route handlers.
 *
 * Uses the user's session cookies so server routes can respect RLS without
 * requiring the service role key to be present in every environment.
 */
export async function getRequestSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component context where cookies() is read-only —
            // safe to ignore, session refresh retries on the next mutable request.
          }
        },
      },
    },
  );
}
