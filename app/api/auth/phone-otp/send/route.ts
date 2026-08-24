import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { isValidIndianMobile, normalizeIndianPhone } from '@/lib/phone';
import { findAllLoginCandidates, findBuyerLoginCandidates } from '@/lib/server/buyer-access';
import { buyerOtpStore } from '@/lib/server/buyer-otp-store';
import { sendLoginOtpWhatsapp } from '@/lib/server/whatsapp';
import { AUTH_LOGIN_COPY, buildRequestAccessMessage } from '@/constants/auth-login-copy';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_SEND_COOLDOWN_MS = 45 * 1000; // 45 seconds between sends to the same phone

type PhoneOtpSendResponse =
  | { ref_id: string; registered: true; outcome: 'otp_sent'; message: string }
  | {
      ref_id: null;
      registered: false;
      outcome: 'unregistered' | 'seller_disabled' | 'buyer_disabled';
      message: string;
      seller_name: string | null;
      seller_whatsapp_number: string | null;
      buyer_name: string | null;
    };

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
    const payload = await request.json() as { phoneNumber?: string };
    const raw: string = (payload?.phoneNumber ?? '').trim();

    if (!raw || !isValidIndianMobile(raw)) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    const phone = normalizeIndianPhone(raw);

    // Per-phone cooldown — prevents OTP-bombing a victim's number (each send costs a
    // WhatsApp API call and re-annoys the recipient). Checked before any candidate
    // lookup so a spammed phone doesn't pay for that work either.
    const cooldownRemaining = await buyerOtpStore.sendCooldownRemainingMs(phone, OTP_SEND_COOLDOWN_MS, OTP_TTL_MS);
    if (cooldownRemaining > 0) {
      return NextResponse.json(
        { error: 'Please wait before requesting another OTP', retry_after_ms: cooldownRemaining },
        { status: 429 },
      );
    }

    const allCandidates = await findAllLoginCandidates(phone);

    if (allCandidates.length === 0) {
      // Re-run buyer-only lookup to produce contextual blocked messages
      const buyerCandidates = await findBuyerLoginCandidates(phone);

      if (buyerCandidates.length === 0) {
        const responseBody: PhoneOtpSendResponse = {
          ref_id: null,
          registered: false,
          outcome: 'unregistered',
          message: AUTH_LOGIN_COPY.resolution.unregistered.title,
          seller_name: null,
          seller_whatsapp_number: null,
          buyer_name: null,
        };
        return NextResponse.json(responseBody);
      }

      const tenantBlocked = buyerCandidates.filter((c) => !c.tenant_app_enabled);
      const buyerBlocked = buyerCandidates.filter((c) => c.tenant_app_enabled && !c.buyer_app_enabled);

      const blockedCandidate = tenantBlocked[0] ?? buyerBlocked[0] ?? null;
      if (blockedCandidate) {
        const sellerName = blockedCandidate.tenant_name;
        const sellerWhatsappNumber = blockedCandidate.tenant_whatsapp_number ?? null;
        const buyerName = blockedCandidate.contact_name?.trim() || blockedCandidate.business_name || null;
        const outcome = tenantBlocked.length > 0 ? 'seller_disabled' : 'buyer_disabled';
        const message = buildRequestAccessMessage({
          sellerName,
          buyerName,
        });

        const responseBody: PhoneOtpSendResponse = {
          ref_id: null,
          registered: false,
          outcome,
          message,
          seller_name: sellerName,
          seller_whatsapp_number: sellerWhatsappNumber,
          buyer_name: buyerName,
        };
        return NextResponse.json(responseBody);
      }

      const responseBody: PhoneOtpSendResponse = {
        ref_id: null,
        registered: false,
        outcome: 'unregistered',
        message: AUTH_LOGIN_COPY.resolution.unregistered.title,
        seller_name: null,
        seller_whatsapp_number: null,
        buyer_name: null,
      };
      return NextResponse.json(responseBody);
    }

    const otp = String(crypto.randomInt(100000, 999999));

    const ref_id = await buyerOtpStore.insert({
      kind: 'pending',
      otp,
      phone,
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0,
      candidates: allCandidates,
    });

    if (!ref_id) {
      return NextResponse.json({ error: 'Failed to create OTP session' }, { status: 500 });
    }

    await sendLoginOtpWhatsapp(phone, otp);

    const responseBody: PhoneOtpSendResponse = { ref_id, registered: true, outcome: 'otp_sent', message: 'OTP sent' };
    return NextResponse.json(responseBody);
  } catch (err) {
    console.error('[phone-otp/send] unexpected error:', err);
    Sentry.captureException(err, { tags: { area: 'whatsapp_otp' } });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
