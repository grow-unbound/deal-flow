import { NextRequest, NextResponse } from 'next/server';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { queueAccessRequestReceivedMessages } from '@/lib/server/buyer-approval-notify';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/buyer/access/request
 *
 * An existing buyer (seller/ERP-created, buyer_app_enabled = false) asks the seller to switch their
 * Buyer App access on, from /pending. There is no intake form for them — app.request_buyer_app_access
 * raises the approval entry (flagged existing_buyer_access, with a sales/demand/dues snapshot) and
 * this route then notifies the seller admin and the buyer via the same WhatsApp templates the
 * self-registration flow uses. Idempotent: a second tap while the first request is still open
 * returns already_requested and sends nothing.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const profile = await requireBuyerAccessProfile(request);
    if (!profile?.context.tenant_id || !profile.buyer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Approval may have landed between page load and tap — the client re-checks /api/buyer/me.
    if (profile.buyer.buyer_app_enabled !== false) {
      return NextResponse.json({ success: true, already_approved: true });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const { data, error } = await (supabaseAdmin as any)
      .schema('app')
      .rpc('request_buyer_app_access', { p_buyer_id: profile.buyer.id });

    if (error) {
      const message = String((error as { message?: string }).message ?? '');
      if (message.includes('not_an_existing_buyer')) {
        return NextResponse.json({ error: 'Please complete your registration details instead.' }, { status: 409 });
      }
      if (message.includes('access_request_declined')) {
        return NextResponse.json({ error: 'This request was declined. Please contact the seller.' }, { status: 409 });
      }
      console.error('[POST /api/buyer/access/request] rpc failed', error);
      return NextResponse.json({ error: 'Failed to send your request. Please try again.' }, { status: 500 });
    }

    const result = data as { entry_id?: string; already_requested?: boolean } | null;
    if (result?.already_requested) {
      return NextResponse.json({ success: true, already_requested: true });
    }

    // Non-critical: a WhatsApp outage must not fail an already-recorded request.
    try {
      await queueAccessRequestReceivedMessages(supabaseAdmin, profile.context.tenant_id, profile.buyer.id);
    } catch (notifyError) {
      console.error('[POST /api/buyer/access/request] access-request-received notify failed', notifyError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[POST /api/buyer/access/request] unexpected error', error);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
