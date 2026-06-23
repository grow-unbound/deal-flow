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

  // Send password recovery email
  // The redirectTo URL should match what's configured in Supabase project settings
  // under Authentication > URL Configuration > Redirect URLs
  await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${origin}/api/auth/callback`,
  });

  return NextResponse.json({ success: true });
}
