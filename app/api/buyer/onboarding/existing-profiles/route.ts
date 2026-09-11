import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import type { ExistingProfileRow } from '@/types/buyer-onboarding';

export type { ExistingProfileRow };

/**
 * POST /api/buyer/onboarding/existing-profiles
 *
 * Lightweight wrapper around Task 6's app.find_existing_profiles_for_phone,
 * used by /onboarding to show the ProfilePicker before the intake form when
 * the buyer's phone already has a profile at another tenant.
 *
 * Identity/authorization: mirrors the established pattern in
 * app/api/buyer/documents/reuse-check/route.ts's phone branch.
 *  - requireBuyerAccessProfile gates the route to an authenticated
 *    buyer_pending/buyer_admin session (same check as the other buyer
 *    onboarding/document routes) and is also how the CURRENT tenant_id is
 *    derived (`profile.context.tenant_id`, JWT-derived — never client input)
 *    for the p_exclude_tenant_id argument.
 *  - The phone itself is never taken from the request body, from
 *    app.buyers.phone, or from app.buyer_users.phone (all mutable,
 *    non-authoritative). It is read via a request-scoped Supabase client
 *    (built from this request's own auth cookies) as
 *    user_metadata.otp_verified_phone off the session's own auth user. The
 *    RPC itself re-derives and re-checks this same claim server-side
 *    (auth.jwt() -> user_metadata.otp_verified_phone via SECURITY DEFINER),
 *    so a caller cannot spoof another phone even if this route had a bug.
 *  - No request body is read at all — this endpoint takes no client input
 *    beyond the authenticated session.
 */

function isPendingOrAdmin(role: string | null): boolean {
  return role === 'buyer_pending' || role === 'buyer_admin';
}

function createRequestScopedClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        // Read-only usage — no response to attach refreshed cookies to.
        setAll: () => {},
      },
    },
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const profile = await requireBuyerAccessProfile(request);
    if (!profile?.context.tenant_id || !profile.buyer || !isPendingOrAdmin(profile.context.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scoped = createRequestScopedClient(request);
    const { data: userData, error: userError } = await scoped.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const otpVerifiedPhone = (userData.user.user_metadata as Record<string, unknown> | null)?.otp_verified_phone;
    if (typeof otpVerifiedPhone !== 'string' || !otpVerifiedPhone.trim()) {
      // No OTP-verified phone on this session — nothing to look up.
      return NextResponse.json({ profiles: [] });
    }

    const { data, error } = await scoped
      .schema('app')
      .rpc('find_existing_profiles_for_phone', {
        p_phone: otpVerifiedPhone,
        p_exclude_tenant_id: profile.context.tenant_id,
      });

    if (error) {
      console.error('[POST /api/buyer/onboarding/existing-profiles] rpc failed', error);
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
    }

    return NextResponse.json({ profiles: (data ?? []) as ExistingProfileRow[] });
  } catch (error) {
    console.error('[POST /api/buyer/onboarding/existing-profiles]', error);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
