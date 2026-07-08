import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { sendAccountVerificationOtpWhatsapp } from '@/lib/server/account-verification';

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

  const result = await sendAccountVerificationOtpWhatsapp({ user_id, tenant_id, email, phone });
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ success: true });
}
