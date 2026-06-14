import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isValidIndianMobile, normalizeIndianPhone } from '@/lib/phone';
import { findBuyerLoginCandidates } from '@/lib/server/buyer-access';
import { buyerOtpStore } from '@/lib/server/buyer-otp-store';
import { sendLoginOtpWhatsapp } from '@/lib/server/whatsapp';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * POST /api/auth/phone-otp/send
 * Body: { phoneNumber: string }
 *
 * Logic:
 * 1. Verify phone in app.buyers and app.buyer_users
 * 2. Check buyer.buyer_app_enabled AND tenant.df_buyer_app flag
 * 3. If both enabled: send OTP
 * 4. If tenant flag disabled: explain distributor blocked access
 * 5. If tenant flag enabled but buyer disabled: ask to request access
 *
 * Returns:
 *   eligible     → { ref_id: string; registered: true;  message: 'OTP sent' }
 *   tenant_block → { ref_id: null;   registered: false; message: 'Distributor <name> does not allow...' }
 *   buyer_block  → { ref_id: null;   registered: false; message: 'Request distributor <name> to enable...' }
 *   not_found    → { ref_id: null;   registered: false; message: 'This number isn't registered...' }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { phoneNumber?: string };
    const raw: string = (body?.phoneNumber ?? '').trim();

    if (!raw || !isValidIndianMobile(raw)) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    const phone = normalizeIndianPhone(raw);
    const allCandidates = await findBuyerLoginCandidates(phone);

    if (allCandidates.length === 0) {
      return NextResponse.json({
        ref_id: null,
        registered: false,
        message: "This number isn't registered. Contact your distributor.",
      });
    }

    // Separate candidates by eligibility
    const eligible = allCandidates.filter((c) => c.buyer_app_enabled && c.tenant_app_enabled);
    const tenantBlocked = allCandidates.filter((c) => !c.tenant_app_enabled);
    const buyerBlocked = allCandidates.filter((c) => c.tenant_app_enabled && !c.buyer_app_enabled);

    // If any are eligible, send OTP
    if (eligible.length > 0) {
      const otp = String(crypto.randomInt(100000, 999999));
      const ref_id = crypto.randomUUID();

      buyerOtpStore.set(ref_id, {
        kind: 'pending',
        otp,
        phone,
        expiresAt: Date.now() + OTP_TTL_MS,
        attempts: 0,
        candidates: eligible,
      });

      await sendLoginOtpWhatsapp(phone, otp);

      return NextResponse.json({ ref_id, registered: true, message: 'OTP sent' });
    }

    // If tenant blocked access
    if (tenantBlocked.length > 0) {
      const tenantName = tenantBlocked[0].tenant_name;
      return NextResponse.json({
        ref_id: null,
        registered: false,
        message: `Distributor ${tenantName} does not allow buyer app access. Please check with them.`,
      });
    }

    // If buyer blocked (tenant enabled but buyer disabled)
    if (buyerBlocked.length > 0) {
      const tenantName = buyerBlocked[0].tenant_name;
      return NextResponse.json({
        ref_id: null,
        registered: false,
        message: `Request distributor ${tenantName} to enable buyer app access for your account.`,
      });
    }

    // Fallback (shouldn't reach here)
    return NextResponse.json({
      ref_id: null,
      registered: false,
      message: "This number isn't registered. Contact your distributor.",
    });
  } catch (err) {
    console.error('[phone-otp/send] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
