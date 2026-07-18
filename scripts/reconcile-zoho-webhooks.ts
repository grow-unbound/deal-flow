#!/usr/bin/env -S npx tsx
// One-off reconciliation: re-run Zoho webhook/workflow registration for a
// tenant integration, using the paced/backoff-aware registerZohoWebhook path
// (see src/lib/integrations/zoho-webhooks.ts). Mirrors the core logic of
// app/api/settings/integrations/zoho/webhooks/retry/route.ts but runs
// directly against the service-role DB (no tenant JWT needed) since this is
// an internal ops fix-up, not a user-triggered request.
//
// Usage: npx tsx scripts/reconcile-zoho-webhooks.ts <tenant_integration_id> [--dry-run]

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

import {
  buildIntegrationDataFlowRows,
  getIntegrationWebhookDefinitions,
} from '../src/lib/integrations/definitions';
import {
  buildZohoWebhookRegistrationPayload,
  buildZohoWebhookRegistrationName,
  buildZohoWorkflowRegistrationPayload,
  deleteZohoWebhookRegistrationsByName,
  fetchZohoSettings,
  pauseForZohoSettingsRateLimit,
} from '../src/lib/integrations/zoho-webhooks';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

function loadRootEnvLocal() {
  const dotenvPath = path.join(repoRoot, '.env.local');
  const raw = readFileSync(dotenvPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadRootEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local');
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const tenantIntegrationId = process.argv[2];
if (!tenantIntegrationId || tenantIntegrationId.startsWith('--')) {
  throw new Error('Usage: npx tsx scripts/reconcile-zoho-webhooks.ts <tenant_integration_id> [--dry-run]');
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function extractWorkflowIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string');
  return Object.values(toRecord(value)).filter((entry): entry is string => typeof entry === 'string');
}

function getZohoAccountsBaseUrl(dc: string) {
  return `https://accounts.zoho.${dc}`;
}

function getFunctionsBaseUrl() {
  return `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1`;
}

function resolveDc(config: Record<string, unknown>) {
  const transport = toRecord(config.transport);
  const accountsBaseUrl = typeof transport.accounts_base_url === 'string' ? transport.accounts_base_url : null;
  const match = accountsBaseUrl?.match(/accounts\.zoho\.([a-z.]+)$/i);
  if (match?.[1]) return match[1].toLowerCase();
  const dc = typeof config.region === 'string' ? config.region : typeof config.dc === 'string' ? config.dc : 'in';
  return dc.toLowerCase();
}

interface ZohoSecret {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  org_id?: string;
  organization_id?: string;
}

async function refreshAccessToken(secret: ZohoSecret, dc: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: secret.refresh_token,
    client_id: secret.client_id,
    client_secret: secret.client_secret,
  });
  const response = await fetch(`${getZohoAccountsBaseUrl(dc)}/oauth/v2/token`, { method: 'POST', body });
  const json = (await response.json().catch(() => ({}))) as { access_token?: string; error?: string; message?: string };
  if (!response.ok || !json.access_token) {
    throw new Error(json.error ?? json.message ?? 'Zoho token refresh failed');
  }
  return json.access_token;
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

  for (const workflowId of input.workflowIds ?? []) {
    await pauseForZohoSettingsRateLimit();
    const workflowUrl = new URL(`/${module}/settings/workflows/${workflowId}`, `https://www.zohoapis.${input.dc}`);
    workflowUrl.searchParams.set('organization_id', input.orgId);
    const res = await fetchZohoSettings(workflowUrl.toString(), {
      method: 'DELETE',
      headers: { Authorization: `Zoho-oauthtoken ${input.accessToken}` },
    }).catch((err) => {
      console.error(`[reconcile] failed to delete prior workflow ${workflowId}:`, err);
      return null;
    });
    if (res && !res.ok) console.error(`[reconcile] delete prior workflow ${workflowId} returned ${res.status}`);
  }

  const webhookIds = [...new Set([input.remoteWebhookId, ...(input.remoteWebhookIds ?? [])].filter((id): id is string => Boolean(id)))];
  for (const webhookId of webhookIds) {
    await pauseForZohoSettingsRateLimit();
    const webhookUrl = new URL(`/${module}/settings/webhooks/${webhookId}`, `https://www.zohoapis.${input.dc}`);
    webhookUrl.searchParams.set('organization_id', input.orgId);
    const res = await fetchZohoSettings(webhookUrl.toString(), {
      method: 'DELETE',
      headers: { Authorization: `Zoho-oauthtoken ${input.accessToken}` },
    }).catch((err) => {
      console.error(`[reconcile] failed to delete prior webhook ${webhookId}:`, err);
      return null;
    });
    if (res && !res.ok) console.error(`[reconcile] delete prior webhook ${webhookId} returned ${res.status}`);
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
  ruleType: 'add_edit' | 'delete',
): Promise<{ webhookId: string; workflowId: string }> {
  const module = integrationTypeId === 'zoho_inventory' ? 'inventory/v1' : 'books/v3';
  const url = new URL(`/${module}/settings/webhooks`, `https://www.zohoapis.${dc}`);
  url.searchParams.set('organization_id', orgId);

  let createdWebhookId: string | null = null;
  try {
    await pauseForZohoSettingsRateLimit();
    const webhookResponse = await fetchZohoSettings(url.toString(), {
      method: 'POST',
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildZohoWebhookRegistrationPayload({ webhookUrl, entityType, providerEntity, secret, ruleType })),
    });
    const webhookJson = (await webhookResponse.json().catch(() => ({}))) as Record<string, unknown>;
    const remoteWebhook = webhookJson.webhook as Record<string, unknown> | undefined;
    const webhookId = remoteWebhook?.webhook_id;
    console.log(`[reconcile] webhook create ${entityType}/${ruleType}`, { ok: webhookResponse.ok, status: webhookResponse.status, code: webhookJson.code, webhookId });
    if (!webhookResponse.ok || webhookJson.code !== 0 || typeof webhookId !== 'string') {
      throw new Error(`Zoho ${entityType} ${ruleType} webhook registration failed (${webhookResponse.status}): ${String(webhookJson.message ?? 'Unknown Zoho error')}`);
    }
    createdWebhookId = webhookId;

    const workflowUrl = new URL(`/${module}/settings/workflows`, `https://www.zohoapis.${dc}`);
    workflowUrl.searchParams.set('organization_id', orgId);
    await pauseForZohoSettingsRateLimit();
    const workflowResponse = await fetchZohoSettings(workflowUrl.toString(), {
      method: 'POST',
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildZohoWorkflowRegistrationPayload({ entityType, providerEntity, webhookId, ruleType })),
    });
    const workflowJson = (await workflowResponse.json().catch(() => ({}))) as Record<string, unknown>;
    const workflow = workflowJson.workflow as Record<string, unknown> | undefined;
    const workflowId = workflow?.workflow_id;
    console.log(`[reconcile] workflow create ${entityType}/${ruleType}`, { ok: workflowResponse.ok, status: workflowResponse.status, code: workflowJson.code, workflowId });
    if (!workflowResponse.ok || workflowJson.code !== 0 || typeof workflowId !== 'string') {
      throw new Error(`Zoho ${entityType} ${ruleType} workflow registration failed (${workflowResponse.status}): ${String(workflowJson.message ?? 'Unknown Zoho error')}`);
    }
    return { webhookId, workflowId };
  } catch (error) {
    if (createdWebhookId) {
      await pauseForZohoSettingsRateLimit();
      const deleteUrl = new URL(`/${module}/settings/webhooks/${createdWebhookId}`, `https://www.zohoapis.${dc}`);
      deleteUrl.searchParams.set('organization_id', orgId);
      const res = await fetchZohoSettings(deleteUrl.toString(), {
        method: 'DELETE',
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      }).catch((cleanupError) => {
        console.error(`[reconcile] cleanup: failed to delete orphan webhook ${createdWebhookId}:`, cleanupError);
        return null;
      });
      if (res && !res.ok) console.error(`[reconcile] cleanup: delete webhook ${createdWebhookId} returned ${res.status}`);
    }
    throw error;
  }
}

async function main() {
  const { data: integration, error: integrationError } = await db
    .schema('app')
    .from('tenant_integrations')
    .select('id, tenant_id, integration_type_id, config, vault_secret_id, deleted_at')
    .eq('id', tenantIntegrationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (integrationError || !integration) throw integrationError ?? new Error('Tenant integration not found');
  if (!['zoho_books', 'zoho_inventory'].includes(integration.integration_type_id)) {
    throw new Error('Only Zoho integrations are supported');
  }

  const { data: tenant } = await db.schema('app').from('tenants').select('business_name').eq('id', integration.tenant_id).maybeSingle();
  console.log(`[reconcile] tenant=${tenant?.business_name ?? integration.tenant_id} integration=${integration.id} type=${integration.integration_type_id} dry_run=${DRY_RUN}`);

  const { data: secretData, error: secretError } = await db
    .schema('app')
    .rpc('get_tenant_integration_runtime_secret', {
      p_tenant_integration_id: integration.id,
      p_expected_integration_type_id: integration.integration_type_id,
    });
  if (secretError) throw secretError;
  const secret = toRecord(secretData) as unknown as ZohoSecret;
  const orgId = typeof secret.org_id === 'string'
    ? secret.org_id
    : typeof secret.organization_id === 'string'
      ? secret.organization_id
      : typeof toRecord(integration.config).org_id === 'string'
        ? String(toRecord(integration.config).org_id)
        : null;
  if (!orgId) throw new Error('Zoho organization_id missing from this integration');

  const dc = resolveDc(toRecord(integration.config));
  const definitions = getIntegrationWebhookDefinitions(integration.integration_type_id === 'zoho_inventory' ? 'zoho_inventory' : 'zoho_books');
  const accessToken = await refreshAccessToken(secret, dc);

  // Orphan cleanup: earlier failed runs left Zoho webhook-actions registered
  // under every entity's name with no paired workflow-rule (our own
  // remote_webhook_id was never stored, so the normal delete-by-stored-ID
  // path can't see them). New creates 400 on "same name already exists"
  // until these are cleared by name. Skip names for rows that are already
  // healthy — don't touch a working webhook.
  if (!DRY_RUN) {
    const namesToClean: string[] = [];
    for (const definition of definitions) {
      const ruleTypes = definition.workflow_rule_types ?? (['add_edit'] as const);
      for (const ruleType of ruleTypes) {
        const rowEventTypes = ruleType === 'delete'
          ? definition.event_types.filter((e) => e.endsWith('.deleted'))
          : definition.event_types.filter((e) => !e.endsWith('.deleted'));
        const { data: row } = await db.schema('app').from('integration_webhooks')
          .select('status, remote_webhook_id')
          .eq('tenant_integration_id', integration.id)
          .eq('provider', 'zoho')
          .eq('entity_type', definition.entity_type)
          .contains('event_types', rowEventTypes)
          .is('deleted_at', null)
          .maybeSingle();
        const isHealthy = row?.status === 'active' && row?.remote_webhook_id;
        if (!isHealthy || FORCE) {
          namesToClean.push(buildZohoWebhookRegistrationName({ entityType: definition.entity_type, ruleType }));
        }
      }
    }
    console.log('[reconcile] cleaning up orphan Zoho webhooks by name:', namesToClean);
    await deleteZohoWebhookRegistrationsByName({
      accessToken, orgId, dc,
      integrationTypeId: integration.integration_type_id,
      webhookNames: namesToClean,
    });
  }

  const webhookIdsByEntity: Record<string, string> = {};
  const summary: Array<{ entity_type: string; rule_type: string; status: string; error?: string }> = [];

  for (const definition of definitions) {
    const ruleTypes = definition.workflow_rule_types ?? (['add_edit'] as const);

    for (const ruleType of ruleTypes) {
      const rowEventTypes = ruleType === 'delete'
        ? definition.event_types.filter((e) => e.endsWith('.deleted'))
        : definition.event_types.filter((e) => !e.endsWith('.deleted'));

      const { data: existingWebhook } = await db.schema('app').from('integration_webhooks')
        .select('id, endpoint_token, secret, remote_webhook_id, status, webhook_config')
        .eq('tenant_integration_id', integration.id)
        .eq('provider', 'zoho')
        .eq('entity_type', definition.entity_type)
        .contains('event_types', rowEventTypes)
        .is('deleted_at', null)
        .maybeSingle();

      let webhook = existingWebhook;
      if (!webhook) {
        if (DRY_RUN) {
          console.log(`[reconcile] [dry-run] would insert integration_webhooks row for ${definition.entity_type}/${ruleType}`);
          summary.push({ entity_type: definition.entity_type, rule_type: ruleType, status: 'dry-run-insert' });
          continue;
        }
        const { data, error } = await db.schema('app').from('integration_webhooks').insert({
          tenant_id: integration.tenant_id,
          tenant_integration_id: integration.id,
          provider: 'zoho',
          entity_type: definition.entity_type,
          event_types: rowEventTypes,
          secret: crypto.randomUUID().replace(/-/g, ''),
          status: 'pending',
          is_active: false,
        }).select('id, endpoint_token, secret, remote_webhook_id, status, webhook_config').single();
        if (error || !data) {
          console.error(`[reconcile] failed to create row for ${definition.entity_type}/${ruleType}:`, error);
          summary.push({ entity_type: definition.entity_type, rule_type: ruleType, status: 'failed', error: error?.message });
          continue;
        }
        webhook = data;
      }

      if (ruleType === 'add_edit') webhookIdsByEntity[definition.entity_type] = webhook.id;

      // Don't touch already-healthy webhooks — only fix what's actually
      // missing/broken. Re-registering an active one just churns a working
      // Zoho webhook for no reason.
      if (webhook.status === 'active' && webhook.remote_webhook_id && !FORCE) {
        console.log(`[reconcile] skip ${definition.entity_type}/${ruleType} — already active (webhook_id=${webhook.remote_webhook_id})`);
        summary.push({ entity_type: definition.entity_type, rule_type: ruleType, status: 'skipped-already-active' });
        continue;
      }

      if (DRY_RUN) {
        console.log(`[reconcile] [dry-run] would re-register ${definition.entity_type}/${ruleType} (current status=${webhook.status}, remote_webhook_id=${webhook.remote_webhook_id})`);
        summary.push({ entity_type: definition.entity_type, rule_type: ruleType, status: 'dry-run-reregister' });
        continue;
      }

      const callbackUrl = `${getFunctionsBaseUrl()}/integrations-webhook/${webhook.endpoint_token}`;
      const workflowIds = extractWorkflowIds(toRecord(webhook.webhook_config).workflow_ids);
      const remoteWebhookIds = extractWorkflowIds(toRecord(webhook.webhook_config).remote_webhook_ids);

      try {
        if (webhook.remote_webhook_id || workflowIds.length > 0 || remoteWebhookIds.length > 0) {
          await deleteZohoWebhookRegistration({
            accessToken, orgId, dc,
            integrationTypeId: integration.integration_type_id,
            remoteWebhookId: webhook.remote_webhook_id,
            remoteWebhookIds, workflowIds,
          });
        }

        const webhookSecret = (webhook.secret ?? crypto.randomUUID()).replace(/-/g, '');
        const { webhookId, workflowId } = await registerZohoWebhook(
          accessToken, orgId, dc, callbackUrl,
          integration.integration_type_id, definition.entity_type, definition.provider_entity,
          webhookSecret, ruleType,
        );

        await db.schema('app').from('integration_webhooks').update({
          event_types: rowEventTypes,
          remote_webhook_id: webhookId,
          external_ref: webhookId,
          status: 'active',
          is_active: true,
          webhook_config: {
            sync_phase: definition.sync_phase,
            integration_type_id: integration.integration_type_id,
            workflow_ids: { [ruleType]: workflowId },
            remote_webhook_ids: { [ruleType]: webhookId },
          },
          secret: webhookSecret,
          last_verified_at: new Date().toISOString(),
        }).eq('id', webhook.id);

        console.log(`[reconcile] OK ${definition.entity_type}/${ruleType} webhook=${webhookId} workflow=${workflowId}`);
        summary.push({ entity_type: definition.entity_type, rule_type: ruleType, status: 'active' });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[reconcile] FAILED ${definition.entity_type}/${ruleType}: ${message}`);
        await db.schema('app').from('integration_webhooks').update({
          remote_webhook_id: null,
          external_ref: null,
          status: 'failed',
          is_active: false,
          last_verified_at: null,
        }).eq('id', webhook.id);
        summary.push({ entity_type: definition.entity_type, rule_type: ruleType, status: 'failed', error: message });
      }
    }
  }

  if (!DRY_RUN) {
    const flowRows = buildIntegrationDataFlowRows({
      tenant_id: integration.tenant_id,
      tenant_integration_id: integration.id,
      integration_type_id: integration.integration_type_id === 'zoho_inventory' ? 'zoho_inventory' : 'zoho_books',
      webhook_ids_by_entity: webhookIdsByEntity,
    });
    const { error: flowError } = await db.schema('app').from('integration_data_flows')
      .upsert(flowRows, { onConflict: 'tenant_id,tenant_integration_id,entity_type' });
    if (flowError) console.warn('[reconcile] failed to seed data flows:', flowError);
  }

  console.log('[reconcile] summary:', JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error('[reconcile] fatal:', err);
  process.exitCode = 1;
});
