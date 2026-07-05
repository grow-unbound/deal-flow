import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

function jsonError(status: number, message: string, code = 'ERROR') {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

// Read-only visibility into app.tenant_field_mappings for the Zoho integration
// settings UI (see supabase/migrations/20260705040222_add_zoho_field_mappings_and_buyer_app_flags.sql).
// Add/edit UI is deferred — the 3 system-seeded mappings are the only rows
// that exist today.
export async function GET(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id) return jsonError(401, 'Login required', 'UNAUTHORIZED');

    const tenantIntegrationId = request.nextUrl.searchParams.get('tenant_integration_id');
    if (!tenantIntegrationId) return jsonError(400, 'tenant_integration_id is required', 'BAD_REQUEST');

    const { data, error } = await (supabaseAdmin as any)
      .schema('app')
      .from('tenant_field_mappings')
      .select('id, entity_type, zoho_field_name, target_column, transform_type, is_active, is_system')
      .eq('tenant_id', claims.tenant_id)
      .eq('tenant_integration_id', tenantIntegrationId)
      .order('entity_type', { ascending: true });

    if (error) {
      console.error('[GET /api/settings/integrations/field-mappings]', error);
      return jsonError(500, 'Failed to load field mappings', 'LOAD_FAILED');
    }

    return NextResponse.json({ data: data ?? [], error: null }, { status: 200 });
  } catch (error) {
    console.error('[GET /api/settings/integrations/field-mappings]', error);
    return jsonError(500, error instanceof Error ? error.message : 'Failed to load field mappings', 'LOAD_FAILED');
  }
}
