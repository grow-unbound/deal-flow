import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import type { Database } from '@/types/database';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const explicitNext = searchParams.get('next');

  const supabase = createRouteHandlerClient<Database>({ cookies });

  // PKCE flow: Supabase redirects here with ?code= after verifying the email link
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // When next was explicitly passed (the happy path), honour it directly.
      // When next is absent (Supabase stripped the path from redirect_to), infer
      // the destination from user metadata set at invite time.
      const next = explicitNext ?? inferNextFromUser(data.session?.user);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Token-hash flow: older Supabase email links use ?token_hash=&type= directly
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'recovery' | 'invite' | 'signup' | 'email',
    });
    if (!error) {
      const next = explicitNext ?? (type === 'invite' ? '/setup-password' : '/reset-password');
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}

function inferNextFromUser(user: { user_metadata?: Record<string, unknown> } | undefined): string {
  // Invite users have tenant_id injected into user_metadata by the invite API.
  // Password-recovery users have no such metadata, so send them to reset-password.
  if (user?.user_metadata?.tenant_id) return '/setup-password';
  return '/reset-password';
}
