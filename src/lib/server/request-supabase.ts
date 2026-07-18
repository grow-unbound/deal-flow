import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
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
  return createRouteHandlerClient<Database>({
    // auth-helpers-nextjs reads the cookie store synchronously at runtime even
    // though Next's current type surface still models cookies() as async here.
    cookies: (() => cookieStore) as unknown as () => ReturnType<typeof cookies>,
  });
}
