import { NextRequest, NextResponse } from 'next/server';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { supabaseAdmin } from '@/lib/supabase';
import { BuyerIntakeSchema } from '@/lib/zod';

/**
 * POST /api/buyer/onboarding/intake
 *
 * Submitted once by a self-registered (buyer_app_enabled = false) buyer from
 * /onboarding. Persists their details via app.submit_buyer_intake, which also
 * (re)fires the app.entries row — business_approval or new_user_login,
 * classified from the is_business flag this form sets — so the seller sees a
 * correctly-typed inbox entry. Yukti_Inbox_Feature-Spec_v1.md §7.1.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const profile = await requireBuyerAccessProfile(request);
    if (!profile?.context.tenant_id || !profile.buyer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Approval may have landed between page load and submit — nothing left to
    // capture, the buyer is simply no longer pending. Let the client re-check
    // /api/buyer/me and route itself from there instead of erroring.
    if (profile.buyer.buyer_app_enabled !== false) {
      return NextResponse.json({ success: true, already_approved: true });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = BuyerIntakeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid details' }, { status: 422 });
    }
    const data = parsed.data;

    const geography = {
      city: data.city || undefined,
      state: data.state || undefined,
      pincode: data.pincode || undefined,
    };
    const billingAddress = {
      line1: data.address_line1 || undefined,
      line2: data.address_line2 || undefined,
      city: data.city || undefined,
      state: data.state || undefined,
      pincode: data.pincode || undefined,
    };

    const { error } = await (supabaseAdmin as any)
      .schema('app')
      .rpc('submit_buyer_intake', {
        p_buyer_id: profile.buyer.id,
        p_full_name: data.full_name,
        p_email: data.email || null,
        p_is_business: data.is_business,
        p_business_name: data.is_business ? data.business_name : null,
        p_gstin: data.gstin || null,
        p_geography: geography,
        p_billing_address: billingAddress,
        p_document_ids: data.document_ids && data.document_ids.length > 0 ? data.document_ids : null,
      });

    if (error) {
      console.error('[POST /api/buyer/onboarding/intake] rpc failed', error);
      return NextResponse.json({ error: 'Failed to submit your details. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[POST /api/buyer/onboarding/intake] unexpected error', error);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
