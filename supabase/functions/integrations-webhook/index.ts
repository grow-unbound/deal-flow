// supabase/functions/integrations-webhook/index.ts

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { persistZohoEntityPage } from '../_shared/integrations-persist.ts';
import {
  loadWebhookByToken,
  validateWebhookSecret,
  parseWebhookBody,
  extractEntityPayload,
  resolveWebhookOperation,
  resolveExternalId,
  touchWebhookLastReceived,
} from '../_shared/zoho-webhook-utils.ts';

// Maps integration_webhooks.entity_type → persistZohoEntityPage phase param
const PHASE_BY_ENTITY: Record<string, string> = {
  contacts: 'customers',
  items: 'products',
  estimates: 'estimates',
  salesorders: 'orders',
  invoices: 'invoices',
};

// Maps persist phase → app schema table name (for soft-delete path)
const TABLE_BY_PHASE: Record<string, string> = {
  customers: 'buyers',
  products: 'tenant_products',
  estimates: 'estimates',
  orders: 'orders',
  invoices: 'invoices',
};

// Extract endpoint_token from URL path: /integrations-webhook/{token}
function extractTokenFromPath(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  return last && last !== 'integrations-webhook' ? last : null;
}

// Always return HTTP 200 — Zoho retries on any non-200, which causes duplicate processing
function ok(reason: string): Response {
  return new Response(reason, { status: 200, headers: { 'content-type': 'text/plain' } });
}

// Create placeholder webhook event record at START
async function createWebhookEventPlaceholder(
  admin: SupabaseClient,
  opts: {
    tenantId: string;
    tenantIntegrationId: string;
    webhookId: string;
    entityType: string;
    externalEntityId: string | null;
    rawPayload: Record<string, unknown>;
  },
): Promise<string | null> {
  try {
    const { data, error } = await admin.schema('app').from('integration_webhook_events').insert({
      tenant_id: opts.tenantId,
      tenant_integration_id: opts.tenantIntegrationId,
      integration_webhook_id: opts.webhookId,
      entity_type: opts.entityType,
      external_entity_id: opts.externalEntityId,
      processing_status: 'received',
      raw_payload: opts.rawPayload,
    }).select('id').single();

    if (error) {
      console.error(`[webhook-events] failed to create placeholder: ${error.message}`);
      return null;
    }

    return data?.id ?? null;
  } catch (e) {
    console.error(`[webhook-events] exception creating placeholder: ${String(e)}`);
    return null;
  }
}

// Check if the record was just created locally (echo guard)
async function isEchoGuarded(
  admin: SupabaseClient,
  opts: {
    tenantId: string;
    phase: string;
    externalId: string;
  },
): Promise<boolean> {
  try {
    const table = TABLE_BY_PHASE[opts.phase];
    if (!table) return false;

    // Check if record was created in the last 10 seconds (fresh local create)
    const { data } = await admin.schema('app').from(table)
      .select('created_at')
      .eq('tenant_id', opts.tenantId)
      .eq('external_ref', opts.externalId)
      .is('deleted_at', null)
      .gt('created_at', new Date(Date.now() - 10000).toISOString())
      .maybeSingle();

    return !!data;
  } catch {
    return false;
  }
}

// Update webhook event record with final status and delta
async function updateWebhookEventResult(
  admin: SupabaseClient,
  opts: {
    eventId: string;
    status: 'processed' | 'failed' | 'ignored';
    delta: Record<string, unknown>;
    errorMessage?: string;
  },
): Promise<void> {
  try {
    await admin.schema('app').from('integration_webhook_events').update({
      processing_status: opts.status,
      processed_at: new Date().toISOString(),
      runtime_meta: {
        delta: opts.delta,
        error: opts.errorMessage,
      },
    }).eq('id', opts.eventId);
  } catch (e) {
    console.error(`[webhook-events] failed to update event: ${String(e)}`);
  }
}

// Log webhook error to integration_webhook_errors
async function logWebhookError(
  admin: SupabaseClient,
  opts: {
    tenantId: string;
    tenantIntegrationId: string;
    webhookId: string;
    eventId: string | null;
    entityType: string;
    externalEntityId: string | null;
    errorCode: string;
    errorMessage: string;
  },
): Promise<void> {
  try {
    await admin.schema('app').from('integration_webhook_errors').insert({
      tenant_id: opts.tenantId,
      tenant_integration_id: opts.tenantIntegrationId,
      integration_webhook_id: opts.webhookId,
      integration_webhook_event_id: opts.eventId,
      entity_type: opts.entityType,
      external_entity_id: opts.externalEntityId,
      error_code: opts.errorCode,
      error_message: opts.errorMessage,
    });
  } catch (e) {
    console.error(`[webhook-errors] failed to log error: ${String(e)}`);
  }
}

Deno.serve(async (req: Request) => {
  const traceId = crypto.randomUUID().slice(0, 8);
  console.log(`[${traceId}] webhook start | method=${req.method}`);

  let eventId: string | null = null;

  try {
    if (req.method !== 'POST') {
      console.log(`[${traceId}] non-POST request, returning ok`);
      return ok('ok');
    }

    const url = new URL(req.url);
    console.log(`[${traceId}] url=${url.pathname}${url.search}`);

    const endpointToken =
      extractTokenFromPath(url.pathname) ??
      url.searchParams.get('endpoint_token') ??
      req.headers.get('x-endpoint-token');

    console.log(`[${traceId}] endpoint_token=${endpointToken ? 'present' : 'missing'}`);
    if (!endpointToken) {
      console.log(`[${traceId}] FAIL: no_token`);
      return ok('no_token');
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    console.log(`[${traceId}] admin client created`);

    console.log(`[${traceId}] loading webhook by token`);
    const webhook = await loadWebhookByToken(admin, endpointToken);
    console.log(`[${traceId}] webhook loaded | id=${webhook?.id ?? 'null'} | entity_type=${webhook?.entity_type} | is_active=${webhook?.is_active} | status=${webhook?.status}`);

    if (!webhook || !webhook.is_active || webhook.status !== 'active') {
      console.log(`[${traceId}] FAIL: inactive webhook`);
      return ok('inactive');
    }

    console.log(`[${traceId}] validating webhook secret`);
    if (!validateWebhookSecret(req, webhook.secret)) {
      console.log(`[${traceId}] FAIL: auth_failed - secret mismatch`);
      return ok('auth_failed');
    }
    console.log(`[${traceId}] secret validated ✓`);

    const entityType: string = webhook.entity_type;
    const phase = PHASE_BY_ENTITY[entityType];
    console.log(`[${traceId}] entity_type=${entityType} | phase=${phase}`);

    if (!phase) {
      console.log(`[${traceId}] FAIL: unsupported_entity`);
      return ok('unsupported_entity');
    }

    const webhookConfig = (webhook.webhook_config ?? {}) as Record<string, unknown>;
    const integrationTypeId: string =
      (webhookConfig['integration_type_id'] as string) ?? 'zoho_books';
    console.log(`[${traceId}] integration_type_id=${integrationTypeId}`);

    console.log(`[${traceId}] parsing body...`);
    const body = await parseWebhookBody(req);
    console.log(`[${traceId}] body parsed | body_present=${!!body} | body_keys=${body ? Object.keys(body).slice(0, 5).join(',') : 'none'}`);

    const eventTypeParam = url.searchParams.get('event_type');
    console.log(`[${traceId}] event_type_param=${eventTypeParam}`);

    const operation: 'upsert' | 'delete' | null =
      eventTypeParam === 'delete' ? 'delete' :
      eventTypeParam === 'upsert' ? 'upsert' :
      (body ? resolveWebhookOperation(body) : null);

    console.log(`[${traceId}] operation=${operation}`);

    if (!operation) {
      console.log(`[${traceId}] FAIL: no operation — logging as skipped`);
      // No operation determinable — create placeholder and mark skipped
      eventId = await createWebhookEventPlaceholder(admin, {
        tenantId: webhook.tenant_id,
        tenantIntegrationId: webhook.tenant_integration_id,
        webhookId: webhook.id,
        entityType,
        externalEntityId: null,
        rawPayload: body ?? {},
      });
      if (eventId) {
        await updateWebhookEventResult(admin, {
          eventId,
          status: 'ignored',
          delta: { reason: body ? 'unknown_operation' : 'empty_payload' },
        });
      }
      return ok('skipped');
    }

    console.log(`[${traceId}] extracting entity payload...`);
    const entityPayload = body ? extractEntityPayload(body, entityType) : null;
    const externalId = resolveExternalId(entityPayload, entityType);
    console.log(`[${traceId}] entity_payload=${entityPayload ? 'present' : 'null'} | external_id=${externalId ?? 'null'}`);

    // Create placeholder event record FIRST
    eventId = await createWebhookEventPlaceholder(admin, {
      tenantId: webhook.tenant_id,
      tenantIntegrationId: webhook.tenant_integration_id,
      webhookId: webhook.id,
      entityType,
      externalEntityId: externalId,
      rawPayload: body ?? {},
    });

    // Check echo guard (skip if record was just created locally)
    if (externalId && (operation === 'upsert' || operation === 'delete')) {
      const isGuarded = await isEchoGuarded(admin, {
        tenantId: webhook.tenant_id,
        phase,
        externalId,
      });
      if (isGuarded) {
        console.log(`[${traceId}] ECHO GUARDED: skipping locally-created record`);
        if (eventId) {
          await updateWebhookEventResult(admin, {
            eventId,
            status: 'ignored',
            delta: { reason: 'echo_guard_prevented_overwrite' },
          });
        }
        await touchWebhookLastReceived(admin, webhook.id);
        return ok('echo_guarded');
      }
    }

    if (operation === 'delete') {
      console.log(`[${traceId}] processing DELETE operation`);
      if (externalId) {
        const table = TABLE_BY_PHASE[phase];
        console.log(`[${traceId}] soft-deleting from table=${table}`);
        if (table) {
          const result = await admin.schema('app').from(table)
            .update({ deleted_at: new Date().toISOString() })
            .eq('tenant_id', webhook.tenant_id)
            .eq('external_ref', externalId)
            .is('deleted_at', null);
          console.log(`[${traceId}] soft-delete result | error=${result.error ? result.error.message : 'none'}`);
        }
      }
      await touchWebhookLastReceived(admin, webhook.id);
      if (eventId) {
        await updateWebhookEventResult(admin, {
          eventId,
          status: 'processed',
          delta: { operation: 'soft_delete', external_id: externalId, table: TABLE_BY_PHASE[phase] },
        });
      }
      console.log(`[${traceId}] SUCCESS: deleted | external_id=${externalId}`);
      return ok('deleted');
    }

    // Upsert path
    if (!entityPayload) {
      console.log(`[${traceId}] FAIL: no entity payload for upsert`);
      if (eventId) {
        await updateWebhookEventResult(admin, {
          eventId,
          status: 'ignored',
          delta: { reason: 'no_entity_payload' },
        });
      }
      return ok('skipped_no_payload');
    }

    console.log(`[${traceId}] calling persistZohoEntityPage...`);
    const persistResult = await persistZohoEntityPage(
      admin,
      webhook.tenant_id,
      null,
      webhook.tenant_integration_id,
      phase,
      integrationTypeId,
      [entityPayload],
    );
    console.log(`[${traceId}] persistZohoEntityPage returned | result.created=${persistResult.created} | result.updated=${persistResult.updated} | result.failed=${persistResult.failed}`);

    if (persistResult.failed && persistResult.failed > 0) {
      console.error(`[${traceId}] PERSIST FAILED: ${persistResult.failed} records failed`);
      if (eventId) {
        await updateWebhookEventResult(admin, {
          eventId,
          status: 'failed',
          delta: { reason: 'persist_failed', failed_count: persistResult.failed },
          errorMessage: 'Webhook entity persistence failed',
        });
      }
      await logWebhookError(admin, {
        tenantId: webhook.tenant_id,
        tenantIntegrationId: webhook.tenant_integration_id,
        webhookId: webhook.id,
        eventId,
        entityType,
        externalEntityId: externalId,
        errorCode: 'PERSIST_FAILED',
        errorMessage: `Persistence failed for ${persistResult.failed} records`,
      });
      return ok('persist_error');
    }

    await touchWebhookLastReceived(admin, webhook.id);
    if (eventId) {
      await updateWebhookEventResult(admin, {
        eventId,
        status: 'processed',
        delta: {
          operation: 'upsert',
          external_id: externalId,
          phase,
          created: persistResult.created,
          updated: persistResult.updated,
        },
      });
    }

    console.log(`[${traceId}] SUCCESS: processed | external_id=${externalId} | phase=${phase}`);
    return ok('processed');
  } catch (err) {
    console.error(`[${traceId}] EXCEPTION: ${String(err)}`);
    if (eventId) {
      await createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      ).schema('app').from('integration_webhook_events').update({
        processing_status: 'failed',
        processed_at: new Date().toISOString(),
        runtime_meta: { error: String(err) },
      }).eq('id', eventId).catch(() => {});
    }
    return ok('error');
  }
});
