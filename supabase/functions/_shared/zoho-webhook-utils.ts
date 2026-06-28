// supabase/functions/_shared/zoho-webhook-utils.ts

import { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// Timing-safe string comparison — mitigates timing attacks on token auth
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still iterate to prevent length-based timing leaks
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ 0;
    return diff === 0 && false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// Load a single integration_webhooks row by endpoint_token
export async function loadWebhookByToken(
  admin: SupabaseClient,
  endpointToken: string,
) {
  const { data, error } = await admin
    .schema('app')
    .from('integration_webhooks')
    .select('id, tenant_id, tenant_integration_id, entity_type, secret, status, is_active, webhook_config')
    .eq('endpoint_token', endpointToken)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Validate x-zoho-webhook-token header against stored secret (timing-safe)
export function validateWebhookSecret(req: Request, secret: string | null): boolean {
  const received = req.headers.get('x-zoho-webhook-token');
  if (!received || !secret) return false;
  return timingSafeEqual(received, secret);
}

// Mapping of Zoho entity_type to the key used in the webhook body
const ENTITY_BODY_KEY: Record<string, string> = {
  contacts: 'contact',
  items: 'item',
  estimates: 'estimate',
  invoices: 'invoice',
  salesorders: 'salesorder',
};

// Parse request body — handles JSON and form-encoded (Zoho sends both)
export async function parseWebhookBody(
  req: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const contentType = req.headers.get('content-type') ?? '';
    // Zoho's Default Payload sends JSON. Some legacy/alternate configs might send form-encoded,
    // so we check for that as a fallback, but the primary path is JSON.
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await req.text();
      const params = new URLSearchParams(text);
      const payloadStr = params.get('payload');
      if (payloadStr) {
        try { return JSON.parse(payloadStr); } catch { /* fall through */ }
      }
      const obj: Record<string, unknown> = {};
      for (const [k, v] of params.entries()) obj[k] = v;
      return Object.keys(obj).length > 0 ? obj : null;
    }
    // Primary path: Zoho's Default Payload sends application/json
    // Includes charset variations: application/json, application/json;charset=UTF-8, etc.
    const text = await req.text();
    if (!text || text.trim() === '') return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Extract the entity payload from the request body.
// Zoho sends: body.contact, body.item, body.estimate, etc.
// Falls back to body.payload, body.entity, then the root body if it has the entity ID field.
export function extractEntityPayload(
  body: Record<string, unknown>,
  entityType: string,
): Record<string, unknown> | null {
  const key = ENTITY_BODY_KEY[entityType] ?? entityType;

  const fromKey = body[key];
  if (fromKey && typeof fromKey === 'object') return fromKey as Record<string, unknown>;

  const fromPayload = body['payload'];
  if (fromPayload && typeof fromPayload === 'object') return fromPayload as Record<string, unknown>;

  const fromEntity = body['entity'];
  if (fromEntity && typeof fromEntity === 'object') return fromEntity as Record<string, unknown>;

  // If the root body itself carries the entity (e.g. body.contact_id is present)
  const idField = `${key}_id`;
  if (body[idField]) return body;

  return null;
}

// Resolve operation from event_type or operation field in the body.
// Used as a fallback when the URL query param is absent (e.g. manually sent webhooks).
export function resolveWebhookOperation(
  body: Record<string, unknown>,
): 'upsert' | 'delete' | null {
  const raw = String(body['event_type'] ?? body['operation'] ?? '').toLowerCase();
  if (!raw) return null;
  if (raw.includes('delete') || raw.endsWith('deleted') || raw === 'delete') return 'delete';
  if (
    raw.includes('add_edit') || raw.includes('created') || raw.includes('updated') ||
    raw.includes('upsert') || raw.includes('changed') || raw === 'create' || raw === 'update'
  ) return 'upsert';
  return null;
}

const ID_FIELDS: Record<string, string> = {
  contacts: 'contact_id',
  items: 'item_id',
  estimates: 'estimate_id',
  invoices: 'invoice_id',
  salesorders: 'salesorder_id',
};

export function resolveExternalId(
  payload: Record<string, unknown> | null,
  entityType: string,
): string | null {
  if (!payload) return null;
  const field = ID_FIELDS[entityType];
  if (field && payload[field]) return String(payload[field]);
  for (const f of ['entity_id', 'id']) {
    if (payload[f]) return String(payload[f]);
  }
  return null;
}

// Write a minimal audit row to integration_webhook_events (non-fatal)
export async function logWebhookEvent(
  admin: SupabaseClient,
  opts: {
    webhookId: string;
    tenantId: string;
    tenantIntegrationId: string;
    entityType: string;
    eventType: string;
    externalEntityId: string | null;
    status: 'success' | 'error' | 'skipped';
    runtimeMeta: Record<string, unknown>;
  },
): Promise<void> {
  try {
    console.log('[webhook-utils] logWebhookEvent: preparing insert', {
      webhookId: opts.webhookId,
      tenantId: opts.tenantId,
      entityType: opts.entityType,
      status: opts.status,
    });

    const { data, error } = await admin.schema('app').from('integration_webhook_events').insert({
      integration_webhook_id: opts.webhookId,
      tenant_id: opts.tenantId,
      tenant_integration_id: opts.tenantIntegrationId,
      entity_type: opts.entityType,
      event_type: opts.eventType,
      external_entity_id: opts.externalEntityId,
      status: opts.status,
      runtime_meta: opts.runtimeMeta,
      received_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[webhook-utils] logWebhookEvent DB error', {
        code: error.code,
        message: error.message,
        details: error.details,
      });
    } else {
      console.log('[webhook-utils] logWebhookEvent success', {
        data,
      });
    }
  } catch (e) {
    console.error('[webhook-utils] logWebhookEvent exception', String(e));
  }
}

// Touch last_received_at on the webhook row to track liveness (non-fatal)
export async function touchWebhookLastReceived(
  admin: SupabaseClient,
  webhookId: string,
): Promise<void> {
  try {
    await admin.schema('app').from('integration_webhooks')
      .update({ last_received_at: new Date().toISOString() })
      .eq('id', webhookId);
  } catch { /* non-fatal */ }
}
