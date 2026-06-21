import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { getFlag, FLAGS } from '@/lib/flags';
import { startIntegrationSync } from '@/lib/integrations/server';

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

    const jobId = await startIntegrationSync(claims.tenant_id, claims.sub, body);
    return NextResponse.json({ data: { job_id: jobId }, error: null }, { status: 202 });
  } catch (error) {
    const msg =
      error instanceof Error
        ? error.message
        : typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message
          : JSON.stringify(error);
    console.error('[POST /api/settings/integrations/sync]', error);
    return jsonError(400, msg, 'SYNC_FAILED');
  }
}
