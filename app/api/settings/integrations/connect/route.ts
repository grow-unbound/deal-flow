import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { getFlag, FLAGS } from '@/lib/flags';
import { connectTenantIntegration } from '@/lib/integrations/server';

function jsonError(status: number, message: string, code = 'ERROR') {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) return jsonError(401, 'Login required', 'UNAUTHORIZED');
    if (claims.role !== 'seller_admin') return jsonError(403, 'Admin only', 'FORBIDDEN');
    if (!(await getFlag(FLAGS.INTEGRATIONS, claims.tenant_id))) {
      return jsonError(403, 'Integrations are not enabled for this tenant', 'FEATURE_OFF');
    }

    const body = await request.json().catch(() => null);
    if (!body) return jsonError(400, 'Invalid JSON', 'BAD_REQUEST');

    const payload = await connectTenantIntegration(claims.tenant_id, claims.sub, body);
    return NextResponse.json({ data: payload, error: null }, { status: 200 });
  } catch (error) {
    console.error('[POST /api/settings/integrations/connect]', error);
    return jsonError(400, error instanceof Error ? error.message : 'Failed to connect integration', 'CONNECT_FAILED');
  }
}
