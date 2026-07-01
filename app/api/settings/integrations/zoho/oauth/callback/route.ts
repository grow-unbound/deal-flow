import { NextRequest, NextResponse } from 'next/server';

import {
  buildIntegrationDataFlowRows,
  buildIntegrationTopologyConfig,
  getIntegrationWebhookDefinitions,
} from '@/lib/integrations/definitions';
import {
  buildZohoWebhookRegistrationPayload,
  buildZohoWorkflowRegistrationPayload,
} from '@/lib/integrations/zoho-webhooks';
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
  status: 'pending' | 'pending_registration' | 'active' | 'failed';
  attempted_at: string;
  last_error: string | null;
  external_ref: string | null;
  last_success_at: string | null;
};

type WebhookSetupByEntity = Record<string, WebhookSetupState>;

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function extractWorkflowIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string');
  return Object.values(toRecord(value)).filter((entry): entry is string => typeof entry === 'string');
}

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
  entityType: string,
  providerEntity: string,
  secret: string,
  workflowRuleTypes: Array<'add_edit' | 'delete'> = ['add_edit'],
): Promise<{ webhookIds: Record<string, string>; workflowIds: Record<string, string> }> {
  const module = integrationTypeId === 'zoho_inventory' ? 'inventory/v1' : 'books/v3';
  const url = new URL(`/${module}/settings/webhooks`, `https://www.zohoapis.${dc}`);
  url.searchParams.set('organization_id', orgId);
  const workflowIds: Record<string, string> = {};
  const webhookIds: Record<string, string> = {};
  const createdWorkflowIds: string[] = [];
  const createdWebhookIds: string[] = [];
  try {
    for (const ruleType of workflowRuleTypes) {
      const webhookPayload = buildZohoWebhookRegistrationPayload({
        webhookUrl,
        entityType,
        providerEntity,
        secret,
        ruleType,
      });
      console.log(`[registerZohoWebhook] sending webhook for ${entityType} ${ruleType}`, {
        payload: webhookPayload,
        url: url.toString(),
      });

      const webhookResponse = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(webhookPayload),
      });
      const webhookJson = await webhookResponse.json().catch(() => ({})) as Record<string, unknown>;
      const remoteWebhook = webhookJson.webhook as Record<string, unknown> | undefined;
      const webhookId = remoteWebhook?.webhook_id;

      console.log(`[registerZohoWebhook] Zoho webhook response for ${entityType} ${ruleType}`, {
        ok: webhookResponse.ok,
        status: webhookResponse.status,
        code: webhookJson.code,
        webhook_id: webhookId,
        message: webhookJson.message,
        full_webhook: remoteWebhook,
      });

      if (!webhookResponse.ok || webhookJson.code !== 0 || typeof webhookId !== 'string') {
        throw new Error(`Zoho ${entityType} ${ruleType} webhook registration failed (${webhookResponse.status}): ${String(webhookJson.message ?? 'Unknown Zoho error')}`);
      }
      webhookIds[ruleType] = webhookId;
      createdWebhookIds.push(webhookId);
      const workflowResponse = await fetch(
        new URL(`/${module}/settings/workflows?organization_id=${encodeURIComponent(orgId)}`, `https://www.zohoapis.${dc}`).toString(),
        {
          method: 'POST',
          headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(buildZohoWorkflowRegistrationPayload({
            entityType,
            providerEntity,
            webhookId,
            ruleType,
          })),
        },
      );
      const workflowJson = await workflowResponse.json().catch(() => ({})) as Record<string, unknown>;
      const workflow = workflowJson.workflow as Record<string, unknown> | undefined;
      const workflowId = workflow?.workflow_id;
      if (!workflowResponse.ok || workflowJson.code !== 0 || typeof workflowId !== 'string') {
        throw new Error(`Zoho ${entityType} ${ruleType} workflow registration failed (${workflowResponse.status}): ${String(workflowJson.message ?? 'Unknown Zoho error')}`);
      }
      workflowIds[ruleType] = workflowId;
      createdWorkflowIds.push(workflowId);
    }
    return { webhookIds, workflowIds };
  } catch (error) {
    await Promise.all(createdWorkflowIds.map((workflowId) => {
      const workflowUrl = new URL(`/${module}/settings/workflows/${workflowId}`, `https://www.zohoapis.${dc}`);
      workflowUrl.searchParams.set('organization_id', orgId);
      return fetch(workflowUrl.toString(), { method: 'DELETE', headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } });
    }));
    await Promise.all(createdWebhookIds.map((webhookId) => {
      const webhookUrl = new URL(`/${module}/settings/webhooks/${webhookId}`, `https://www.zohoapis.${dc}`);
      webhookUrl.searchParams.set('organization_id', orgId);
      return fetch(webhookUrl.toString(), {
        method: 'DELETE',
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      }).catch(() => undefined);
    }));
    throw error;
  }
}

async function deleteZohoWebhookRegistration(input: {
  accessToken: string;
  orgId: string;
  dc: string;
  integrationTypeId: string;
  remoteWebhookId?: string | null;
  remoteWebhookIds?: string[];
  workflowIds?: string[];
}) {
  const module = input.integrationTypeId === 'zoho_inventory' ? 'inventory/v1' : 'books/v3';

  await Promise.all((input.workflowIds ?? []).map((workflowId) => {
    const workflowUrl = new URL(`/${module}/settings/workflows/${workflowId}`, `https://www.zohoapis.${input.dc}`);
    workflowUrl.searchParams.set('organization_id', input.orgId);
    return fetch(workflowUrl.toString(), {
      method: 'DELETE',
      headers: { Authorization: `Zoho-oauthtoken ${input.accessToken}` },
    }).catch(() => undefined);
  }));

  const webhookIds = [...new Set([input.remoteWebhookId, ...(input.remoteWebhookIds ?? [])].filter((id): id is string => Boolean(id)))];
  await Promise.all(webhookIds.map((webhookId) => {
    const webhookUrl = new URL(`/${module}/settings/webhooks/${webhookId}`, `https://www.zohoapis.${input.dc}`);
    webhookUrl.searchParams.set('organization_id', input.orgId);
    return fetch(webhookUrl.toString(), {
      method: 'DELETE',
      headers: { Authorization: `Zoho-oauthtoken ${input.accessToken}` },
    }).catch(() => undefined);
  }));
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
  let webhookSetupByEntity: WebhookSetupByEntity = {};

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

  const { data: tenantSettingsRow } = await db
    .schema('app')
    .from('tenant_settings')
    .select('settings')
    .eq('tenant_id', tenant_id)
    .maybeSingle();

  const tenantSettings = (tenantSettingsRow && typeof tenantSettingsRow === 'object' && tenantSettingsRow !== null)
    ? (tenantSettingsRow as { settings?: Record<string, unknown> }).settings ?? {}
    : {};
  const cronToken =
    typeof tenantSettings.zoho_daily_sync_cron_token === 'string' && tenantSettings.zoho_daily_sync_cron_token.length > 0
      ? tenantSettings.zoho_daily_sync_cron_token
      : crypto.randomUUID();

  await db.schema('app').from('tenant_settings').upsert(
    {
      tenant_id,
      settings: {
        ...tenantSettings,
        zoho_daily_sync_cron_token: cronToken,
      },
    },
    {
      onConflict: 'tenant_id',
    },
  );

  try {
    webhookSetupByEntity = {};
    const webhookIdsByEntity: Record<string, string> = {};
    const definitions = getIntegrationWebhookDefinitions(
      integration_type_id as 'zoho_books' | 'zoho_inventory',
    );

    // One DB row per (entity_type, event_types subset).
    // add_edit row: non-delete events. delete row: *.deleted events only.
    for (const definition of definitions) {
      const ruleTypes = definition.workflow_rule_types ?? (['add_edit'] as const);
      let entityHasAnyFailure = false;

      for (const ruleType of ruleTypes) {
        // Split event_types by rule: delete row gets only *.deleted; add_edit row gets the rest.
        const rowEventTypes = ruleType === 'delete'
          ? definition.event_types.filter((e) => e.endsWith('.deleted'))
          : definition.event_types.filter((e) => !e.endsWith('.deleted'));

        let webhook: { id: string; endpoint_token: string; remote_webhook_id: string | null; secret: string | null; webhook_config: unknown };

        // Try INSERT first; on duplicate, fetch existing row
        const { data: insertData, error: insertError } = await db
          .schema('app')
          .from('integration_webhooks')
          .insert({
            tenant_id,
            tenant_integration_id: integrationId,
            provider: 'zoho',
            entity_type: definition.entity_type,
            event_types: rowEventTypes,
            secret: crypto.randomUUID().replace(/-/g, ''),
            is_active: false,
            status: 'pending',
            created_by: actorUserId,
            updated_by: actorUserId,
          })
          .select('id, endpoint_token, remote_webhook_id, secret, webhook_config')
          .single();

        if (insertData) {
          webhook = insertData;
        } else if (insertError?.code === '23505') {
          // Duplicate key: fetch existing row for this entity + rule type
          const { data: existingData, error: fetchError } = await db
            .schema('app')
            .from('integration_webhooks')
            .select('id, endpoint_token, remote_webhook_id, secret, webhook_config')
            .eq('tenant_integration_id', integrationId)
            .eq('provider', 'zoho')
            .eq('entity_type', definition.entity_type)
            .overlaps('event_types', rowEventTypes)
            .is('deleted_at', null)
            .maybeSingle();

          if (!existingData || fetchError) throw fetchError ?? new Error(`Unable to fetch existing ${definition.entity_type}/${ruleType} webhook.`);
          webhook = existingData;

          // Update status in case re-authenticating
          await db.schema('app').from('integration_webhooks')
            .update({ status: 'pending', is_active: false, updated_by: actorUserId })
            .eq('id', webhook.id);
        } else {
          throw insertError ?? new Error(`Unable to prepare ${definition.entity_type}/${ruleType} webhook.`);
        }

        // add_edit row is the data-flow anchor (drives upsert syncs)
        if (ruleType === 'add_edit') {
          webhookIdsByEntity[definition.entity_type] = webhook.id;
        }

        // Clean up previously-registered IDs from DB — no extra LIST call to Zoho
        const existingConfig = toRecord(webhook.webhook_config);
        const priorWorkflowIds = extractWorkflowIds(existingConfig.workflow_ids);
        const priorRemoteWebhookIds = extractWorkflowIds(existingConfig.remote_webhook_ids);
        if (webhook.remote_webhook_id || priorWorkflowIds.length > 0 || priorRemoteWebhookIds.length > 0) {
          await deleteZohoWebhookRegistration({
            accessToken: tokens.access_token,
            orgId: org_id,
            dc,
            integrationTypeId: integration_type_id,
            remoteWebhookId: webhook.remote_webhook_id,
            remoteWebhookIds: priorRemoteWebhookIds,
            workflowIds: priorWorkflowIds,
          });
        }

        const callbackUrl = `${getSupabaseFunctionsUrl()}/integrations-webhook/${webhook.endpoint_token}`;
        const webhookSecret = (webhook.secret ?? crypto.randomUUID()).replace(/-/g, '');
        const registration = await registerZohoWebhook(
          tokens.access_token,
          org_id,
          dc,
          callbackUrl,
          integration_type_id,
          definition.entity_type,
          definition.provider_entity,
          webhookSecret,
          [ruleType],
        );
        const remoteWebhookId = registration.webhookIds[ruleType] ?? Object.values(registration.webhookIds)[0] ?? null;
        console.info('[zoho/oauth/callback] webhook registered', {
          entity_type: definition.entity_type,
          rule_type: ruleType,
          event_types: rowEventTypes,
          webhook_id: remoteWebhookId,
          workflow_ids: registration.workflowIds,
        });

        if (!remoteWebhookId) entityHasAnyFailure = true;

        await db
          .schema('app')
          .from('integration_webhooks')
          .update({
            remote_webhook_id: remoteWebhookId,
            external_ref: remoteWebhookId,
            status: remoteWebhookId ? 'active' : 'failed',
            webhook_config: {
              sync_phase: definition.sync_phase,
              integration_type_id,
              workflow_ids: registration.workflowIds,
              remote_webhook_ids: registration.webhookIds,
            },
            secret: webhookSecret,
            is_active: Boolean(remoteWebhookId),
            last_verified_at: remoteWebhookId ? now : null,
            updated_by: actorUserId,
          })
          .eq('id', webhook.id);
      }

      const entityStatus = entityHasAnyFailure ? 'failed' : 'active';
      webhookSetupByEntity[definition.entity_type] = {
        status: entityStatus,
        attempted_at: now,
        last_error: entityHasAnyFailure ? 'One or more rule_type registrations failed' : null,
        external_ref: null,
        last_success_at: entityHasAnyFailure ? null : now,
      };
    }

    // Seed data flows
    const flowRows = buildIntegrationDataFlowRows({
      tenant_id,
      tenant_integration_id: integrationId,
      integration_type_id: integration_type_id as 'zoho_books' | 'zoho_inventory',
      webhook_ids_by_entity: webhookIdsByEntity,
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

    const allActive = Object.values(webhookSetupByEntity).every((s) => s.status === 'active');
    webhookSetupState = {
      status: allActive ? 'active' : 'failed',
      attempted_at: now,
      last_error: allActive ? null : 'One or more webhook registrations failed',
      external_ref: null,
      last_success_at: allActive ? now : null,
    };
  } catch (setupError) {
    webhookSetupState = {
      status: 'failed',
      attempted_at: now,
      last_error: setupError instanceof Error ? setupError.message : String(setupError),
      external_ref: null,
      last_success_at: null,
    };
    console.error('[zoho/oauth/callback] Webhook setup failed:', setupError instanceof Error ? setupError.message : JSON.stringify(setupError));
  }

  await db
    .schema('app')
    .from('tenant_integrations')
    .update({
      config: {
        ...nextConfig,
        webhook_setup_by_entity: webhookSetupByEntity,
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
