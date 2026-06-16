import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { email } = body as { email?: string };
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  // Derive the app origin from the incoming request so this works in all envs
  const origin = request.nextUrl.origin;

  // Fire and forget — never reveal whether the email is registered
  await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${origin}/api/auth/callback?next=/reset-password`,
  });

  return NextResponse.json({ success: true });
}
