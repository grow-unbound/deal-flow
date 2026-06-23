import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { getFlag, FLAGS } from '@/lib/flags';
import { loadIntegrationsSettingsPayload } from '@/lib/integrations/server';

function jsonError(status: number, message: string, code = 'ERROR') {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id) return jsonError(401, 'Login required', 'UNAUTHORIZED');
    if (claims.role !== 'seller_admin') return jsonError(403, 'Admin only', 'FORBIDDEN');
    const [flagEnabled, payload] = await Promise.all([
      getFlag(FLAGS.INTEGRATIONS, claims.tenant_id),
      loadIntegrationsSettingsPayload(claims.tenant_id),
    ]);

    if (!flagEnabled && !payload.catalog.some((integration) => integration.integration !== null)) {
      return jsonError(403, 'Integrations are not enabled for this tenant', 'FEATURE_OFF');
    }
    return NextResponse.json({ data: payload, error: null }, { status: 200 });
  } catch (error) {
    console.error('[GET /api/settings/integrations]', error);
    return jsonError(500, error instanceof Error ? error.message : 'Failed to load integrations', 'LOAD_FAILED');
  }
}
