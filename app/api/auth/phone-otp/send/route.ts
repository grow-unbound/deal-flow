import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import crypto from 'crypto';

// Simple in-memory OTP store for development.
// In production replace with Redis or a DB-backed table.
// Key: ref_id → { otp, phone, expiresAt, attempts }
export const otpStore = new Map<
  string,
  { otp: string; phone: string; expiresAt: number; attempts: number }
>();

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * POST /api/auth/phone-otp/send
 * Body: { phoneNumber: string }
 * Returns:
 *   registered=true  → { ref_id: string; registered: true;  message: string }
 *   registered=false → { ref_id: null;   registered: false; message: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const raw: string = (body?.phoneNumber ?? '').trim();

    if (!raw || !/^\+?[0-9]{10,15}$/.test(raw)) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    // Normalise: strip leading +91 or 0, keep 10-digit form
    const phone = raw.replace(/^\+91/, '').replace(/^0/, '');

    // Check if this phone is registered as a buyer
    const { data: rows, error } = await supabase
      .schema('app')
      .from('buyer_users')
      .select('id')
      .eq('phone', phone)
      .limit(1);

    if (error) {
      console.error('[phone-otp/send] buyer_users lookup error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    const registered = Array.isArray(rows) && rows.length > 0;

    if (!registered) {
      return NextResponse.json({
        ref_id: null,
        registered: false,
        message: "This number isn't registered. Contact your distributor.",
      });
    }

    // Generate a 6-digit OTP and a ref_id
    const otp = String(crypto.randomInt(100000, 999999));
    const ref_id = crypto.randomUUID();

    otpStore.set(ref_id, {
      otp,
      phone,
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0,
    });

    // TODO: deliver OTP via AiSensy / Meta WhatsApp Cloud API
    // Development: log to console only
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV OTP] phone=${phone} otp=${otp} ref_id=${ref_id}`);
    }

    return NextResponse.json({ ref_id, registered: true, message: 'OTP sent' });
  } catch (err) {
    console.error('[phone-otp/send] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
