import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { otpStore } from '../send/route';
import { getPostHogClient } from '@/lib/posthog-server';

const MAX_ATTEMPTS = 5;

interface BuyerContext {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  buyer_id: string;
  role: string;
}

/**
 * POST /api/auth/phone-otp/verify
 * Body: { ref_id: string; otp: string }
 * Returns:
 *   single context  → { success: true; redirect: string }
 *   multi  contexts → { success: true; contexts: BuyerContext[]; ref_id: string }
 *   error           → { error: string } with appropriate status
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ref_id: string = (body?.ref_id ?? '').trim();
    const otp: string = (body?.otp ?? '').trim();

    if (!ref_id || !otp) {
      return NextResponse.json({ error: 'ref_id and otp are required' }, { status: 400 });
    }

    const record = otpStore.get(ref_id);

    if (!record) {
      return NextResponse.json({ error: 'Invalid or expired OTP session' }, { status: 400 });
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(ref_id);
      return NextResponse.json({ error: 'OTP has expired. Request a new one.' }, { status: 400 });
    }

    record.attempts += 1;

    if (record.attempts > MAX_ATTEMPTS) {
      otpStore.delete(ref_id);
      return NextResponse.json(
        { error: 'Too many incorrect attempts. Request a new OTP.' },
        { status: 429 }
      );
    }

    if (record.otp !== otp) {
      return NextResponse.json(
        { error: `Incorrect OTP. ${MAX_ATTEMPTS - record.attempts} attempt(s) remaining.` },
        { status: 400 }
      );
    }

    // OTP valid — look up all buyer contexts for this phone number
    otpStore.delete(ref_id);

    const db = supabaseAdmin ?? supabase;
    const { data: rows, error: dbError } = await db
      .schema('app')
      .from('buyer_users')
      .select(`
        id,
        role,
        buyer_id,
        buyers!inner (
          id,
          tenant_id,
          tenants!inner ( id, name, slug )
        )
      `)
      .eq('phone', record.phone);

    if (dbError) {
      console.error('[phone-otp/verify] buyer context lookup error:', dbError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: 'No buyer account found for this number.' },
        { status: 403 }
      );
    }

    // Shape buyer contexts
    const contexts: BuyerContext[] = rows.map((r: Record<string, unknown>) => {
      const buyer = r.buyers as Record<string, unknown>;
      const tenant = buyer?.tenants as Record<string, unknown>;
      return {
        tenant_id: String(buyer?.tenant_id ?? ''),
        tenant_name: String(tenant?.name ?? ''),
        tenant_slug: String(tenant?.slug ?? ''),
        buyer_id: String(r.buyer_id ?? ''),
        role: String(r.role ?? 'buyer_assistant'),
      };
    });

    // Store a short-lived verified token so select-context can trust the selection
    const verified_ref = `v_${ref_id}`;
    otpStore.set(verified_ref, {
      otp: 'VERIFIED',
      phone: record.phone,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 min to pick context
      attempts: 0,
    });

    try {
      const ph = getPostHogClient();
      const ctx = contexts[0];
      ph.capture({
        distinctId: ctx.buyer_id,
        event: 'buyer_otp_verified',
        properties: {
          tenant_count: contexts.length,
          tenant_id: ctx.tenant_id,
          role: ctx.role,
        },
      });
      await ph.flush();
    } catch {
      // non-blocking
    }

    if (contexts.length === 1) {
      // Build redirect directly
      const ctx = contexts[0];
      const redirect = `/shop?tenant=${ctx.tenant_slug}`;
      return NextResponse.json({ success: true, redirect });
    }

    return NextResponse.json({
      success: true,
      contexts,
      ref_id: verified_ref,
    });
  } catch (err) {
    console.error('[phone-otp/verify] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
