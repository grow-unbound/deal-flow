import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { sendLoginOtpWhatsapp } from '@/lib/server/whatsapp';

const SendBodySchema = z.object({
  user_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  email: z.string().email(),
  phone: z.string(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = SendBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  }

  const { user_id, tenant_id, email, phone } = parsed.data;

  // Rate-limit: max 5 WhatsApp OTP sends per user in the last hour
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .schema('app')
    .from('email_verification_otps')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user_id)
    .eq('channel', 'whatsapp')
    .gte('created_at', hourAgo);

  if ((count ?? 0) >= 5) {
    return NextResponse.json(
      { error: 'Too many OTP requests. Please wait before trying again.' },
      { status: 429 }
    );
  }

  // Invalidate any existing unverified OTPs for this user
  await supabaseAdmin
    .schema('app')
    .from('email_verification_otps')
    .delete()
    .eq('user_id', user_id)
    .eq('channel', 'whatsapp')
    .is('verified_at', null);

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error: insertError } = await supabaseAdmin
    .schema('app')
    .from('email_verification_otps')
    .insert({
      user_id,
      tenant_id,
      email,
      phone,
      otp,
      expires_at: expiresAt,
      channel: 'whatsapp',
    });

  if (insertError) {
    return NextResponse.json({ error: 'Failed to create OTP' }, { status: 500 });
  }

  try {
    await sendLoginOtpWhatsapp(phone, otp, { tenantId: tenant_id });
  } catch {
    return NextResponse.json({ error: 'Failed to send WhatsApp OTP' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
