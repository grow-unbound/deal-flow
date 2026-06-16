import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

import { getVerifiedClaims } from '@/lib/auth';
import { getFlag, FLAGS } from '@/lib/flags';
import { supabaseAdmin } from '@/lib/supabase';

const ZOHO_SCOPES = [
  'ZohoBooks.contacts.ALL',
  'ZohoBooks.items.ALL',
  'ZohoBooks.salesorders.ALL',
  'ZohoBooks.invoices.ALL',
  'ZohoBooks.estimates.ALL',
  'ZohoBooks.settings.ALL',
].join(',');

function jsonError(status: number, message: string, code = 'ERROR') {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

function getZohoAccountsBaseUrl() {
  const dc = (process.env.ZOHO_DC ?? 'in').toLowerCase();
  return `https://accounts.zoho.${dc}`;
}

function getAppUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
}

export async function POST(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) return jsonError(401, 'Login required', 'UNAUTHORIZED');
    if (claims.role !== 'seller_admin') return jsonError(403, 'Admin only', 'FORBIDDEN');
    if (!(await getFlag(FLAGS.INTEGRATIONS, claims.tenant_id))) {
      return jsonError(403, 'Integrations are not enabled for this tenant', 'FEATURE_OFF');
    }
    if (!(await getFlag(FLAGS.ZOHO_INTEGRATION, claims.tenant_id))) {
      return jsonError(403, 'Zoho integration is not enabled for this tenant', 'FEATURE_OFF');
    }

    const clientId = process.env.ZOHO_OAUTH_CLIENT_ID;
    if (!clientId) return jsonError(500, 'Zoho OAuth is not configured on this server', 'NOT_CONFIGURED');

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const integrationTypeId = typeof body?.integration_type_id === 'string' ? body.integration_type_id : null;
    const orgId = typeof body?.org_id === 'string' ? body.org_id.trim() : null;

    if (!integrationTypeId || !['zoho_books', 'zoho_inventory'].includes(integrationTypeId)) {
      return jsonError(400, 'integration_type_id must be zoho_books or zoho_inventory', 'BAD_REQUEST');
    }
    if (!orgId) {
      return jsonError(400, 'org_id is required', 'BAD_REQUEST');
    }

    const db = supabaseAdmin;
    if (!db) return jsonError(500, 'Server configuration error', 'SERVER_ERROR');

    const stateToken = randomUUID();
    const { error } = await db
      .schema('app')
      .from('integration_oauth_states')
      .insert({
        state_token: stateToken,
        tenant_id: claims.tenant_id,
        integration_type_id: integrationTypeId,
        org_id: orgId,
      });

    if (error) {
      console.error('[zoho/oauth/start] Failed to insert OAuth state:', error);
      return jsonError(500, 'Failed to initiate OAuth flow', 'SERVER_ERROR');
    }

    const redirectUri = `${getAppUrl()}/api/settings/integrations/zoho/oauth/callback`;
    const authUrl = new URL('/oauth/v2/auth', getZohoAccountsBaseUrl());
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', ZOHO_SCOPES);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('state', stateToken);

    return NextResponse.json({ data: { redirect_url: authUrl.toString() }, error: null });
  } catch (error) {
    console.error('[POST /api/settings/integrations/zoho/oauth/start]', error);
    return jsonError(500, 'Failed to start Zoho OAuth flow', 'SERVER_ERROR');
  }
}
