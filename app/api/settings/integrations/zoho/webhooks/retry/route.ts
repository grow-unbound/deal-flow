import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { buildIntegrationTopologyConfig, getIntegrationWebhookDefinitions } from '@/lib/integrations/definitions';
import { supabaseAdmin } from '@/lib/supabase';

interface ZohoSecret {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  org_id?: string;
  organization_id?: string;
  dc?: string;
  region?: string;
  accounts_base_url?: string;
}

function jsonError(status: number, message: string, code = 'ERROR') {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

function getZohoAccountsBaseUrl(dc: string) {
  return `https://accounts.zoho.${dc}`;
}

function getFunctionsBaseUrl() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
  return `${supabaseUrl}/functions/v1`;
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function resolveDc(config: Record<string, unknown>) {
  const transport = toRecord(config.transport);
  const accountsBaseUrl = typeof transport.accounts_base_url === 'string' ? transport.accounts_base_url : null;
  const match = accountsBaseUrl?.match(/accounts\.zoho\.([a-z.]+)$/i);
  if (match?.[1]) return match[1].toLowerCase();
  const dc = typeof config.region === 'string' ? config.region : typeof config.dc === 'string' ? config.dc : 'in';
  return dc.toLowerCase();
}

async function refreshAccessToken(secret: ZohoSecret, dc: string) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: secret.refresh_token,
    client_id: secret.client_id,
    client_secret: secret.client_secret,
  });

  const response = await fetch(`${getZohoAccountsBaseUrl(dc)}/oauth/v2/token`, {
    method: 'POST',
    body,
  });

  const json = (await response.json().catch(() => ({}))) as { access_token?: string; error?: string; message?: string };
  if (!response.ok || !json.access_token) {
    throw new Error(json.error ?? json.message ?? 'Zoho token refresh failed');
  }
  return json.access_token;
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
) {
  const module = integrationTypeId === 'zoho_inventory' ? 'inventory/v1' : 'books/v3';
  const url = new URL(`/${module}/settings/webhooks`, `https://www.zohoapis.${dc}`);
  url.searchParams.set('organization_id', orgId);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      webhook_name: `${entityType} sync - Yukti`,
      description: `Yukti inbound ${entityType} sync`,
      entity: providerEntity,
      method: 'POST',
      url: webhookUrl,
      secret,
      body_type: 'application/json',
    }),
  });

  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || json.code !== 0) {
    throw new Error(`Zoho ${entityType} webhook registration failed (${response.status}): ${String(json.message ?? 'Unknown Zoho error')}`);
  }
  const webhook = typeof json.webhook === 'object' && json.webhook !== null ? (json.webhook as Record<string, unknown>) : null;
  const webhookId = typeof webhook?.webhook_id === 'string' ? webhook.webhook_id : null;
  if (!webhookId) throw new Error(`Zoho did not return a ${entityType} webhook id.`);
  const workflowIds: Record<string, string> = {};
  const createdWorkflowIds: string[] = [];
  try {
    for (const ruleType of workflowRuleTypes) {
      const workflowUrl = new URL(`/${module}/settings/workflows`, `https://www.zohoapis.${dc}`);
      workflowUrl.searchParams.set('organization_id', orgId);
      const workflowResponse = await fetch(workflowUrl.toString(), {
        method: 'POST',
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_name: `${entityType} ${ruleType} - Yukti`,
          description: `Yukti inbound ${entityType} ${ruleType} sync`,
          rule_type: ruleType,
          entity: providerEntity,
          rule: {},
          apply_rule_always: true,
          instant_actions: [{ action_id: webhookId, action_type: 'webhook' }],
        }),
      });
      const workflowJson = await workflowResponse.json().catch(() => ({})) as Record<string, unknown>;
      const workflow = workflowJson.workflow as Record<string, unknown> | undefined;
      const workflowId = typeof workflow?.workflow_id === 'string' ? workflow.workflow_id : null;
      if (!workflowResponse.ok || workflowJson.code !== 0 || !workflowId) {
        throw new Error(`Zoho ${entityType} ${ruleType} workflow registration failed (${workflowResponse.status}): ${String(workflowJson.message ?? 'Unknown Zoho error')}`);
      }
      workflowIds[ruleType] = workflowId;
      createdWorkflowIds.push(workflowId);
    }
    return { webhookId, workflowIds };
  } catch (error) {
    await Promise.all(createdWorkflowIds.map((workflowId) => {
      const workflowUrl = new URL(`/${module}/settings/workflows/${workflowId}`, `https://www.zohoapis.${dc}`);
      workflowUrl.searchParams.set('organization_id', orgId);
      return fetch(workflowUrl.toString(), { method: 'DELETE', headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } });
    }));
    const deleteUrl = new URL(`/${module}/settings/webhooks/${webhookId}`, `https://www.zohoapis.${dc}`);
    deleteUrl.searchParams.set('organization_id', orgId);
    await fetch(deleteUrl.toString(), { method: 'DELETE', headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } }).catch(() => undefined);
    throw error;
  }
}

function buildWebhookSetupState(input: {
  status: 'pending' | 'active' | 'failed';
  message?: string | null;
  webhookId?: string | null;
}) {
  return {
    status: input.status,
    attempted_at: new Date().toISOString(),
    last_error: input.status === 'failed' ? (input.message ?? 'Zoho webhook registration failed') : null,
    external_ref: input.webhookId ?? null,
    last_success_at: input.status === 'active' ? new Date().toISOString() : null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) return jsonError(401, 'Login required', 'UNAUTHORIZED');
    if (claims.role !== 'seller_admin') return jsonError(403, 'Admin only', 'FORBIDDEN');

    const body = await request.json().catch(() => null);
    const tenantIntegrationId = typeof body?.tenant_integration_id === 'string' ? body.tenant_integration_id : null;
    if (!tenantIntegrationId) return jsonError(400, 'tenant_integration_id is required', 'BAD_REQUEST');

    const db = supabaseAdmin;
    if (!db) return jsonError(500, 'Server configuration error', 'SERVER_ERROR');

    const { data: integration, error: integrationError } = await db
      .schema('app')
      .from('tenant_integrations')
      .select('id, tenant_id, integration_type_id, config, vault_secret_id, deleted_at')
      .eq('id', tenantIntegrationId)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (integrationError || !integration) {
      return jsonError(404, 'Tenant integration not found', 'NOT_FOUND');
    }

    if (!['zoho_books', 'zoho_inventory'].includes(integration.integration_type_id)) {
      return jsonError(400, 'Only Zoho integrations can retry webhook setup', 'BAD_REQUEST');
    }

    const { data: secretData, error: secretError } = await db
      .schema('app')
      .rpc('get_tenant_integration_runtime_secret', {
        p_tenant_integration_id: integration.id,
        p_expected_integration_type_id: integration.integration_type_id,
      });

    if (secretError) {
      return jsonError(500, secretError.message ?? 'Unable to load integration secret', 'SECRET_FAILED');
    }

    const secret = toRecord(secretData) as unknown as ZohoSecret;
    const orgId = typeof secret.org_id === 'string'
      ? secret.org_id
      : typeof secret.organization_id === 'string'
        ? secret.organization_id
        : typeof (integration.config as Record<string, unknown>).org_id === 'string'
          ? String((integration.config as Record<string, unknown>).org_id)
          : null;

    if (!orgId) {
      return jsonError(400, 'Zoho organization_id is missing from this integration', 'BAD_REQUEST');
    }

    const dc = resolveDc(toRecord(integration.config));
    const accountsBaseUrl = getZohoAccountsBaseUrl(dc);
    const definitions = getIntegrationWebhookDefinitions(
      integration.integration_type_id === 'zoho_inventory' ? 'zoho_inventory' : 'zoho_books',
    );
    const accessToken = await refreshAccessToken(secret, dc);
    const setupByEntity: Record<string, ReturnType<typeof buildWebhookSetupState>> = {};

    for (const definition of definitions) {
      const { data: existingWebhook } = await db.schema('app').from('integration_webhooks')
        .select('id, endpoint_token, secret, remote_webhook_id, status, webhook_config')
        .eq('tenant_integration_id', integration.id)
        .eq('provider', 'zoho')
        .eq('entity_type', definition.entity_type)
        .is('deleted_at', null)
        .maybeSingle();

      let webhook = existingWebhook;
      if (!webhook) {
        const { data, error } = await db.schema('app').from('integration_webhooks').insert({
          tenant_id: integration.tenant_id,
          tenant_integration_id: integration.id,
          provider: 'zoho',
          entity_type: definition.entity_type,
          event_types: definition.event_types,
          secret: crypto.randomUUID().replace(/-/g, ''),
          status: 'pending',
          is_active: true,
          created_by: claims.sub,
          updated_by: claims.sub,
        }).select('id, endpoint_token, secret, remote_webhook_id, status, webhook_config').single();
        if (error || !data) return jsonError(500, `Unable to prepare ${definition.entity_type} webhook`, 'WEBHOOK_SETUP_FAILED');
        webhook = data;
      }
      if (!webhook) return jsonError(500, `Unable to prepare ${definition.entity_type} webhook`, 'WEBHOOK_SETUP_FAILED');

      if (webhook.remote_webhook_id && webhook.status === 'active') {
        setupByEntity[definition.entity_type] = buildWebhookSetupState({
          status: 'active',
          webhookId: webhook.remote_webhook_id,
        });
        continue;
      }

      const webhookSecret = (webhook.secret ?? crypto.randomUUID()).replace(/-/g, '');
      const registration = await registerZohoWebhook(
        accessToken,
        orgId,
        dc,
        `${getFunctionsBaseUrl()}/integrations-webhook?endpoint_token=${webhook.endpoint_token}`,
        integration.integration_type_id,
        definition.entity_type,
        definition.provider_entity,
        webhookSecret,
        definition.workflow_rule_types,
      );
      const remoteWebhookId = registration.webhookId;
      const state = buildWebhookSetupState({
        status: remoteWebhookId ? 'active' : 'failed',
        webhookId: remoteWebhookId,
      });
      setupByEntity[definition.entity_type] = state;
      await db.schema('app').from('integration_webhooks').update({
        event_types: definition.event_types,
        remote_webhook_id: remoteWebhookId,
        external_ref: remoteWebhookId,
        status: state.status,
        is_active: Boolean(remoteWebhookId),
        webhook_config: { sync_phase: definition.sync_phase, workflow_ids: registration.workflowIds },
        secret: webhookSecret,
        last_verified_at: remoteWebhookId ? new Date().toISOString() : null,
        updated_by: claims.sub,
      }).eq('id', webhook.id);
    }

    const topologyConfig = buildIntegrationTopologyConfig(
      integration.integration_type_id === 'zoho_inventory' ? 'zoho_inventory' : 'zoho_books',
    );
    const nextConfig = {
      ...(toRecord(integration.config)),
      ...topologyConfig,
      webhook_setup_by_entity: setupByEntity,
      webhook_setup: buildWebhookSetupState({
        status: Object.values(setupByEntity).every((state) => state.status === 'active') ? 'active' : 'failed',
        message: 'One or more Zoho entity webhook registrations need attention.',
      }),
    };

    await db
      .schema('app')
      .from('tenant_integrations')
      .update({
        config: nextConfig,
        updated_by: claims.sub,
      })
      .eq('id', integration.id);

    const allActive = Object.values(setupByEntity).every((state) => state.status === 'active');

    return NextResponse.json({
      data: {
        ok: true,
        tenant_integration_id: integration.id,
        webhook_setup: {
          status: allActive ? 'active' : 'failed',
          message: allActive
            ? 'Zoho webhooks are active.'
            : 'Zoho webhooks could not be registered right now. Sync can continue, and you can retry later.',
          accounts_base_url: accountsBaseUrl,
        },
      },
      error: null,
    });
  } catch (error) {
    console.error('[POST /api/settings/integrations/zoho/webhooks/retry]', error);
    return jsonError(400, error instanceof Error ? error.message : 'Failed to retry webhook setup', 'RETRY_FAILED');
  }
}
