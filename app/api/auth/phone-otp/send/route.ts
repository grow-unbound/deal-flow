import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isValidIndianMobile, normalizeIndianPhone } from '@/lib/phone';
import { findAllLoginCandidates, findBuyerLoginCandidates } from '@/lib/server/buyer-access';
import { buyerOtpStore } from '@/lib/server/buyer-otp-store';
import { sendLoginOtpWhatsapp } from '@/lib/server/whatsapp';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * POST /api/auth/phone-otp/send
 * Body: { phoneNumber: string }
 *
 * Looks up the phone across both app.tenant_users (sellers) and app.buyers/buyer_users (buyers).
 * Sellers are always eligible if active. Buyers require buyer_app_enabled + tenant flag.
 * Seller takes priority when the same auth user appears in both tables.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { phoneNumber?: string };
    const raw: string = (body?.phoneNumber ?? '').trim();

    if (!raw || !isValidIndianMobile(raw)) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    const phone = normalizeIndianPhone(raw);
    const allCandidates = await findAllLoginCandidates(phone);

    if (allCandidates.length === 0) {
      // Re-run buyer-only lookup to produce contextual blocked messages
      const buyerCandidates = await findBuyerLoginCandidates(phone);

      if (buyerCandidates.length === 0) {
        return NextResponse.json({
          ref_id: null,
          registered: false,
          message: "This number isn't registered. Contact your distributor.",
        });
      }

      const tenantBlocked = buyerCandidates.filter((c) => !c.tenant_app_enabled);
      const buyerBlocked = buyerCandidates.filter((c) => c.tenant_app_enabled && !c.buyer_app_enabled);

      if (tenantBlocked.length > 0) {
        const tenantName = tenantBlocked[0].tenant_name;
        return NextResponse.json({
          ref_id: null,
          registered: false,
          message: `Distributor ${tenantName} does not allow buyer app access. Please check with them.`,
        });
      }

      if (buyerBlocked.length > 0) {
        const tenantName = buyerBlocked[0].tenant_name;
        return NextResponse.json({
          ref_id: null,
          registered: false,
          message: `Request distributor ${tenantName} to enable buyer app access for your account.`,
        });
      }

      return NextResponse.json({
        ref_id: null,
        registered: false,
        message: "This number isn't registered. Contact your distributor.",
      });
    }

    const otp = String(crypto.randomInt(100000, 999999));
    const ref_id = crypto.randomUUID();

    buyerOtpStore.set(ref_id, {
      kind: 'pending',
      otp,
      phone,
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0,
      candidates: allCandidates,
    });

    await sendLoginOtpWhatsapp(phone, otp);

    return NextResponse.json({ ref_id, registered: true, message: 'OTP sent' });
  } catch (err) {
    console.error('[phone-otp/send] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
