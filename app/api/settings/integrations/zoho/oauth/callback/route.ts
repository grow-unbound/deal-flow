import { NextRequest, NextResponse } from 'next/server';

import {
  buildIntegrationDataFlowRows,
  buildIntegrationTopologyConfig,
} from '@/lib/integrations/definitions';
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
  requested_by: string | null;
}

type WebhookSetupState = {
  status: 'pending' | 'active' | 'failed';
  attempted_at: string;
  last_error: string | null;
  external_ref: string | null;
  last_success_at: string | null;
};

function getZohoAccountsBaseUrl() {
  const dc = (process.env.ZOHO_DC ?? 'in').toLowerCase();
  return `https://accounts.zoho.${dc}`;
}

function getAppOrigin(request: NextRequest) {
  return new URL(request.url).origin.replace(/\/+$/, '');
}

function getSupabaseFunctionsUrl() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
  return `${supabaseUrl}/functions/v1`;
}

function escapeHtml(value: string) {
  return value
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&#39;');
}

function renderResultPage(input: {
  title: string;
  message: string;
  detail?: string | null;
  kind: 'success' | 'error';
  integrationTypeId?: string | null;
  appOrigin: string;
}) {
  const message = escapeHtml(input.message);
  const detail = input.detail ? escapeHtml(input.detail) : '';
  const integrationTypeId = input.integrationTypeId ? escapeHtml(input.integrationTypeId) : '';
  const statusKey = input.kind === 'success' ? 'df_zoho_oauth_complete' : 'df_zoho_oauth_error';
  const statusValue = input.kind === 'success'
    ? input.integrationTypeId ?? ''
    : JSON.stringify({ message: input.message, detail: input.detail ?? null });
  const resultPayload = JSON.stringify({
    kind: input.kind,
    title: input.title,
    message: input.message,
    detail: input.detail ?? null,
    integration_type_id: input.integrationTypeId ?? null,
  });

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f7f3ec;
        --card: #ffffff;
        --text: #1f2933;
        --muted: #637083;
        --border: #e4ddd3;
        --success: #0f9d74;
        --error: #cc4b37;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(135deg, #f7f3ec 0%, #f3efe7 100%);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        color: var(--text);
      }
      main {
        width: min(560px, calc(100vw - 32px));
        border: 1px solid var(--border);
        border-radius: 24px;
        background: var(--card);
        box-shadow: 0 20px 60px rgba(31, 41, 51, 0.12);
        padding: 32px;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        padding: 8px 14px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin-bottom: 18px;
      }
      .pill.success { background: rgba(15, 157, 116, 0.12); color: var(--success); }
      .pill.error { background: rgba(204, 75, 55, 0.12); color: var(--error); }
      h1 { margin: 0; font-size: 28px; line-height: 1.2; }
      p { margin: 14px 0 0; color: var(--muted); line-height: 1.7; font-size: 15px; }
      .detail {
        margin-top: 18px;
        border: 1px solid var(--border);
        border-radius: 18px;
        background: #fbfaf7;
        padding: 14px 16px;
        color: var(--text);
        font-size: 14px;
        line-height: 1.6;
        white-space: pre-wrap;
      }
      .actions {
        margin-top: 24px;
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      button, a {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: 12px 16px;
        font-weight: 700;
        font-size: 14px;
        cursor: pointer;
        text-decoration: none;
      }
      button {
        background: #0f9d74;
        color: white;
      }
      a {
        background: #f1ede5;
        color: #324154;
      }
      .note {
        margin-top: 16px;
        font-size: 12px;
        color: var(--muted);
      }
      code {
        padding: 2px 6px;
        border-radius: 6px;
        background: #f1ede5;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="pill ${input.kind}">${input.kind === 'success' ? 'Connection ready' : 'Connection failed'}</div>
      <h1>${message}</h1>
      <p>${input.kind === 'success' ? 'You can close this page, the connection is setup.' : 'Please return to Yukti and try the connection again.'}</p>
      ${detail ? `<div class="detail">${detail}</div>` : ''}
      <div class="actions">
        <a href="${escapeHtml(`${input.appOrigin}/settings/integrations`)}">Go back to Yukti</a>
      </div>
      <div class="note">This page updates your Yukti tab automatically.</div>
    </main>
    <script>
      try {
        localStorage.setItem(${JSON.stringify(statusKey)}, ${JSON.stringify(statusValue)});
      } catch (error) {}
      try {
        localStorage.setItem('df_zoho_oauth_result', ${JSON.stringify(resultPayload)});
      } catch (error) {}
      try {
        if (window.opener) window.opener.focus();
      } catch (error) {}
    </script>
  </body>
</html>`;
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

  const raw = await response.text();
  try {
    return JSON.parse(raw) as ZohoTokenResponse;
  } catch {
    return { error: `Unexpected token response (${response.status})`, message: raw };
  }
}

async function registerZohoWebhook(
  accessToken: string,
  orgId: string,
  dc: string,
  webhookUrl: string,
  integrationTypeId: string,
): Promise<string | null> {
  const topology = buildIntegrationTopologyConfig(
    integrationTypeId === 'zoho_inventory' ? 'zoho_inventory' : 'zoho_books',
  );
  const module = integrationTypeId === 'zoho_inventory' ? 'inventory/v1' : 'books/v3';
  const url = new URL(`/${module}/settings/webhooks`, `https://www.zohoapis.${dc}`);
  url.searchParams.set('organization_id', orgId);

  const events = topology.integration_topology.webhook_event_types;

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
  const appOrigin = getAppOrigin(request);

  if (oauthError) {
    return new Response(
      renderResultPage({
        kind: 'error',
        title: 'Zoho connection failed',
        message: `Zoho denied access: ${oauthError}`,
        detail: 'The consent screen was not approved. Return to Yukti and try again when ready.',
        appOrigin,
      }),
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
  if (!code || !stateToken) {
    return new Response(
      renderResultPage({
        kind: 'error',
        title: 'Zoho connection failed',
        message: 'Missing OAuth code or state.',
        detail: 'The Zoho callback did not include the expected parameters.',
        appOrigin,
      }),
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  const db = supabaseAdmin;
  if (!db) {
    return new Response(
      renderResultPage({
        kind: 'error',
        title: 'Zoho connection failed',
        message: 'Server configuration error.',
        detail: 'Yukti could not complete the OAuth callback on this server.',
        appOrigin,
      }),
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  const clientId = process.env.ZOHO_OAUTH_CLIENT_ID;
  const clientSecret = process.env.ZOHO_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return new Response(
      renderResultPage({
        kind: 'error',
        title: 'Zoho connection failed',
        message: 'Zoho OAuth is not configured on this server.',
        appOrigin,
      }),
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  const { data: stateRow, error: stateError } = await db
    .schema('app')
    .from('integration_oauth_states')
    .select('*')
    .eq('state_token', stateToken)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (stateError || !stateRow) {
    return new Response(
      renderResultPage({
        kind: 'error',
        title: 'Zoho connection failed',
        message: 'OAuth state is invalid or expired.',
        detail: 'Please go back to Yukti and start the Zoho connection again.',
        appOrigin,
      }),
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  const { tenant_id, integration_type_id, org_id, requested_by } = stateRow as OAuthStateRow;
  let actorUserId = requested_by;
  if (!actorUserId) {
    const { data: fallbackActor } = await db
      .schema('app')
      .from('tenant_users')
      .select('user_id')
      .eq('tenant_id', tenant_id)
      .eq('role', 'seller_admin')
      .eq('is_active', true)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    actorUserId = typeof fallbackActor?.user_id === 'string' ? fallbackActor.user_id : null;
  }

  await db
    .schema('app')
    .from('integration_oauth_states')
    .delete()
    .eq('state_token', stateToken);

  const redirectUri = `${getAppOrigin(request)}/api/settings/integrations/zoho/oauth/callback`;
  const tokens = await exchangeCodeForTokens(code, redirectUri);

  if (tokens.error || !tokens.access_token || !tokens.refresh_token) {
    console.error('[zoho/oauth/callback] Token exchange failed:', tokens.error ?? 'missing tokens', tokens.message ?? '');
    return new Response(
      renderResultPage({
        kind: 'error',
        title: 'Zoho connection failed',
        message: 'We could not complete the Zoho token exchange.',
        detail:
          tokens.message && tokens.message !== tokens.error
            ? `Zoho response: ${tokens.message}`
            : 'Zoho did not return the expected access and refresh tokens.',
        integrationTypeId: integration_type_id,
        appOrigin,
      }),
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  const dc = (process.env.ZOHO_DC ?? 'in').toLowerCase();
  const now = new Date().toISOString();

  const { data: existing } = await db
    .schema('app')
    .from('tenant_integrations')
    .select('id, created_by')
    .eq('tenant_id', tenant_id)
    .eq('integration_type_id', integration_type_id)
    .maybeSingle();

  let integrationId: string;
  const topologyConfig = buildIntegrationTopologyConfig(integration_type_id as 'zoho_books' | 'zoho_inventory');
  const nextConfig = {
    org_id,
    provider: 'zoho',
    auth_method: 'oauth',
    ...topologyConfig,
  };
  let webhookSetupState: WebhookSetupState = {
    status: 'pending',
    attempted_at: now,
    last_error: null as string | null,
    external_ref: null as string | null,
    last_success_at: null as string | null,
  };

  const { data: integrationRow, error: integrationError } = await db
    .schema('app')
    .from('tenant_integrations')
    .upsert(
      {
        id: existing?.id ?? undefined,
        tenant_id,
        integration_type_id,
        status: 'connected',
        config: nextConfig,
        connected_at: now,
        connected_by: actorUserId,
        last_health_check_at: now,
        health_status: 'ok',
        created_by: existing?.created_by ?? actorUserId,
        updated_by: actorUserId,
        deleted_at: null,
      },
      { onConflict: 'tenant_id,integration_type_id' },
    )
    .select('id')
    .single();

  if (integrationError || !integrationRow) {
    console.error('[zoho/oauth/callback] Failed to upsert tenant_integration:', integrationError);
    return new Response(
      renderResultPage({
        kind: 'error',
        title: 'Zoho connection failed',
        message: 'Failed to save the integration.',
        appOrigin,
      }),
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
  integrationId = integrationRow.id;

  if (!actorUserId) {
    return new Response(
      renderResultPage({
        kind: 'error',
        title: 'Zoho connection failed',
        message: 'Unable to attribute this connection to an active seller admin.',
        appOrigin,
      }),
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  const { error: secretError } = await db.schema('app')
  .rpc('upsert_tenant_integration_secret', {
    p_tenant_integration_id: integrationId,
    p_actor_user_id: actorUserId,
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
    return new Response(
      renderResultPage({
        kind: 'error',
        title: 'Zoho connection failed',
        message: 'Failed to securely store credentials.',
        appOrigin,
      }),
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  try {
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
      await db
        .schema('app')
        .from('integration_webhooks')
        .update({ event_types: eventTypes, updated_by: actorUserId })
        .eq('id', webhookRowId);
    } else {
      const { data: newWebhook, error: webhookInsertError } = await db
        .schema('app')
        .from('integration_webhooks')
        .insert({
          tenant_id,
          tenant_integration_id: integrationId,
          event_types: eventTypes,
          is_active: true,
          created_by: actorUserId,
          updated_by: actorUserId,
        })
        .select('id, endpoint_token')
        .single();

      if (webhookInsertError || !newWebhook) throw webhookInsertError ?? new Error('webhook insert failed');
      endpointToken = newWebhook.endpoint_token as string;
      webhookRowId = newWebhook.id as string;
    }

    const webhookUrl = `${getSupabaseFunctionsUrl()}/integrations-webhook?endpoint_token=${endpointToken}`;
    const zohoWebhookId = await registerZohoWebhook(tokens.access_token, org_id, dc, webhookUrl, integration_type_id);

    if (zohoWebhookId) {
      webhookSetupState = {
        status: 'active',
        attempted_at: now,
        last_error: null,
        external_ref: zohoWebhookId,
        last_success_at: now,
      };
      await db
        .schema('app')
        .from('integration_webhooks')
        .update({ external_ref: zohoWebhookId, updated_by: actorUserId })
        .eq('id', webhookRowId);
    } else {
      webhookSetupState = {
        status: 'failed',
        attempted_at: now,
        last_error: 'Zoho webhook registration returned no webhook ID. Sync can continue and this can be retried later.',
        external_ref: null,
        last_success_at: null,
      };
    }

    const flowRows = buildIntegrationDataFlowRows({
      tenant_id,
      tenant_integration_id: integrationId,
      integration_type_id: integration_type_id as 'zoho_books' | 'zoho_inventory',
      webhook_id: webhookRowId,
      created_by: actorUserId,
      updated_by: actorUserId,
    });

    const { error: flowError } = await db
      .schema('app')
      .from('integration_data_flows')
      .upsert(flowRows, { onConflict: 'tenant_id,tenant_integration_id,entity_type' });

    if (flowError) {
      console.warn('[zoho/oauth/callback] Failed to seed data flows:', flowError);
    }
  } catch (webhookError) {
    webhookSetupState = {
      status: 'failed',
      attempted_at: now,
      last_error: webhookError instanceof Error ? webhookError.message : 'Zoho webhook registration failed.',
      external_ref: null,
      last_success_at: null,
    };
    console.warn('[zoho/oauth/callback] Webhook registration skipped:', webhookError);
  }

  await db
    .schema('app')
    .from('tenant_integrations')
    .update({
      config: {
        ...nextConfig,
        webhook_setup: webhookSetupState,
      },
      updated_by: actorUserId,
    })
    .eq('id', integrationId);

  return new Response(
    renderResultPage({
      kind: 'success',
      title: 'Zoho connection setup complete',
      message: 'You can close this page, the connection is setup.',
      integrationTypeId: integration_type_id,
      appOrigin,
    }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
