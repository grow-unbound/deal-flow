// supabase/functions/integrations-webhook/index.ts

import { createClient } from 'npm:@supabase/supabase-js@2';
import { persistZohoEntityPage } from '../_shared/integrations-persist.ts';
import {
  loadWebhookByToken,
  validateWebhookSecret,
  parseWebhookBody,
  extractEntityPayload,
  resolveWebhookOperation,
  resolveExternalId,
  logWebhookEvent,
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

Deno.serve(async (req: Request) => {
  const traceId = crypto.randomUUID().slice(0, 8);
  console.log(`[${traceId}] webhook start | method=${req.method}`);

  try {
    if (req.method !== 'POST') {
      console.log(`[${traceId}] non-POST request, returning ok`);
      return ok('ok');
    }

    const url = new URL(req.url);
    console.log(`[${traceId}] url=${url.pathname}${url.search}`);

    // 1. Extract endpoint_token from URL path, query param, or header
    const endpointToken =
      extractTokenFromPath(url.pathname) ??
      url.searchParams.get('endpoint_token') ??
      req.headers.get('x-endpoint-token');

    console.log(`[${traceId}] endpoint_token=${endpointToken ? 'present' : 'missing'}`);
    if (!endpointToken) {
      console.log(`[${traceId}] FAIL: no_token`);
      return ok('no_token');
    }

    // 2. Admin client — service role bypasses RLS
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    console.log(`[${traceId}] admin client created`);

    // 3. Load webhook row — the endpoint_token IS the authentication mechanism
    console.log(`[${traceId}] loading webhook by token`);
    const webhook = await loadWebhookByToken(admin, endpointToken);
    console.log(`[${traceId}] webhook loaded | id=${webhook?.id ?? 'null'} | entity_type=${webhook?.entity_type} | is_active=${webhook?.is_active} | status=${webhook?.status}`);

    if (!webhook || !webhook.is_active || webhook.status !== 'active') {
      console.log(`[${traceId}] FAIL: inactive webhook`);
      return ok('inactive'); // 200, not 404 — don't reveal endpoint existence
    }

    // 4. Validate x-zoho-webhook-token header (timing-safe)
    console.log(`[${traceId}] validating webhook secret`);
    if (!validateWebhookSecret(req, webhook.secret)) {
      console.log(`[${traceId}] FAIL: auth_failed - secret mismatch`);
      return ok('auth_failed'); // 200, not 401 — prevents Zoho retry loop on bad token
    }
    console.log(`[${traceId}] secret validated ✓`);

    const entityType: string = webhook.entity_type;
    const phase = PHASE_BY_ENTITY[entityType];
    console.log(`[${traceId}] entity_type=${entityType} | phase=${phase}`);

    if (!phase) {
      console.log(`[${traceId}] FAIL: unsupported_entity`);
      return ok('unsupported_entity');
    }

    // 5. Resolve integration_type_id — stored at registration time in webhook_config
    // Falls back to 'zoho_books' (safe: this system is Zoho Books only today)
    const webhookConfig = (webhook.webhook_config ?? {}) as Record<string, unknown>;
    const integrationTypeId: string =
      (webhookConfig['integration_type_id'] as string) ?? 'zoho_books';
    console.log(`[${traceId}] integration_type_id=${integrationTypeId}`);

    // 6. Determine operation — URL query param is authoritative (set at Zoho registration time
    //    via ?event_type=upsert or ?event_type=delete). Fall back to body parsing for
    //    manually sent or legacy webhooks.
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
      // No operation determinable — log and return 200. Never trigger a sync.
      await touchWebhookLastReceived(admin, webhook.id);
      await logWebhookEvent(admin, {
        webhookId: webhook.id,
        tenantId: webhook.tenant_id,
        tenantIntegrationId: webhook.tenant_integration_id,
        entityType,
        eventType: 'unknown',
        externalEntityId: null,
        status: 'skipped',
        runtimeMeta: { reason: body ? 'unknown_operation' : 'empty_payload' },
      });
      return ok('skipped');
    }

    // 7. Extract entity payload and external ID
    console.log(`[${traceId}] extracting entity payload...`);
    const entityPayload = body ? extractEntityPayload(body, entityType) : null;
    const externalId = resolveExternalId(entityPayload, entityType);
    console.log(`[${traceId}] entity_payload=${entityPayload ? 'present' : 'null'} | external_id=${externalId ?? 'null'}`);

    if (operation === 'delete') {
      console.log(`[${traceId}] processing DELETE operation`);
      // Zoho sends only the entity ID on delete events (entity is already gone in Zoho)
      if (externalId) {
        const table = TABLE_BY_PHASE[phase];
        console.log(`[${traceId}] soft-deleting from table=${table}`);
        if (table) {
          // Idempotent: only updates rows not already soft-deleted
          const result = await admin.schema('app').from(table)
            .update({ deleted_at: new Date().toISOString() })
            .eq('tenant_id', webhook.tenant_id)
            .eq('external_ref', externalId)
            .is('deleted_at', null);
          console.log(`[${traceId}] soft-delete result | error=${result.error ? result.error.message : 'none'}`);
        }
      }
      await touchWebhookLastReceived(admin, webhook.id);
      await logWebhookEvent(admin, {
        webhookId: webhook.id,
        tenantId: webhook.tenant_id,
        tenantIntegrationId: webhook.tenant_integration_id,
        entityType,
        eventType: 'delete',
        externalEntityId: externalId,
        status: 'success',
        runtimeMeta: { operation: 'soft_delete', table: TABLE_BY_PHASE[phase] ?? null },
      });
      console.log(`[${traceId}] SUCCESS: deleted | external_id=${externalId}`);
      return ok('deleted');
    }

    // Upsert: Zoho sends the full entity on add_edit events
    if (!entityPayload) {
      console.log(`[${traceId}] FAIL: no entity payload for upsert`);
      await logWebhookEvent(admin, {
        webhookId: webhook.id,
        tenantId: webhook.tenant_id,
        tenantIntegrationId: webhook.tenant_integration_id,
        entityType,
        eventType: 'upsert',
        externalEntityId: null,
        status: 'skipped',
        runtimeMeta: { reason: 'no_entity_payload' },
      });
      return ok('skipped_no_payload');
    }

    console.log(`[${traceId}] calling persistZohoEntityPage...`);
    // Delegates to the same shared persist layer used by initial_sync and daily_sync
    const persistResult = await persistZohoEntityPage(
      admin,
      webhook.tenant_id,
      null,             // actorId — system-level, no user actor for webhooks
      webhook.tenant_integration_id,
      phase,
      integrationTypeId,
      [entityPayload],  // single-element array; persistZohoEntityPage handles any size
    );
    console.log(`[${traceId}] persistZohoEntityPage returned | result.created=${persistResult.created} | result.updated=${persistResult.updated} | result.failed=${persistResult.failed}`);

    await touchWebhookLastReceived(admin, webhook.id);
    await logWebhookEvent(admin, {
      webhookId: webhook.id,
      tenantId: webhook.tenant_id,
      tenantIntegrationId: webhook.tenant_integration_id,
      entityType,
      eventType: 'upsert',
      externalEntityId: externalId,
      status: 'success',
      runtimeMeta: { operation: 'upsert', phase, persist_result: persistResult },
    });

    console.log(`[${traceId}] SUCCESS: processed | external_id=${externalId} | phase=${phase}`);
    return ok('processed');
  } catch (err) {
    console.error(`[${traceId}] EXCEPTION: ${String(err)}`);
    // Log but always return 200 — Zoho must not retry on errors
    return ok('error');
  }
});
