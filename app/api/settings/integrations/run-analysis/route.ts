import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { runIntegrationAnalysis } from '@/lib/integrations/server';

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

    const payload = await runIntegrationAnalysis(claims.tenant_id, claims.sub, body);
    return NextResponse.json({ data: payload, error: null }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to run analysis';
    console.error('[POST /api/settings/integrations/run-analysis]', error);
    return jsonError(400, message, 'ANALYSIS_FAILED');
  }
}
