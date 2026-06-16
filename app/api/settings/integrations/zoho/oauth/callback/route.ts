import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase';

interface ZohoTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  message?: string;
}

interface OAuthStateRow {
  tenant_id: string;
  integration_type_id: string;
  org_id: string;
}

function getZohoAccountsBaseUrl() {
  const dc = (process.env.ZOHO_DC ?? 'in').toLowerCase();
  return `https://accounts.zoho.${dc}`;
}

function getAppUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
}

function getSupabaseFunctionsUrl() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
  return `${supabaseUrl}/functions/v1`;
}

function redirectWithError(error: string) {
  return NextResponse.redirect(
    `${getAppUrl()}/settings/integrations?oauth_error=${encodeURIComponent(error)}`,
  );
}

async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<ZohoTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.ZOHO_OAUTH_CLIENT_ID ?? '',
    client_secret: process.env.ZOHO_OAUTH_CLIENT_SECRET ?? '',
    redirect_uri: redirectUri,
    code,
  });

  const response = await fetch(`${getZohoAccountsBaseUrl()}/oauth/v2/token`, {
    method: 'POST',
    body,
  });

  return response.json() as Promise<ZohoTokenResponse>;
}

async function registerZohoWebhook(
  accessToken: string,
  orgId: string,
  dc: string,
  webhookUrl: string,
  integrationTypeId: string,
): Promise<string | null> {
  const module = integrationTypeId === 'zoho_inventory' ? 'inventory/v1' : 'books/v3';
  const url = new URL(`/${module}/settings/webhooks`, `https://www.zohoapis.${dc}`);
  url.searchParams.set('organization_id', orgId);

  const events =
    integrationTypeId === 'zoho_inventory'
      ? ['item.created', 'item.updated', 'item.deleted']
      : [
          'invoice.created', 'invoice.updated',
          'salesorder.created', 'salesorder.updated',
          'estimate.created', 'estimate.updated',
          'contact.created', 'contact.updated',
          'item.created', 'item.updated',
        ];

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      webhook_name: 'Yukti live sync',
      address: webhookUrl,
      events,
      notification_format: 'json',
      is_active: true,
    }),
  });

  if (!response.ok) {
    console.warn('[zoho/oauth/callback] Webhook registration failed:', response.status);
    return null;
  }

  const json = await response.json() as Record<string, unknown>;
  const inner = json.webhook as Record<string, unknown> | undefined;
  const webhookId = inner?.webhook_id;
  return typeof webhookId === 'string' ? webhookId : null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const stateToken = searchParams.get('state');
  const oauthError = searchParams.get('error');

  if (oauthError) return redirectWithError(`Zoho denied access: ${oauthError}`);
  if (!code || !stateToken) return redirectWithError('Missing OAuth code or state');

  const db = supabaseAdmin;
  if (!db) return redirectWithError('Server configuration error');

  const clientId = process.env.ZOHO_OAUTH_CLIENT_ID;
  const clientSecret = process.env.ZOHO_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return redirectWithError('Zoho OAuth is not configured on this server');

  // Validate and consume the CSRF state token
  const { data: stateRow, error: stateError } = await db
    .schema('app')
    .from('integration_oauth_states')
    .select('tenant_id, integration_type_id, org_id')
    .eq('state_token', stateToken)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (stateError || !stateRow) {
    return redirectWithError('OAuth state is invalid or expired. Please try connecting again.');
  }

  const { tenant_id, integration_type_id, org_id } = stateRow as OAuthStateRow;

  // Delete consumed state token immediately (one-time use)
  await db
    .schema('app')
    .from('integration_oauth_states')
    .delete()
    .eq('state_token', stateToken);

  // Exchange authorization code for access_token + refresh_token
  const redirectUri = `${getAppUrl()}/api/settings/integrations/zoho/oauth/callback`;
  const tokens = await exchangeCodeForTokens(code, redirectUri);

  if (tokens.error || !tokens.access_token || !tokens.refresh_token) {
    console.error('[zoho/oauth/callback] Token exchange failed:', tokens.error ?? 'missing tokens');
    return redirectWithError('Failed to exchange authorization code. Please try again.');
  }

  const dc = (process.env.ZOHO_DC ?? 'in').toLowerCase();
  const now = new Date().toISOString();

  // Upsert tenant_integrations row (must exist before storing the vault secret)
  const { data: existing } = await db
    .schema('app')
    .from('tenant_integrations')
    .select('id')
    .eq('tenant_id', tenant_id)
    .eq('integration_type_id', integration_type_id)
    .is('deleted_at', null)
    .maybeSingle();

  let integrationId: string;

  if (existing?.id) {
    integrationId = existing.id;
    await db
      .schema('app')
      .from('tenant_integrations')
      .update({
        status: 'connected',
        config: { org_id, provider: 'zoho', auth_method: 'oauth' },
        connected_at: now,
        last_health_check_at: now,
        health_status: 'ok',
        updated_at: now,
      })
      .eq('id', integrationId);
  } else {
    const { data: inserted, error: insertError } = await db
      .schema('app')
      .from('tenant_integrations')
      .insert({
        tenant_id,
        integration_type_id,
        status: 'connected',
        config: { org_id, provider: 'zoho', auth_method: 'oauth' },
        connected_at: now,
        last_health_check_at: now,
        health_status: 'ok',
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      console.error('[zoho/oauth/callback] Failed to create tenant_integration:', insertError);
      return redirectWithError('Failed to save integration. Please try again.');
    }
    integrationId = inserted.id;
  }

  // Store refresh_token + platform credentials in Vault (per-tenant, server-only)
  const { error: secretError } = await db.rpc('upsert_tenant_integration_secret', {
    p_tenant_integration_id: integrationId,
    p_actor_user_id: null as unknown as string,
    p_secret: {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
      org_id,
      region: dc,
    },
    p_secret_name: `${integration_type_id}_${tenant_id}`,
  });

  if (secretError) {
    console.error('[zoho/oauth/callback] Failed to store secret:', secretError);
    return redirectWithError('Failed to securely store credentials. Please try again.');
  }

  // Register webhook with Zoho and record endpoint_token (non-fatal if it fails)
  try {
    // Check for an existing active webhook to avoid duplicates on reconnect
    const { data: existingWebhook } = await db
      .schema('app')
      .from('integration_webhooks')
      .select('id, endpoint_token')
      .eq('tenant_integration_id', integrationId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle();

    const eventTypes =
      integration_type_id === 'zoho_inventory'
        ? ['item.created', 'item.updated', 'item.deleted']
        : ['invoice.created', 'invoice.updated', 'salesorder.created', 'salesorder.updated',
           'estimate.created', 'estimate.updated', 'contact.created', 'contact.updated',
           'item.created', 'item.updated'];

    let endpointToken: string;
    let webhookRowId: string;

    if (existingWebhook) {
      endpointToken = existingWebhook.endpoint_token as string;
      webhookRowId = existingWebhook.id as string;
    } else {
      const { data: newWebhook, error: webhookInsertError } = await db
        .schema('app')
        .from('integration_webhooks')
        .insert({ tenant_id, tenant_integration_id: integrationId, event_types: eventTypes, is_active: true })
        .select('id, endpoint_token')
        .single();

      if (webhookInsertError || !newWebhook) throw webhookInsertError ?? new Error('webhook insert failed');
      endpointToken = newWebhook.endpoint_token as string;
      webhookRowId = newWebhook.id as string;
    }

    const webhookUrl = `${getSupabaseFunctionsUrl()}/integrations-webhook?endpoint_token=${endpointToken}`;
    const zohoWebhookId = await registerZohoWebhook(tokens.access_token, org_id, dc, webhookUrl, integration_type_id);

    if (zohoWebhookId) {
      await db
        .schema('app')
        .from('integration_webhooks')
        .update({ external_ref: zohoWebhookId })
        .eq('id', webhookRowId);
    }
  } catch (webhookError) {
    // Sync still works without live webhooks (falls back to scheduled incremental sync)
    console.warn('[zoho/oauth/callback] Webhook registration skipped:', webhookError);
  }

  return NextResponse.redirect(
    `${getAppUrl()}/settings/integrations?connected=${encodeURIComponent(integration_type_id)}`,
  );
}
