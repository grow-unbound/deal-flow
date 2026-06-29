import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildZohoWebhookRegistrationName,
  buildZohoWebhookRegistrationPayload,
  buildZohoWorkflowRegistrationPayload,
  deleteZohoWebhookRegistrationsByName,
} from '../../../src/lib/integrations/zoho-webhooks.ts';
import { getIntegrationWebhookDefinitions } from '../../../src/lib/integrations/definitions.ts';

interface WebhookSetupPayload {
  tenant_id: string;
  tenant_integration_id: string;
  integration_type_id: string;
  org_id: string;
  access_token: string;
  refresh_token: string;
  actor_user_id: string;
}

type WebhookSetupState = {
  status: 'pending' | 'active' | 'failed';
  attempted_at: string;
  last_error: string | null;
  external_ref: string | null;
  last_success_at: string | null;
};

type WebhookSetupByEntity = Record<string, WebhookSetupState>;

function getZohoAccountsBaseUrl(dc: string = 'in'): string {
  return `https://accounts.zoho.${dc.toLowerCase()}`;
}

function getSupabaseFunctionsUrl(): string {
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
  return `${supabaseUrl}/functions/v1`;
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function extractWorkflowIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string');
  return Object.values(toRecord(value)).filter((entry): entry is string => typeof entry === 'string');
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
      console.log(`[webhook-setup] registering ${entityType} ${ruleType}`, { url: url.toString() });

      const webhookResponse = await Promise.race([
        fetch(url.toString(), {
          method: 'POST',
          headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(webhookPayload),
        }),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error('Zoho webhook registration timeout')), 30000)
        ),
      ]);

      const webhookJson = (await webhookResponse.json().catch(() => ({}))) as Record<string, unknown>;
      const remoteWebhook = webhookJson.webhook as Record<string, unknown> | undefined;
      const webhookId = remoteWebhook?.webhook_id;

      console.log(`[webhook-setup] Zoho webhook response for ${entityType} ${ruleType}`, {
        ok: webhookResponse.ok,
        status: webhookResponse.status,
        code: webhookJson.code,
        webhook_id: webhookId,
      });

      if (!webhookResponse.ok || webhookJson.code !== 0 || typeof webhookId !== 'string') {
        throw new Error(
          `Zoho ${entityType} ${ruleType} webhook registration failed (${webhookResponse.status}): ${String(webhookJson.message ?? 'Unknown Zoho error')}`,
        );
      }

      webhookIds[ruleType] = webhookId;
      createdWebhookIds.push(webhookId);

      const workflowResponse = await Promise.race([
        fetch(
          new URL(
            `/${module}/settings/workflows?organization_id=${encodeURIComponent(orgId)}`,
            `https://www.zohoapis.${dc}`,
          ).toString(),
          {
            method: 'POST',
            headers: {
              Authorization: `Zoho-oauthtoken ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(
              buildZohoWorkflowRegistrationPayload({
                entityType,
                providerEntity,
                webhookId,
                ruleType,
              }),
            ),
          },
        ),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error('Zoho workflow registration timeout')), 30000)
        ),
      ]);

      const workflowJson = (await workflowResponse.json().catch(() => ({}))) as Record<string, unknown>;
      const workflow = workflowJson.workflow as Record<string, unknown> | undefined;
      const workflowId = workflow?.workflow_id;

      if (!workflowResponse.ok || workflowJson.code !== 0 || typeof workflowId !== 'string') {
        throw new Error(
          `Zoho ${entityType} ${ruleType} workflow registration failed (${workflowResponse.status}): ${String(workflowJson.message ?? 'Unknown Zoho error')}`,
        );
      }

      workflowIds[ruleType] = workflowId;
      createdWorkflowIds.push(workflowId);
    }

    return { webhookIds, workflowIds };
  } catch (error) {
    // Cleanup on failure
    const dc_lower = dc.toLowerCase();
    await Promise.all(
      createdWorkflowIds.map((workflowId) =>
        fetch(
          new URL(
            `/${module}/settings/workflows/${workflowId}`,
            `https://www.zohoapis.${dc_lower}`,
          ).toString(),
          {
            method: 'DELETE',
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
          },
        ).catch(() => undefined),
      ),
    );

    await Promise.all(
      createdWebhookIds.map((webhookId) =>
        fetch(
          new URL(`/${module}/settings/webhooks/${webhookId}`, `https://www.zohoapis.${dc_lower}`).toString(),
          {
            method: 'DELETE',
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
          },
        ).catch(() => undefined),
      ),
    );

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
  const dc_lower = input.dc.toLowerCase();

  await Promise.all(
    (input.workflowIds ?? []).map((workflowId) =>
      fetch(
        new URL(`/${module}/settings/workflows/${workflowId}`, `https://www.zohoapis.${dc_lower}`).toString(),
        {
          method: 'DELETE',
          headers: { Authorization: `Zoho-oauthtoken ${input.accessToken}` },
        },
      ).catch(() => undefined),
    ),
  );

  const webhookIds = [...new Set([input.remoteWebhookId, ...(input.remoteWebhookIds ?? [])].filter((id): id is string => Boolean(id)))];
  await Promise.all(
    webhookIds.map((webhookId) =>
      fetch(
        new URL(`/${module}/settings/webhooks/${webhookId}`, `https://www.zohoapis.${dc_lower}`).toString(),
        {
          method: 'DELETE',
          headers: { Authorization: `Zoho-oauthtoken ${input.accessToken}` },
        },
      ).catch(() => undefined),
    ),
  );
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const payload: WebhookSetupPayload = await req.json();
    const {
      tenant_id,
      tenant_integration_id,
      integration_type_id,
      org_id,
      access_token,
      refresh_token,
      actor_user_id,
    } = payload;

    console.log('[webhook-setup] starting for integration', { tenant_integration_id, integration_type_id });

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const dc = (Deno.env.get('ZOHO_DC') ?? 'in').toLowerCase();
    const now = new Date().toISOString();
    let webhookSetupByEntity: WebhookSetupByEntity = {};
    const webhookIdsByEntity: Record<string, string> = {};

    const definitions = getIntegrationWebhookDefinitions(
      integration_type_id as 'zoho_books' | 'zoho_inventory',
    );

    for (const definition of definitions) {
      try {
        const { data: webhook } = await db
          .schema('app')
          .from('integration_webhooks')
          .select('id, endpoint_token, remote_webhook_id, secret, webhook_config')
          .eq('tenant_integration_id', tenant_integration_id)
          .eq('provider', 'zoho')
          .eq('entity_type', definition.entity_type)
          .is('deleted_at', null)
          .maybeSingle();

        if (!webhook) {
          throw new Error(`Webhook record not found for ${definition.entity_type}`);
        }

        webhookIdsByEntity[definition.entity_type] = webhook.id;
        const callbackUrl = `${getSupabaseFunctionsUrl()}/integrations-webhook/${webhook.endpoint_token}`;

        // Cleanup old registrations
        const existingConfig = webhook && 'webhook_config' in webhook ? webhook.webhook_config : null;
        const workflowIds = extractWorkflowIds(toRecord(existingConfig).workflow_ids);
        const remoteWebhookIds = extractWorkflowIds(toRecord(existingConfig).remote_webhook_ids);

        if (webhook.remote_webhook_id || workflowIds.length > 0) {
          await deleteZohoWebhookRegistration({
            accessToken: access_token,
            orgId: org_id,
            dc,
            integrationTypeId: integration_type_id,
            remoteWebhookId: webhook.remote_webhook_id,
            remoteWebhookIds,
            workflowIds,
          });
        }

        await deleteZohoWebhookRegistrationsByName({
          accessToken: access_token,
          orgId: org_id,
          dc,
          integrationTypeId: integration_type_id,
          webhookNames: (definition.workflow_rule_types ?? ['add_edit']).map((ruleType) =>
            buildZohoWebhookRegistrationName({ entityType: definition.entity_type, ruleType })
          ),
          callbackUrls: [callbackUrl],
        });

        // Register new webhooks
        const webhookSecret = (webhook.secret ?? crypto.randomUUID()).replace(/-/g, '');
        const registration = await registerZohoWebhook(
          access_token,
          org_id,
          dc,
          callbackUrl,
          integration_type_id,
          definition.entity_type,
          definition.provider_entity,
          webhookSecret,
          definition.workflow_rule_types,
        );

        const remoteWebhookId = registration.webhookIds.add_edit ?? Object.values(registration.webhookIds)[0] ?? null;
        console.log('[webhook-setup] registered successfully', {
          entity_type: definition.entity_type,
          webhook_id: remoteWebhookId,
        });

        // Update webhook record
        await db
          .schema('app')
          .from('integration_webhooks')
          .update({
            remote_webhook_id: remoteWebhookId,
            external_ref: remoteWebhookId,
            status: 'active',
            webhook_config: {
              sync_phase: definition.sync_phase,
              integration_type_id: integration_type_id ?? 'zoho_books',
              workflow_ids: registration.workflowIds,
              remote_webhook_ids: registration.webhookIds,
            },
            secret: webhookSecret,
            is_active: Boolean(remoteWebhookId),
            last_verified_at: remoteWebhookId ? now : null,
            updated_by: actor_user_id,
          })
          .eq('id', webhook.id);

        webhookSetupByEntity[definition.entity_type] = {
          status: 'active',
          attempted_at: now,
          last_error: null,
          external_ref: remoteWebhookId,
          last_success_at: now,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[webhook-setup] failed for entity', {
          entity_type: definition.entity_type,
          error: message,
        });

        const { data: webhook } = await db
          .schema('app')
          .from('integration_webhooks')
          .select('id')
          .eq('tenant_integration_id', tenant_integration_id)
          .eq('provider', 'zoho')
          .eq('entity_type', definition.entity_type)
          .is('deleted_at', null)
          .maybeSingle();

        if (webhook) {
          await db
            .schema('app')
            .from('integration_webhooks')
            .update({
              remote_webhook_id: null,
              external_ref: null,
              status: 'failed',
              is_active: false,
              webhook_config: {
                sync_phase: definition.sync_phase,
                workflow_ids: {},
                remote_webhook_ids: {},
              },
              last_verified_at: null,
              updated_by: actor_user_id,
            })
            .eq('id', webhook.id);
        }

        webhookSetupByEntity[definition.entity_type] = {
          status: 'failed',
          attempted_at: now,
          last_error: message,
          external_ref: null,
          last_success_at: null,
        };
      }
    }

    // Determine overall setup status
    const allActive = Object.values(webhookSetupByEntity).every((state) => state.status === 'active');
    const webhookSetupState: WebhookSetupState = allActive
      ? {
        status: 'active',
        attempted_at: now,
        last_error: null,
        external_ref: null,
        last_success_at: now,
      }
      : {
        status: 'failed',
        attempted_at: now,
        last_error: Object.entries(webhookSetupByEntity)
          .filter(([, state]) => state.status === 'failed')
          .map(([entity, state]) => `${entity}: ${state.last_error}`)
          .join('; '),
        external_ref: null,
        last_success_at: null,
      };

    // Update integration config
    const { data: integration } = await db
      .schema('app')
      .from('tenant_integrations')
      .select('config')
      .eq('id', tenant_integration_id)
      .single();

    const currentConfig = integration?.config ?? {};

    await db
      .schema('app')
      .from('tenant_integrations')
      .update({
        config: {
          ...currentConfig,
          webhook_setup_by_entity: webhookSetupByEntity,
          webhook_setup: webhookSetupState,
        },
        updated_by: actor_user_id,
      })
      .eq('id', tenant_integration_id);

    console.log('[webhook-setup] completed', {
      status: webhookSetupState.status,
      entity_count: Object.keys(webhookSetupByEntity).length,
      active_count: Object.values(webhookSetupByEntity).filter((s) => s.status === 'active').length,
    });

    return new Response(JSON.stringify({ ok: true, status: webhookSetupState.status }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[webhook-setup] fatal error:', error);
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
