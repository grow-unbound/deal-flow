import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { z } from 'zod';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/buyer/documents/reuse-check
 *
 * Lazy-consent lookup for the "reuse your documents from another tenant?"
 * prompt (specs/Yukti_Public-Signup_Backend-Plan_v1.md §4). Calls Task 6's
 * app.check_document_reuse_candidate.
 *
 * GSTIN-keyed (business) lookups have no owner check by design — a GSTIN is
 * already a self-asserted business identifier everywhere else in this app,
 * not an authentication credential — so they run under the service-role
 * client.
 *
 * Phone-keyed (personal, no gstin in the body) lookups MUST derive the phone
 * from this session's own OTP-verified identity, never a client-supplied
 * value or a database column — the RPC itself enforces this by checking
 * auth.jwt() -> user_metadata.otp_verified_phone, which only resolves under
 * the caller's own session (service_role has no JWT, so calling the phone
 * branch as service_role always fails auth.uid() IS NULL inside the
 * function). So the phone branch is called through a request-scoped client
 * built from this request's own Supabase auth cookies.
 */

const BodySchema = z.object({
  gstin: z.string().trim().min(1).optional(),
});

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
        // Read-only usage — this route never attaches a response to persist
        // refreshed cookies onto, so a refreshed session token is simply
        // discarded rather than propagated.
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
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 422 });
    }

    const { gstin } = parsed.data;

    if (gstin) {
      const { data, error } = await supabaseAdmin
        .schema('app')
        .rpc('check_document_reuse_candidate', { p_gstin: gstin, p_phone: null });

      if (error) {
        console.error('[POST /api/buyer/documents/reuse-check] gstin lookup failed', error);
        return NextResponse.json({ error: 'Reuse lookup failed' }, { status: 500 });
      }

      return NextResponse.json(data);
    }

    const scoped = createRequestScopedClient(request);
    const { data: userData, error: userError } = await scoped.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const otpVerifiedPhone = (userData.user.user_metadata as Record<string, unknown> | null)?.otp_verified_phone;
    if (typeof otpVerifiedPhone !== 'string' || !otpVerifiedPhone.trim()) {
      // No OTP-verified phone on this session (e.g. a seller-created buyer that
      // never went through phone-OTP self-registration) — nothing to check.
      return NextResponse.json({ found: false, tenant_name: null, document_ids: [] });
    }

    const { data, error } = await scoped
      .schema('app')
      .rpc('check_document_reuse_candidate', { p_gstin: null, p_phone: otpVerifiedPhone });

    if (error) {
      console.error('[POST /api/buyer/documents/reuse-check] phone lookup failed', error);
      return NextResponse.json({ error: 'Reuse lookup failed' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[POST /api/buyer/documents/reuse-check]', error);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
