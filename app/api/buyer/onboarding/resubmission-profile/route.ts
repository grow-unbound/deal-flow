import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/buyer/onboarding/resubmission-profile
 *
 * Task 11: powers /resubmit-documents. Returns the buyer's full
 * previously-submitted profile (same field set as /onboarding, Task 9) plus
 * the `missing_fields` list the seller flagged via "Request more info"
 * (Yukti_Public-Signup_Frontend-Spec_v1.md §0b's structured-checklist
 * requirement), so the client can render the whole form pre-filled but only
 * force the flagged fields to be edited.
 *
 * Identity/authorization: buyer_id is derived exclusively from
 * requireBuyerAccessProfile's session lookup (JWT-derived tenant_id/buyer_id
 * claims) -- never from a client-supplied id, mirroring every other
 * buyer-scoped onboarding route in this codebase. missing_fields is sourced
 * from app.get_buyer_onboarding_status() (Task 6), called through a
 * request-scoped client (this request's own auth cookies) rather than
 * supabaseAdmin, matching the established pattern in
 * app/api/buyer/me/route.ts and app/api/buyer/onboarding/existing-profiles.
 *
 * Only exposed for a buyer currently in `needs_more_info` -- any other
 * onboarding_status (nothing pending, already approved, declined, or plain
 * pending_approval with nothing flagged) returns 404, since there is nothing
 * for this route's caller (the forced-re-OTP resubmission form) to show.
 */
function createRequestScopedClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        // Read-only usage -- no response to attach refreshed cookies to.
        setAll: () => {},
      },
    },
  );
}

function isPendingOrAdmin(role: string | null): boolean {
  return role === 'buyer_pending' || role === 'buyer_admin';
}

function addressField(address: unknown, key: 'line1' | 'line2' | 'city' | 'state' | 'pincode'): string {
  if (!address || typeof address !== 'object') return '';
  const value = (address as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const profile = await requireBuyerAccessProfile(request);
    if (!profile?.context.tenant_id || !profile.buyer || !isPendingOrAdmin(profile.context.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (profile.buyer.buyer_app_enabled !== false || !supabaseAdmin) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const scoped = createRequestScopedClient(request);
    const { data: statusData, error: statusError } = await scoped
      .schema('app')
      .rpc('get_buyer_onboarding_status');

    if (statusError) {
      console.error('[GET /api/buyer/onboarding/resubmission-profile] get_buyer_onboarding_status rpc failed:', statusError);
      return NextResponse.json({ error: 'Failed to load status' }, { status: 500 });
    }

    const statusRow = statusData as {
      onboarding_status?: string | null;
      missing_fields?: string[] | null;
    } | null;

    if (statusRow?.onboarding_status !== 'needs_more_info') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const missingFields = Array.isArray(statusRow.missing_fields) ? statusRow.missing_fields : [];

    // requireBuyerAccessProfile already selects geography/billing_address/
    // custom_fields on profile.buyer -- no need for a second admin fetch.
    const row = profile.buyer;
    const isBusiness = row.custom_fields?.is_business === true;
    const gstin = row.gstin ?? '';

    // Latest non-deleted document per doc_type this buyer previously
    // uploaded -- personal-scope by buyer_id, business-scope by gstin (only
    // meaningful once a GSTIN exists). Surfaced so DocumentUploadField can
    // show "already uploaded" state for a flagged document field instead of
    // forcing a re-upload of a document the seller didn't actually flag.
    const [shopImageRes, gstCertRes] = await Promise.all([
      supabaseAdmin
        .schema('app')
        .from('buyer_documents')
        .select('id')
        .eq('buyer_id', row.id ?? profile.buyer.id)
        .eq('doc_type', 'shop_image')
        .eq('subject_scope', 'personal')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      gstin
        ? supabaseAdmin
          .schema('app')
          .from('buyer_documents')
          .select('id')
          .eq('gstin', gstin)
          .eq('doc_type', 'gst_certificate')
          .eq('subject_scope', 'business')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    return NextResponse.json({
      missing_fields: missingFields,
      profile: {
        full_name: row.contact_name ?? '',
        email: row.email ?? '',
        is_business: isBusiness,
        business_name: row.business_name ?? '',
        gstin,
        phone: row.phone ?? '',
        address_line1: addressField(row.billing_address, 'line1'),
        address_line2: addressField(row.billing_address, 'line2'),
        city: addressField(row.geography, 'city') || addressField(row.billing_address, 'city'),
        state: addressField(row.geography, 'state') || addressField(row.billing_address, 'state'),
        pincode: addressField(row.geography, 'pincode') || addressField(row.billing_address, 'pincode'),
      },
      documents: {
        shop_image_id: (shopImageRes.data as { id: string } | null)?.id ?? null,
        gst_certificate_id: (gstCertRes.data as { id: string } | null)?.id ?? null,
      },
    });
  } catch (error) {
    console.error('[GET /api/buyer/onboarding/resubmission-profile] unexpected error:', error);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
