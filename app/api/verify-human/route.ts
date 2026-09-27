import { NextRequest, NextResponse } from 'next/server';
import { clientIpFromRequest } from '@/lib/server/public-catalog-rate-limit';
import { createHumanVerifiedToken, HUMAN_VERIFIED_COOKIE, HUMAN_VERIFIED_TTL_SECONDS } from '@/lib/server/human-verify-token';

/**
 * POST /api/verify-human
 * Body: { turnstile_token: string }
 *
 * Verifies a Turnstile solve and, on success, sets a signed cookie proving
 * this IP is human for the next hour — middleware checks it before
 * re-triggering the enumeration challenge, so a real visitor who trips the
 * rate limit only ever solves this once per session, not per request.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { turnstile_token?: string } | null;
  const turnstileToken = body?.turnstile_token;
  if (!turnstileToken) {
    return NextResponse.json({ error: 'turnstile_token is required' }, { status: 400 });
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Not configured — fail closed rather than silently granting verification.
    return NextResponse.json({ error: 'Verification is not configured' }, { status: 500 });
  }

  const tsRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: turnstileToken }).toString(),
  });
  const tsData = await tsRes.json() as { success: boolean };
  if (!tsData.success) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
  }

  const ip = clientIpFromRequest(request.headers);
  const token = await createHumanVerifiedToken(ip);

  const response = NextResponse.json({ success: true });
  response.cookies.set(HUMAN_VERIFIED_COOKIE, token, {
    httpOnly: true,
    path: '/',
    maxAge: HUMAN_VERIFIED_TTL_SECONDS,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}
