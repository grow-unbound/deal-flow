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
    cookies: async () => cookieStore,
  });
}
