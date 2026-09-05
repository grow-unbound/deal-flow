import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';
import { withAuthCookieDomain } from '@/lib/storefront-host';

// Browser-specific Supabase client — uses cookie storage so middleware can read the session.
// Import this in 'use client' components only. Never import in API routes or server components.
// Must stay on @supabase/ssr (not the deprecated auth-helpers-nextjs) — middleware.ts and every
// server-side Supabase client in this app use @supabase/ssr's cookie format, which is NOT
// compatible with auth-helpers-nextjs's; mixing the two makes middleware unable to parse the
// session cookie this client writes, breaking auth right after login.

export const supabaseBrowser = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookieOptions: withAuthCookieDomain({
      path: '/',
      sameSite: 'lax' as const,
    }),
  },
);
