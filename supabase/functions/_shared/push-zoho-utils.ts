/**
 * push-zoho-utils.ts
 * Shared helpers for reverse-sync push functions (Yukti → Zoho).
 * Used by push-estimate-to-zoho and push-order-to-zoho.
 */

import { ZOHO_INTEGRATION_TYPE_IDS } from '../../../src/lib/integrations/contracts.ts';
import type { ZohoIntegrationTypeId } from '../../../src/lib/integrations/contracts.ts';
import { createAdminClient, loadIntegrationCredentials, createDbTokenCache } from './sync-utils.ts';
import { createZohoAdapter } from './integrations-zoho.ts';

export type AdminClient = ReturnType<typeof createAdminClient>;

// ── Integration lookup ──────────────────────────────────────────────────────

interface TenantZohoIntegration {
  integrationId: string;
  integrationTypeId: ZohoIntegrationTypeId;
  credentials: Record<string, unknown>;
}

export async function lookupTenantZohoIntegration(
  admin: AdminClient,
  tenantId: string,
): Promise<TenantZohoIntegration | null> {
  const { data, error } = await admin
    .schema('app')
    .from('tenant_integrations')
    .select('id, integration_type_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'connected')
    .in('integration_type_id', [...ZOHO_INTEGRATION_TYPE_IDS])
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const integrationTypeId = data.integration_type_id as ZohoIntegrationTypeId;
  const credentials = await loadIntegrationCredentials(admin, data.id, integrationTypeId);

  return { integrationId: data.id, integrationTypeId, credentials };
}

export function buildZohoAdapter(integration: TenantZohoIntegration, admin: AdminClient) {
  const tokenCache = createDbTokenCache(admin, integration.integrationId);
  return createZohoAdapter(integration.integrationTypeId, integration.credentials, tokenCache);
}

// ── FK resolution ───────────────────────────────────────────────────────────

export async function resolveBuyerZohoContactId(
  admin: AdminClient,
  buyerId: string,
): Promise<string | null> {
  const { data } = await admin
    .schema('app')
    .from('buyers')
    .select('external_ref')
    .eq('id', buyerId)
    .maybeSingle();
  return (data?.external_ref as string | null | undefined) ?? null;
}

interface ProductZohoRef {
  id: string;
  external_ref: string | null;
  name_override: string | null;
  internal_sku: string;
}

export async function resolveProductZohoItemIds(
  admin: AdminClient,
  productIds: string[],
): Promise<Map<string, { itemId: string; name: string; sku: string }>> {
  if (productIds.length === 0) return new Map();

  const { data } = await admin
    .schema('app')
    .from('tenant_products')
    .select('id, external_ref, name_override, internal_sku')
    .in('id', productIds);

  const result = new Map<string, { itemId: string; name: string; sku: string }>();
  for (const row of (data ?? []) as ProductZohoRef[]) {
    if (row.external_ref) {
      result.set(row.id, {
        itemId: row.external_ref,
        name: row.name_override ?? row.internal_sku,
        sku: row.internal_sku,
      });
    }
  }
  return result;
}

interface BuyerGstInfo {
  gstin: string | null;
  gst_treatment: string | null;
}

export async function resolveBuyerGstInfo(
  admin: AdminClient,
  buyerId: string,
): Promise<BuyerGstInfo> {
  const { data } = await admin
    .schema('app')
    .from('buyers')
    .select('gstin')
    .eq('id', buyerId)
    .maybeSingle();

  const gstin = (data?.gstin as string | null | undefined) ?? null;
  return {
    gstin: gstin?.trim() || null,
    gst_treatment: gstin?.trim() ? 'business_gst' : null,
  };
}

// ── Date formatting ─────────────────────────────────────────────────────────

export function formatIstDate(date: Date): string {
  // Zoho expects YYYY-MM-DD in the org's timezone (IST = UTC+5:30)
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

// ── Post-push DB updates ────────────────────────────────────────────────────

interface PushSuccessOpts {
  tenantId: string;
  integrationId: string;
  entityTable: 'estimates' | 'orders';
  entityType: 'estimates' | 'orders';
  internalId: string;
  externalZohoId: string;
  extraFields?: Record<string, unknown>;
}

export async function recordPushSuccess(
  admin: AdminClient,
  opts: PushSuccessOpts,
): Promise<void> {
  await admin
    .schema('app')
    .from(opts.entityTable)
    .update({
      external_ref: opts.externalZohoId,
      ...opts.extraFields,
      updated_at: new Date().toISOString(),
    })
    .eq('id', opts.internalId);

  await admin
    .schema('app')
    .from('integration_entity_map')
    .upsert(
      {
        tenant_id: opts.tenantId,
        tenant_integration_id: opts.integrationId,
        entity_type: opts.entityType,
        external_id: opts.externalZohoId,
        internal_id: opts.internalId,
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,tenant_integration_id,entity_type,external_id' },
    );
}

interface EchoGuardOpts {
  tenantId: string;
  integrationId: string;
  entityType: string;
  internalId: string;
  externalZohoId: string;
  protectedFields: string[];
}

export async function createEchoGuard(
  admin: AdminClient,
  opts: EchoGuardOpts,
): Promise<void> {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await admin
    .schema('app')
    .from('integration_webhook_echo_guards')
    .insert({
      tenant_id: opts.tenantId,
      tenant_integration_id: opts.integrationId,
      entity_type: opts.entityType,
      local_entity_id: opts.internalId,
      external_entity_id: opts.externalZohoId,
      protected_fields: opts.protectedFields,
      expires_at: expiresAt,
    });
}

interface PushFailureOpts {
  tenantId: string;
  integrationId: string;
  entityType: 'estimates' | 'orders';
  internalId: string;
  errorReason: string;
}

export async function recordPushFailure(
  admin: AdminClient,
  opts: PushFailureOpts,
): Promise<void> {
  await admin
    .schema('app')
    .from('integration_entity_map')
    .upsert(
      {
        tenant_id: opts.tenantId,
        tenant_integration_id: opts.integrationId,
        entity_type: opts.entityType,
        // Use a placeholder external_id so the upsert unique key doesn't conflict;
        // real external_id will be set on push success.
        external_id: `pending:${opts.internalId}`,
        internal_id: opts.internalId,
        sync_status: 'error',
        error_reason: opts.errorReason.slice(0, 2000),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,tenant_integration_id,entity_type,external_id' },
    );
}

// ── Secret verification ─────────────────────────────────────────────────────

export function verifyPushSecret(req: Request): boolean {
  const secret = Deno.env.get('INTEGRATIONS_PUSH_SECRET')?.trim()
    ?? Deno.env.get('INTEGRATIONS_DISPATCH_SECRET')?.trim();
  if (!secret) return true; // no secret configured → open (dev mode)
  const provided = req.headers.get('x-push-secret')?.trim() ?? '';
  if (provided.length !== secret.length) return false;
  // Timing-safe compare using TextEncoder
  const enc = new TextEncoder();
  const a = enc.encode(provided);
  const b = enc.encode(secret);
  let diff = 0;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

// ── Webhook body parsing ────────────────────────────────────────────────────

export function parseWebhookRecord(body: unknown): Record<string, unknown> | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.record && typeof b.record === 'object') return b.record as Record<string, unknown>;
  if (b.type === 'INSERT' && b.record) return b.record as Record<string, unknown>;
  return null;
}

// ── JSON responses ──────────────────────────────────────────────────────────

export function ok(data: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
