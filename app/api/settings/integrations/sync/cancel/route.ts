import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { cancelIntegrationSync } from '@/lib/integrations/server';

function jsonError(status: number, message: string, code = 'ERROR') {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) return jsonError(401, 'Login required', 'UNAUTHORIZED');
    if (claims.role !== 'seller_admin') return jsonError(403, 'Admin only', 'FORBIDDEN');

    const body = await request.json().catch(() => null);
    if (!body) return jsonError(400, 'Invalid JSON', 'BAD_REQUEST');

    const payload = await cancelIntegrationSync(claims.tenant_id, claims.sub, body, request.headers.get('authorization'));
    return NextResponse.json({ data: payload, error: null }, { status: 200 });
  } catch (error) {
    const msg =
      error instanceof Error
        ? error.message
        : typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message
          : 'Failed to cancel sync';
    console.error('[POST /api/settings/integrations/sync/cancel]', error);
    return jsonError(400, msg, 'CANCEL_FAILED');
  }
}
