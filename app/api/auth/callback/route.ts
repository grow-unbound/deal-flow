import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import type { Database } from '@/types/database';
import { supabaseAdmin } from '@/lib/supabase';

// Idempotent — sets email_verified_at only if not already set.
// Called when a signup confirmation link is clicked (link-based flow fallback).
async function markTenantVerified(userId: string): Promise<void> {
  if (!supabaseAdmin) return;
  const { data: tuRow } = await supabaseAdmin
    .schema('app')
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .single();
  if (!tuRow?.tenant_id) return;
  await supabaseAdmin
    .schema('app')
    .from('tenants')
    .update({ email_verified_at: new Date().toISOString() })
    .eq('id', tuRow.tenant_id)
    .is('email_verified_at', null);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const explicitNext = searchParams.get('next');

  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient<Database>({
    cookies: async () => cookieStore,
  });

  // Token-hash flow: modern Supabase email links use ?token_hash=&type= directly
  if (token_hash && type) {
    const { data: otpData, error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'recovery' | 'invite' | 'signup' | 'email',
    });
    if (!error) {
      // Email confirmation via link — mark tenant verified (link-based fallback path)
      if ((type === 'signup' || type === 'email' || type === 'magiclink') && otpData?.user?.id) {
        await markTenantVerified(otpData.user.id).catch(() => {});
      }
      const next =
        type === 'invite'
          ? '/setup-password'
          : type === 'recovery'
            ? '/reset-password'
            : (type === 'signup' || type === 'email' || type === 'magiclink')
              ? '/login?verified=1'
              : explicitNext ?? '/dashboard';
      return NextResponse.redirect(`${origin}${next}`);
    }
    // If token verification fails, fall through to error handling
  }

  // PKCE flow: Supabase redirects here with ?code= after verifying the email link
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session?.user) {
      const user = data.session.user;
      // If this is a signup/email confirmation (not invite/recovery), mark tenant verified
      const isConfirmation = !user.user_metadata?.tenant_id && !explicitNext?.includes('setup-password');
      if (isConfirmation) {
        await markTenantVerified(user.id).catch(() => {});
        return NextResponse.redirect(`${origin}/login?verified=1`);
      }
      const next = explicitNext ?? inferNextFromUser(user);
      return NextResponse.redirect(`${origin}${next}`);
    }
    // If code exchange fails, fall through to error handling
  }

  // Fallback: redirect to login
  return NextResponse.redirect(`${origin}/login`);
}

function inferNextFromUser(user: { user_metadata?: Record<string, unknown> } | undefined): string {
  // Invite users have tenant_id injected into user_metadata by the invite API.
  // Password-recovery users have no such metadata, so send them to reset-password.
  if (user?.user_metadata?.tenant_id) return '/setup-password';
  return '/reset-password';
}
