import { NextRequest, NextResponse } from 'next/server';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { hasPhoneConsented, stampPhoneConsent } from '@/lib/server/phone-consent';

/**
 * POST /api/buyer/whatsapp-consent
 *
 * Stamps the buyer's explicit WhatsApp consent (§4.8 of
 * DealFlow_WhatsApp-Broadcast-Spec_v4.md). This is a ONE-TIME gate — once
 * whatsapp_consent_at is set it is never overwritten and the buyer client
 * (see /consent page) never shows the checkbox again.
 *
 * The client cannot skip this by simply not calling the endpoint: /api/buyer/me
 * reports whatsapp_consent_required=true until this stamps the row, and the
 * buyer app shell redirects to /consent whenever that flag is true.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const profile = await requireBuyerAccessProfile(request);
    if (!profile?.context.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!profile.buyer) {
      return NextResponse.json({ error: 'Buyer not found' }, { status: 404 });
    }

    let body: { agreed?: boolean };
    try {
      body = await request.json() as { agreed?: boolean };
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (body.agreed !== true) {
      return NextResponse.json(
        { error: 'You must check the box to agree to receive WhatsApp communication.' },
        { status: 422 },
      );
    }

    // Phone-level, one-time gate — never overwrite. Idempotent success.
    if (!profile.buyer.phone || await hasPhoneConsented(profile.buyer.phone)) {
      return NextResponse.json({ success: true, already_consented: true });
    }

    await stampPhoneConsent(profile.buyer.phone, 'explicit_checkbox_first_login', profile.buyer.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[POST /api/buyer/whatsapp-consent] unexpected error', error);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
