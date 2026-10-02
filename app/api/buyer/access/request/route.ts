import { NextRequest, NextResponse } from 'next/server';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { loadAccessAccounts } from '@/lib/server/buyer-access-accounts';
import { queueAccessRequestReceivedMessages } from '@/lib/server/buyer-approval-notify';
import { supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';

const BodySchema = z.object({ buyer_id: z.string().uuid().optional() });

/**
 * POST /api/buyer/access/request
 *
 * An existing buyer (seller/ERP-created, buyer_app_enabled = false) asks the seller to switch their
 * Buyer App access on, from /pending. There is no intake form for them — app.request_buyer_app_access
 * raises the approval entry (flagged existing_buyer_access, with a sales/demand/dues snapshot) and
 * this route then notifies the seller admin and the buyer via the same WhatsApp templates the
 * self-registration flow uses. Idempotent: a second tap while the first request is still open
 * returns already_requested and sends nothing.
 *
 * Body (optional): { buyer_id } — when the caller's phone has several accounts at this tenant they
 * choose which one to ask for. It must be one of the caller's own accounts (OTP-verified phone, see
 * loadAccessAccounts) that is currently requestable; the default is the session's own buyer.
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

    let requested: unknown = {};
    try {
      requested = await request.json();
    } catch {
      requested = {};
    }
    const parsedBody = BodySchema.safeParse(requested ?? {});
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Invalid account selection' }, { status: 400 });
    }

    // Default: the session's own buyer. A different buyer_id is only honoured when it is one of
    // this caller's accounts at this tenant and still in a requestable state.
    let targetBuyerId = profile.buyer.id;
    if (parsedBody.data.buyer_id && parsedBody.data.buyer_id !== profile.buyer.id) {
      const { accounts } = await loadAccessAccounts(profile.context);
      const target = accounts.find((account) => account.buyer_id === parsedBody.data.buyer_id);
      if (!target || target.state !== 'can_request') {
        return NextResponse.json({ error: 'That account is not available to request access for.' }, { status: 403 });
      }
      targetBuyerId = target.buyer_id;
    }

    const { data, error } = await (supabaseAdmin as any)
      .schema('app')
      .rpc('request_buyer_app_access', { p_buyer_id: targetBuyerId });

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
      await queueAccessRequestReceivedMessages(supabaseAdmin, profile.context.tenant_id, targetBuyerId);
    } catch (notifyError) {
      console.error('[POST /api/buyer/access/request] access-request-received notify failed', notifyError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[POST /api/buyer/access/request] unexpected error', error);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
