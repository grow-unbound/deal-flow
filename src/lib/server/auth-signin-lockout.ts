import { supabaseAdmin } from '@/lib/supabase';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Minimal per-identifier lockout for POST /api/auth/signin. Adds one indexed
 * primary-key lookup before every attempt (unavoidable — must check lock state
 * regardless of outcome); writes only happen on failure, and success clears the
 * row. This is a single Postgres round-trip on `app` (not `auth`) via the
 * service-role client, not a per-request JWT re-verification — it does not touch
 * the page-load/middleware auth-check hot path the team previously optimized.
 */
export async function isSigninLocked(identifier: string): Promise<boolean> {
  if (!supabaseAdmin) return false;
  try {
    const { data } = await supabaseAdmin.schema('app')
      .from('auth_signin_attempts')
      .select('locked_until')
      .eq('identifier', identifier)
      .maybeSingle();
    if (!data?.locked_until) return false;
    return new Date(data.locked_until).getTime() > Date.now();
  } catch (err) {
    console.error('[auth-signin-lockout] check error:', err);
    return false;
  }
}

export async function recordFailedSignin(identifier: string): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    const { data } = await supabaseAdmin.schema('app')
      .from('auth_signin_attempts')
      .select('failed_count')
      .eq('identifier', identifier)
      .maybeSingle();
    const nextCount = (data?.failed_count ?? 0) + 1;
    const locked_until = nextCount >= MAX_FAILED_ATTEMPTS
      ? new Date(Date.now() + LOCKOUT_MS).toISOString()
      : null;
    await supabaseAdmin.schema('app')
      .from('auth_signin_attempts')
      .upsert(
        { identifier, failed_count: nextCount, locked_until, updated_at: new Date().toISOString() },
        { onConflict: 'identifier' },
      );
  } catch (err) {
    console.error('[auth-signin-lockout] record error:', err);
  }
}

export async function clearSigninAttempts(identifier: string): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.schema('app')
      .from('auth_signin_attempts')
      .delete()
      .eq('identifier', identifier);
  } catch (err) {
    console.error('[auth-signin-lockout] clear error:', err);
  }
}
