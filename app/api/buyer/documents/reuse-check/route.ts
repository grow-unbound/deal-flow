import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { z } from 'zod';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { supabaseAdmin } from '@/lib/supabase';
import { normalizeGstin } from '@/lib/server/buyer-document-presign';

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
 *
 * FIX (post-launch review of task 7, 2026-09): reuse-confirm now rejects all
 * business-scope (GSTIN-keyed) reuse-copy requests (see reuse-confirm's
 * file-level comment) because a GSTIN is not a verifiable identity in this
 * system. The gstin branch here still performs the existence check itself —
 * that is the accepted, bounded existence-oracle risk the original spec
 * explicitly allows ("does a document exist for this GSTIN somewhere") — but
 * the response now also carries `reuse_available: false` so callers know the
 * copy step that would normally follow is not actionable yet. The
 * phone/personal branch is unaffected and does not carry this field at all
 * (kept for backward compatibility with any caller checking `found` alone;
 * its absence should not be read as `false` — only the explicit gstin-path
 * `reuse_available: false` is meaningful).
 *
 * Also fixes a normalization gap (Important #2): /confirm stores GSTINs via
 * normalizeGstin (trim + uppercase) but this route's schema previously only
 * trimmed, and the RPC does an exact string match — so a differently-cased
 * GSTIN in the request could silently miss a real match. The gstin is now
 * normalized the same way before the RPC call.
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
        .rpc('check_document_reuse_candidate', { p_gstin: normalizeGstin(gstin), p_phone: null });

      if (error) {
        console.error('[POST /api/buyer/documents/reuse-check] gstin lookup failed', error);
        return NextResponse.json({ error: 'Reuse lookup failed' }, { status: 500 });
      }

      // Business-scope reuse-copy is disabled this round (see reuse-confirm) —
      // report existence but tell the caller the copy step isn't actionable.
      return NextResponse.json({ ...data, reuse_available: false });
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
