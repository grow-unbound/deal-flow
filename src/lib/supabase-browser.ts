import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';

// Browser-specific Supabase client — uses cookie storage so middleware can read the session.
// Import this in 'use client' components only. Never import in API routes or server components.
export const supabaseBrowser = createClientComponentClient<Database>();
