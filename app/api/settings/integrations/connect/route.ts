import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { connectTenantIntegration } from '@/lib/integrations/server';
import { supabaseAdmin } from '@/lib/supabase';

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

    const payload = await connectTenantIntegration(claims.tenant_id, claims.sub, body, request.headers.get('authorization'));

    if (supabaseAdmin) {
      const record = body as Record<string, unknown>;
      const { error: auditError } = await supabaseAdmin.schema('app').from('audit_log').insert({
        tenant_id: claims.tenant_id,
        actor_user_id: claims.sub,
        entity_type: 'tenant_integration',
        entity_id: typeof record.integration_type_id === 'string' ? record.integration_type_id : claims.tenant_id,
        action: 'connect',
        diff: { integration_type_id: record.integration_type_id ?? null },
        ts: new Date().toISOString(),
      });
      if (auditError) console.error('[integrations/connect] audit', auditError);
    }

    return NextResponse.json({ data: payload, error: null }, { status: 200 });
  } catch (error) {
    console.error('[POST /api/settings/integrations/connect]', error);
    return jsonError(400, error instanceof Error ? error.message : 'Failed to connect integration', 'CONNECT_FAILED');
  }
}
