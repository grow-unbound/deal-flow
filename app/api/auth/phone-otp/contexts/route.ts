import { NextRequest, NextResponse } from 'next/server';
import { buyerOtpStore } from '@/lib/server/buyer-otp-store';

/**
 * GET /api/auth/phone-otp/contexts?ref_id=...
 * Reloads short-lived verified candidates for the multi-account picker.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const refId = request.nextUrl.searchParams.get('ref_id')?.trim() ?? '';
  const noStore = { 'Cache-Control': 'private, no-store' };

  if (!refId) {
    return NextResponse.json({ error: 'ref_id is required' }, { status: 400, headers: noStore });
  }

  const record = await buyerOtpStore.get(refId);
  if (!record || record.kind !== 'verified') {
    return NextResponse.json(
      { error: 'Context selection session expired. Please log in again.' },
      { status: 404, headers: noStore },
    );
  }

  if (Date.now() > record.expiresAt) {
    await buyerOtpStore.delete(refId);
    return NextResponse.json({ error: 'Session expired. Please log in again.' }, { status: 410, headers: noStore });
  }

  return NextResponse.json({ contexts: record.candidates }, { headers: noStore });
}
