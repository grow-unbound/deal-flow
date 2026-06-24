/**
 * integrations-persist.ts
 * Persists Zoho entity pages into app.* tables after each fetched page.
 * All persisters are idempotent (upsert-based) so re-runs are safe.
 */

import type { ZohoAdapter } from './integrations-zoho.ts';
import type { ZohoIntegrationTypeId } from '../../../src/lib/integrations/contracts.ts';
import {
  bulkPersistJsonbRecords,
  bulkPersistJsonbRecordsWithIds,
} from '../../../src/lib/integrations/rpc-persist.ts';

// ── Types ───────────────────────────────────────────────────────────────────

export interface PersistResult {
  created: number;
  updated: number;
  skipped: number;
}

type AdminClient = Parameters<typeof persistZohoEntityPage>[0];

// ── Shared utilities ─────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function asStr(v: unknown): string | null {
  if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  return null;
}

function asNum(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function asDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function asDateOnly(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function asBool(v: unknown, defaultVal = false): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true' || v === '1';
  return defaultVal;
}

export function sanitizeZohoPhone(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * A just-created Yukti document may immediately echo back from Zoho. Preserve
 * only the explicitly guarded business fields; remote ids/statuses still merge.
 */
async function applyImmediateEchoGuards(
  admin: AdminClient,
  tenantId: string,
  integrationId: string,
  entityType: 'estimates' | 'orders' | 'invoices',
  table: 'estimates' | 'orders' | 'invoices',
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const externalIds = rows.map((row) => asStr(row.external_ref)).filter((id): id is string => id !== null);
  if (externalIds.length === 0) return rows;

  const now = nowIso();
  const { data: guards } = await admin.schema('app').from('integration_webhook_echo_guards')
    .select('id, external_entity_id, protected_fields')
    .eq('tenant_id', tenantId)
    .eq('tenant_integration_id', integrationId)
    .eq('entity_type', entityType)
    .in('external_entity_id', externalIds)
    .gt('expires_at', now)
    .is('consumed_at', null)
    .is('deleted_at', null);
  if (!guards?.length) return rows;

  const { data: existingRows } = await admin.schema('app').from(table)
    .select('*').eq('tenant_id', tenantId).in('external_ref', externalIds).is('deleted_at', null);
  const existingByExternalRef = new Map(
    (existingRows ?? []).map((row: Record<string, unknown>) => [String(row.external_ref), row]),
  );

  const guardedByExternalRef = new Map(
    guards.map((guard: { id: string; external_entity_id: string; protected_fields: string[] }) => [guard.external_entity_id, guard]),
  );
  const guardedIds: string[] = [];
  const merged = rows.map((row) => {
    const externalRef = asStr(row.external_ref);
    const guard = externalRef ? guardedByExternalRef.get(externalRef) : null;
    const existing = externalRef ? existingByExternalRef.get(externalRef) : null;
    if (!guard || !existing) return row;
    guardedIds.push(guard.id);
    const protectedValues = Object.fromEntries(
      guard.protected_fields
        .filter((field) => Object.prototype.hasOwnProperty.call(existing, field))
        .map((field) => [field, existing[field]]),
    );
    return { ...row, ...protectedValues };
  });

  if (guardedIds.length > 0) {
    await admin.schema('app').from('integration_webhook_echo_guards')
      .update({ consumed_at: now, updated_at: now })
      .in('id', guardedIds);
  }
  return merged;
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    const str = asStr(value);
    if (str) return str;
  }
  return null;
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const num = asNum(value);
    if (num !== null) return num;
  }
  return null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function omitKeys(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const blacklist = new Set(keys);
  return Object.fromEntries(
    Object.entries(source).filter(([key, value]) => !blacklist.has(key) && value !== undefined),
  );
}

function getEmbeddedLocationRows(rec: Record<string, unknown>): Record<string, unknown>[] {
  const candidates = [
    rec.item_locations,
    rec.locations,
    rec.warehouses,
    rec.inventory,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null && !Array.isArray(row));
    }
  }

  return [];
}

function getEmbeddedLocationExternalId(loc: Record<string, unknown>): string | null {
  return (
    asStr(loc.location_id)
    ?? asStr(loc.warehouse_id)
    ?? asStr(loc.item_location_id)
    ?? asStr(loc.id)
  );
}

function getEmbeddedLocationQty(loc: Record<string, unknown>): number {
  return (
    asNum(loc.location_available_stock)
    ?? asNum(loc.warehouse_available_stock)
    ?? asNum(loc.available_stock)
    ?? asNum(loc.stock_on_hand)
    ?? asNum(loc.quantity)
    ?? 0
  );
}

// ── Entity map helpers ───────────────────────────────────────────────────────

async function resolveInternalId(
  admin: AdminClient,
  tenantId: string,
  integrationId: string,
  entityType: string,
  externalId: string,
): Promise<string | null> {
  const { data } = await admin
    .schema('app')
    .from('integration_entity_map')
    .select('internal_id')
    .eq('tenant_id', tenantId)
    .eq('tenant_integration_id', integrationId)
    .eq('entity_type', entityType)
    .eq('external_id', externalId)
    .is('deleted_at', null)
    .maybeSingle();

  return (data as { internal_id: string } | null)?.internal_id ?? null;
}

async function resolveInternalIds(
  admin: AdminClient,
  tenantId: string,
  integrationId: string,
  entityType: string,
  externalIds: string[],
): Promise<Map<string, string>> {
  if (externalIds.length === 0) return new Map();

  const { data } = await admin
    .schema('app')
    .from('integration_entity_map')
    .select('external_id, internal_id')
    .eq('tenant_id', tenantId)
    .eq('tenant_integration_id', integrationId)
    .eq('entity_type', entityType)
    .in('external_id', externalIds)
    .is('deleted_at', null);

  const map = new Map<string, string>();
  if (Array.isArray(data)) {
    for (const row of data as { external_id: string; internal_id: string }[]) {
      if (row.external_id && row.internal_id) {
        map.set(row.external_id, row.internal_id);
      }
    }
  }
  return map;
}

async function batchUpsertEntityMap(
  admin: AdminClient,
  tenantId: string,
  integrationId: string,
  entityType: string,
  pairs: Array<{ externalId: string; internalId: string }>,
): Promise<void> {
  if (pairs.length === 0) return;

  const rows = pairs.map((p) => ({
    tenant_id: tenantId,
    tenant_integration_id: integrationId,
    entity_type: entityType,
    external_id: p.externalId,
    internal_id: p.internalId,
    last_synced_at: nowIso(),
    sync_status: 'synced',
  }));

  await bulkPersistJsonbRecords(admin, 'integration_entity_map', rows, [
    'tenant_id',
    'tenant_integration_id',
    'entity_type',
    'external_id',
  ]);
}

async function upsertImportedPriceList(
  admin: AdminClient,
  tenantId: string,
  actorId: string | null,
  integrationId: string,
  integrationTypeId: ZohoIntegrationTypeId,
): Promise<string> {
  const externalRef = `zoho_price_list:${integrationTypeId}:base`;
  const name = `Zoho ${integrationTypeId === 'zoho_inventory' ? 'Inventory' : 'Books'} Imported Pricing`;
  const now = nowIso();
  const persisted = await bulkPersistJsonbRecordsWithIds(admin, 'price_lists', [{
    tenant_id: tenantId,
    external_ref: externalRef,
    name,
    currency: 'INR',
    valid_from: now,
    priority: 0,
    is_active: true,
    created_by: actorId,
    updated_by: actorId,
  }], ['tenant_id', 'name']);

  const priceListId = persisted[0] ?? null;
  if (!priceListId) {
    throw new Error('Failed to create imported price list');
  }

  await batchUpsertEntityMap(admin, tenantId, integrationId, 'price_lists', [
    { externalId: externalRef, internalId: priceListId },
  ]);

  return priceListId;
}

function mapPersistedRowsByExternalRef(rows: Record<string, unknown>[]): Array<{ externalId: string; internalId: string }> {
  return rows
    .map((row) => {
      const externalId = asStr(row.external_ref);
      const internalId = asStr(row.id);
      return externalId && internalId ? { externalId, internalId } : null;
    })
    .filter((row): row is { externalId: string; internalId: string } => row !== null);
}

export async function resolveInternalIdsWithFallback(
  admin: AdminClient,
  tenantId: string,
  integrationId: string,
  entityType: string,
  tableName: string,
  externalIds: string[],
): Promise<Map<string, string>> {
  const resolved = await resolveInternalIds(admin, tenantId, integrationId, entityType, externalIds);
  const unresolved = externalIds.filter((externalId) => !resolved.has(externalId));
  if (unresolved.length === 0) return resolved;

  const { data } = await admin
    .schema('app')
    .from(tableName)
    .select('external_ref, id')
    .eq('tenant_id', tenantId)
    .in('external_ref', unresolved)
    .is('deleted_at', null);

  if (Array.isArray(data)) {
    for (const row of data as { external_ref: string | null; id: string | null }[]) {
      if (row.external_ref && row.id) {
        resolved.set(row.external_ref, row.id);
      }
    }
  }

  return resolved;
}

export async function resolveInternalIdWithFallback(
  admin: AdminClient,
  tenantId: string,
  integrationId: string,
  entityType: string,
  tableName: string,
  externalId: string,
): Promise<string | null> {
  const resolved = await resolveInternalIdsWithFallback(admin, tenantId, integrationId, entityType, tableName, [externalId]);
  return resolved.get(externalId) ?? null;
}

export function buildTransactionalSourcePayload(rec: Record<string, unknown>): Record<string, unknown> {
  return omitKeys(rec, ['line_items']);
}

function buildLineItemSignature(line: Record<string, unknown>): Record<string, unknown> {
  return {
    item_id: asStr(line.item_id) ?? asStr(line.product_id),
    sku: asStr(line.sku) ?? asStr(line.item_sku) ?? asStr(line.item_code) ?? asStr(line.code),
    qty: pickNumber(line.quantity, line.qty),
    unit_price: pickNumber(line.rate, line.unit_price, line.price),
    line_total: pickNumber(line.item_total, line.total, line.amount),
    tax_pct: pickNumber(line.tax_percentage, line.tax_rate),
    disc_pct: pickNumber(line.discount_percentage, line.disc_pct),
    scheme_tag: pickString(line.scheme_tag, line.discount_type),
    hsn_code: pickString(line.hsn_code, line.hsn_or_sac, line.hsn_sac),
  };
}

export async function buildChildExternalRef(
  parentExternalRef: string,
  line: Record<string, unknown>,
  lineIndex: number,
): Promise<string> {
  const explicitLineId = pickString(
    line.line_item_id,
    line.line_id,
    line.detail_id,
    line.row_id,
    line.transaction_item_id,
  );

  if (explicitLineId) {
    return `${parentExternalRef}:line:${slugify(explicitLineId)}`;
  }

  const signature = await sha256Hex(JSON.stringify(buildLineItemSignature(line)));
  return `${parentExternalRef}:line:${String(lineIndex + 1).padStart(4, '0')}:${signature.slice(0, 12)}`;
}

async function persistDerivedChildRows(
  admin: AdminClient,
  table: 'estimate_items' | 'order_items' | 'invoice_items',
  parentColumn: 'estimate_id' | 'order_id' | 'invoice_id',
  parentIds: string[],
  rows: Record<string, unknown>[],
): Promise<void> {
  if (parentIds.length === 0) return;

  if (rows.length > 0) {
    await bulkPersistJsonbRecords(admin, table, rows, [parentColumn, 'external_ref']);
  }

  const { data } = await admin
    .schema('app')
    .from(table)
    .select(`id, ${parentColumn}, external_ref`)
    .in(parentColumn, parentIds)
    .is('deleted_at', null);

  if (!Array.isArray(data)) return;

  const desiredByParent = new Map<string, Set<string>>();
  for (const row of rows) {
    const parentId = asStr(row[parentColumn]);
    const externalRef = asStr(row.external_ref);
    if (!parentId || !externalRef) continue;

    if (!desiredByParent.has(parentId)) {
      desiredByParent.set(parentId, new Set());
    }
    desiredByParent.get(parentId)?.add(externalRef);
  }

  const staleIds: string[] = [];
  for (const row of data as Array<{ id: string; external_ref: string | null } & Record<string, unknown>>) {
    const parentId = asStr(row[parentColumn]);
    const externalRef = asStr(row.external_ref);
    if (!parentId || !row.id) continue;

    const desired = desiredByParent.get(parentId);
    if (!desired || !externalRef || !desired.has(externalRef)) {
      staleIds.push(row.id);
    }
  }

  if (staleIds.length > 0) {
    await admin
      .schema('app')
      .from(table)
      .update({ deleted_at: nowIso() })
      .in('id', staleIds)
      .is('deleted_at', null);
  }
}

// ── Locations ────────────────────────────────────────────────────────────────

async function persistLocations(
  admin: AdminClient,
  tenantId: string,
  actorId: string | null,
  integrationId: string,
  integrationTypeId: ZohoIntegrationTypeId,
  records: Record<string, unknown>[],
): Promise<PersistResult> {
  const isInventory = integrationTypeId === 'zoho_inventory';
  const result: PersistResult = { created: 0, updated: 0, skipped: 0 };

  const hasExistingDefault = await (async () => {
    const { count } = await admin
      .schema('app')
      .from('locations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_default', true)
      .is('deleted_at', null);
    return (count ?? 0) > 0;
  })();

  let defaultAssigned = hasExistingDefault;
  const rows: Record<string, unknown>[] = [];

  for (const rec of records) {
    const externalId = asStr(isInventory ? rec.warehouse_id : rec.location_id);
    if (!externalId) { result.skipped++; continue; }

    const name = asStr(isInventory ? rec.warehouse_name : rec.location_name);
    if (!name) { result.skipped++; continue; }

    const isPrimary = asBool(rec.is_primary);
    const isDefault = !defaultAssigned && isPrimary;
    if (isDefault) defaultAssigned = true;

    const rawAddr = rec.address;
    const address = rawAddr && typeof rawAddr === 'object' ? rawAddr : null;

    const row = {
      tenant_id: tenantId,
      external_ref: externalId,
      name,
      address: address as Record<string, unknown> | null,
      ...(isDefault ? { is_default: true } : {}),
      created_by: actorId,
      updated_by: actorId,
    };
    rows.push(row);
  }

  const persisted = rows.length > 0
    ? await bulkPersistJsonbRecords(admin, 'locations', rows, ['tenant_id', 'external_ref'])
    : [];

  const entityMapPairs: Array<{ externalId: string; internalId: string }> = [];
  for (const row of persisted) {
    const externalId = asStr(row.external_ref);
    const internalId = asStr(row.id);
    if (externalId && internalId) {
      entityMapPairs.push({ externalId, internalId });
    }
  }

  result.updated += persisted.length;
  await batchUpsertEntityMap(admin, tenantId, integrationId, 'locations', entityMapPairs);
  return result;
}

// ── Buyers (contacts) + buyer_contacts (contact persons) ────────────────────

async function persistBuyers(
  admin: AdminClient,
  tenantId: string,
  actorId: string | null,
  integrationId: string,
  records: Record<string, unknown>[],
  _adapter: ZohoAdapter,
): Promise<PersistResult> {
  const result: PersistResult = { created: 0, updated: 0, skipped: 0 };
  const buyerRows: Record<string, unknown>[] = [];

  for (const rec of records) {
    const externalId = asStr(rec.contact_id);
    if (!externalId) { result.skipped++; continue; }

    const businessName = asStr(rec.company_name)
      ?? asStr(rec.contact_name)
      ?? asStr(rec.display_name)
      ?? 'Unknown';

    const geo = (() => {
      const addr = rec.billing_address;
      if (!addr || typeof addr !== 'object') return null;
      const a = addr as Record<string, unknown>;
      return {
        state: asStr(a.state),
        city: asStr(a.city),
        address: asStr(a.address) ?? asStr(a.street),
        pincode: asStr(a.zip),
        country: asStr(a.country),
      };
    })();

    const row = {
      tenant_id: tenantId,
      external_ref: externalId,
      business_name: businessName,
      contact_name: asStr(rec.contact_name) ?? asStr(rec.first_name),
      email: asStr(rec.email),
      gstin: asStr(rec.gst_no) ?? asStr((rec as Record<string, unknown>)['cf_gstin']),
      credit_limit: asNum(rec.credit_limit),
      payment_terms_days: asNum(rec.payment_terms) ?? asNum(rec.payment_terms_days),
      geography: geo,
      is_active: (asStr(rec.status) ?? 'active') === 'active',
      created_by: actorId,
      updated_by: actorId,
      ...(sanitizeZohoPhone(rec.phone) ? { phone: sanitizeZohoPhone(rec.phone) } : {}),
    };

    buyerRows.push(row);
  }

  const persistedBuyers = buyerRows.length > 0
    ? await bulkPersistJsonbRecords(admin, 'buyers', buyerRows, ['tenant_id', 'external_ref'])
    : [];

  const buyerMapPairs = persistedBuyers
    .map((row) => {
      const externalId = asStr(row.external_ref);
      const internalId = asStr(row.id);
      return externalId && internalId ? { externalId, internalId } : null;
    })
    .filter((row): row is { externalId: string; internalId: string } => row !== null);
  const buyerIdMap = new Map(buyerMapPairs.map((row) => [row.externalId, row.internalId] as const));

  result.updated += buyerMapPairs.length;

  const contactRows: Record<string, unknown>[] = [];
  for (const rec of records) {
    const externalId = asStr(rec.contact_id);
    if (!externalId) continue;

    const buyerId = buyerIdMap.get(externalId) ?? null;
    if (!buyerId) continue;

    const embeddedContactPersons = Array.isArray((rec as Record<string, unknown>).contact_persons)
      ? (rec as Record<string, unknown>).contact_persons as Record<string, unknown>[]
      : [];

    for (const cp of embeddedContactPersons) {
      const cpId = asStr(cp.contact_person_id);
      if (!cpId) continue;

      contactRows.push({
        buyer_id: buyerId,
        external_ref: cpId,
        role: 'buyer_assistant' as const,
        first_name: asStr(cp.first_name),
        last_name: asStr(cp.last_name),
        email: asStr(cp.email),
        designation: asStr(cp.designation),
        department: asStr(cp.department),
        is_active: asBool(cp.is_active, true),
        created_by: actorId,
        updated_by: actorId,
        ...(sanitizeZohoPhone(cp.phone) ? { phone: sanitizeZohoPhone(cp.phone) } : {}),
        ...(sanitizeZohoPhone(cp.mobile) ? { mobile: sanitizeZohoPhone(cp.mobile) } : {}),
      });
    }
  }

  const persistedContacts = contactRows.length > 0
    ? await bulkPersistJsonbRecords(admin, 'buyer_users', contactRows, ['buyer_id', 'external_ref'])
    : [];

  const contactMapPairs = persistedContacts
    .map((row) => {
      const externalId = asStr(row.external_ref);
      const internalId = asStr(row.id);
      return externalId && internalId ? { externalId, internalId } : null;
    })
    .filter((row): row is { externalId: string; internalId: string } => row !== null);

  await Promise.all([
    batchUpsertEntityMap(admin, tenantId, integrationId, 'customers', buyerMapPairs),
    batchUpsertEntityMap(admin, tenantId, integrationId, 'contact_persons', contactMapPairs),
  ]);

  return result;
}

// ── Products (categories + brands + products + inventory) ────────────────────

async function persistProducts(
  admin: AdminClient,
  tenantId: string,
  actorId: string | null,
  integrationId: string,
  records: Record<string, unknown>[],
): Promise<PersistResult> {
  const result: PersistResult = { created: 0, updated: 0, skipped: 0 };

  // Step A: upsert categories
  const categoryRows = [];
  const categoryMapById = new Map<string, string>();
  const categoryMapByName = new Map<string, string>();

  for (const rec of records) {
    const sourceCategoryId = pickString(rec.category_id, rec.category_ref, rec.category_external_id);
    const categoryName = pickString(rec.category_name, rec.category);
    if (!sourceCategoryId && !categoryName) continue;

    const externalRef = sourceCategoryId ? `zoho_cat:${sourceCategoryId}` : `zoho_cat:${slugify(categoryName ?? 'uncategorized')}`;
    categoryRows.push({
      tenant_id: tenantId,
      external_ref: externalRef,
      name: categoryName ?? sourceCategoryId ?? 'Uncategorized',
      slug: slugify(categoryName ?? sourceCategoryId ?? 'uncategorized'),
      ...(pickNumber(rec.category_display_order, rec.display_order, rec.sort_order) !== null
        ? { display_order: pickNumber(rec.category_display_order, rec.display_order, rec.sort_order) }
        : {}),
      is_active: true,
      review_status: 'draft' as const,
      created_by: actorId,
      updated_by: actorId,
    });
  }

  const categoryMap = new Map<string, string>(); // source category identity → tenant_category_id

  if (categoryRows.length > 0) {
    const catRowsPersisted = await bulkPersistJsonbRecords(admin, 'tenant_categories', categoryRows, ['tenant_id', 'external_ref']);
    for (const cat of catRowsPersisted) {
      if (typeof cat.id === 'string') {
        if (typeof cat.external_ref === 'string') {
          categoryMapById.set(cat.external_ref, cat.id);
        }
        if (typeof cat.name === 'string') {
          categoryMapByName.set(cat.name, cat.id);
        }
      }
    }

    await batchUpsertEntityMap(
      admin, tenantId, integrationId, 'categories',
      catRowsPersisted
        .filter((c) => typeof c.external_ref === 'string' && typeof c.id === 'string')
        .map((c) => ({ externalId: String(c.external_ref), internalId: String(c.id) })),
    );
  }

  // Step B: upsert brands
  const brandNames = [...new Set(
    records
      .map((r) => asStr(r.brand) ?? asStr(r.manufacturer))
      .filter((n): n is string => n !== null),
  )];

  // Fallback brand for products with no brand field
  const fallbackBrandExtRef = 'zoho_brand:__import__';
  const allBrandRows = [
    ...brandNames.map((name) => ({
      tenant_id: tenantId,
      external_ref: `zoho_brand:${slugify(name)}`,
      display_name_override: name,
      slug: slugify(name),
      is_active: true,
      created_by: actorId,
      updated_by: actorId,
    })),
    {
      tenant_id: tenantId,
      external_ref: fallbackBrandExtRef,
      display_name_override: 'Zoho Import',
      slug: 'zoho-import',
      is_active: true,
      created_by: actorId,
      updated_by: actorId,
    },
  ];

  const brandMap = new Map<string, string>(); // zohoName → tenant_brand_id
  let fallbackBrandId: string | null = null;

  const brandData = await bulkPersistJsonbRecords(admin, 'tenant_brands', allBrandRows, ['tenant_id', 'external_ref']);
  for (const b of brandData) {
    if (typeof b.external_ref === 'string' && typeof b.id === 'string') {
      if (b.external_ref === fallbackBrandExtRef) {
        fallbackBrandId = b.id;
      } else if (typeof b.display_name_override === 'string') {
        brandMap.set(b.display_name_override, b.id);
      }
    }
  }

  await batchUpsertEntityMap(
    admin, tenantId, integrationId, 'brands',
    brandData
      .filter((b) => typeof b.external_ref === 'string' && typeof b.id === 'string')
      .map((b) => ({ externalId: String(b.external_ref), internalId: String(b.id) })),
  );

  // Step C: upsert products in one batch
  const productRows: Record<string, unknown>[] = [];
  for (const rec of records) {
    const externalId = asStr(rec.item_id);
    if (!externalId) { result.skipped++; continue; }

    const brandName = asStr(rec.brand) ?? asStr(rec.manufacturer);
    const brandId = (brandName && brandMap.get(brandName)) ?? fallbackBrandId;
    if (!brandId) { result.skipped++; continue; }

    const sourceCategoryId = pickString(rec.category_id, rec.category_ref, rec.category_external_id);
    const catName = pickString(rec.category_name, rec.category);
    const catId = sourceCategoryId
      ? categoryMapById.get(`zoho_cat:${sourceCategoryId}`) ?? null
      : catName
        ? categoryMapByName.get(catName) ?? null
        : null;

    productRows.push({
      tenant_id: tenantId,
      external_ref: externalId,
      tenant_brand_id: brandId,
      tenant_category_id: catId,
      internal_sku: asStr(rec.sku) ?? asStr(rec.cf_sku) ?? externalId,
      name_override: asStr(rec.name),
      description: asStr(rec.description),
      base_selling_price: asNum(rec.rate),
      cost_price: asNum(rec.purchase_rate),
      mrp: asNum(rec.pricebook_rate),
      pack_size: pickNumber(rec.pack_size, rec.pack_quantity, rec.unit_conversion),
      image_urls: Array.isArray(rec.image_urls)
        ? rec.image_urls.filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
        : Array.isArray(rec.images)
          ? rec.images.filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
          : undefined,
      default_uom: asStr(rec.unit),
      hsn_code: asStr(rec.hsn_or_sac) ?? asStr(rec.hsn_sac),
      is_active: (asStr(rec.status) ?? 'active') === 'active',
      attributes_override: omitKeys(rec, [
        'item_id',
        'sku',
        'cf_sku',
        'name',
        'description',
        'rate',
        'purchase_rate',
        'pricebook_rate',
        'unit',
        'hsn_or_sac',
        'hsn_sac',
        'status',
        'brand',
        'manufacturer',
        'category_id',
        'category_ref',
        'category_external_id',
        'category_name',
        'category',
        'pack_size',
        'pack_quantity',
        'unit_conversion',
        'image_urls',
        'images',
      ]),
      created_by: actorId,
      updated_by: actorId,
    });
  }

  const persistedProducts = productRows.length > 0
    ? await bulkPersistJsonbRecords(admin, 'tenant_products', productRows, ['tenant_id', 'external_ref'])
    : [];
  const productMapPairs = mapPersistedRowsByExternalRef(persistedProducts);
  const productIdMap = new Map(productMapPairs.map((row) => [row.externalId, row.internalId] as const));

  result.updated += productMapPairs.length;
  await batchUpsertEntityMap(admin, tenantId, integrationId, 'products', productMapPairs);

  // Step D: upsert inventory from embedded item location snapshots on each item
  const locationExternalIds = [
    ...new Set(
      records.flatMap((r) => {
        const locs = getEmbeddedLocationRows(r);
        return locs.map((l) => getEmbeddedLocationExternalId(l)).filter((x): x is string => x !== null);
      }),
    ),
  ];

  const locationIdMap = await resolveInternalIdsWithFallback(
    admin, tenantId, integrationId, 'locations', 'locations', locationExternalIds,
  );

  const inventoryRows: Record<string, unknown>[] = [];

  for (const rec of records) {
    const extProductId = asStr(rec.item_id);
    if (!extProductId) continue;

    const productId = productIdMap.get(extProductId);
    if (!productId) continue;

    const locs = getEmbeddedLocationRows(rec);
    for (const loc of locs) {
      const extLocId = getEmbeddedLocationExternalId(loc);
      if (!extLocId) continue;

      const locationId = locationIdMap.get(extLocId);
      if (!locationId) continue; // location not yet synced — skip

      inventoryRows.push({
        tenant_product_id: productId,
        location_id: locationId,
        qty_available: getEmbeddedLocationQty(loc),
        qty_reserved: 0,
        updated_at: nowIso(),
      });
    }
  }

  if (inventoryRows.length > 0) {
    await bulkPersistJsonbRecords(admin, 'tenant_inventory', inventoryRows, ['tenant_product_id', 'location_id']);
  }

  return result;
}

// ── Estimates ────────────────────────────────────────────────────────────────

const ESTIMATE_STATUS_MAP: Record<string, string> = {
  draft: 'draft',
  sent: 'sent',
  accepted: 'accepted',
  declined: 'declined',
  expired: 'expired',
  invoiced: 'invoiced',
  converted: 'invoiced',
};

async function persistEstimates(
  admin: AdminClient,
  tenantId: string,
  actorId: string | null,
  integrationId: string,
  records: Record<string, unknown>[],
): Promise<PersistResult> {
  const result: PersistResult = { created: 0, updated: 0, skipped: 0 };

  const customerExternalIds = records
    .map((r) => asStr(r.customer_id))
    .filter((x): x is string => x !== null);
  const buyerIdMap = await resolveInternalIdsWithFallback(
    admin, tenantId, integrationId, 'customers', 'buyers', customerExternalIds,
  );
  const locationExternalIds = [...new Set(
    records
      .map((r) => pickString(r.location_id, r.warehouse_id))
      .filter((x): x is string => x !== null),
  )];
  const locationIdMap = await resolveInternalIdsWithFallback(
    admin, tenantId, integrationId, 'locations', 'locations', locationExternalIds,
  );
  const parentRows: Record<string, unknown>[] = [];
  const parentRecords: Array<{ estimateId: string; lineItems: Record<string, unknown>[] }> = [];

  for (const rec of records) {
    const externalId = asStr(rec.estimate_id);
    if (!externalId) { result.skipped++; continue; }

    const customerId = asStr(rec.customer_id);
    const buyerId = customerId ? (buyerIdMap.get(customerId) ?? null) : null;
    const locationExternalId = pickString(rec.location_id, rec.warehouse_id);
    const locationId = locationExternalId ? (locationIdMap.get(locationExternalId) ?? null) : null;
    const lineItems = Array.isArray(rec.line_items) ? rec.line_items as Record<string, unknown>[] : [];
    const cartHash = await sha256Hex(JSON.stringify({
      estimateId: externalId,
      buyerId,
      locationId,
      estimateNumber: asStr(rec.estimate_number),
      subtotal: pickNumber(rec.sub_total, rec.subtotal),
      taxAmount: pickNumber(rec.tax_total, rec.tax_amount),
      totalAmount: pickNumber(rec.total, rec.total_amount),
      lineItems: lineItems.map((li) => ({
        itemId: pickString(li.item_id, li.product_id),
        qty: pickNumber(li.quantity, li.qty),
        unitPrice: pickNumber(li.rate, li.unit_price, li.price),
        lineTotal: pickNumber(li.item_total, li.total, li.amount),
        taxPct: pickNumber(li.tax_percentage, li.tax_rate),
        discPct: pickNumber(li.discount_percentage, li.disc_pct),
        schemeTag: pickString(li.scheme_tag, li.discount_type),
      })),
    }));

    parentRows.push({
      tenant_id: tenantId,
      external_ref: externalId,
      buyer_id: buyerId,
      estimate_number: asStr(rec.estimate_number),
      status: ESTIMATE_STATUS_MAP[asStr(rec.status) ?? ''] ?? 'draft',
      location_id: locationId,
      currency: asStr(rec.currency) ?? asStr(rec.currency_code) ?? 'INR',
      subtotal: pickNumber(rec.sub_total, rec.subtotal),
      tax_amount: pickNumber(rec.tax_total, rec.tax_amount),
      total_amount: pickNumber(rec.total, rec.total_amount),
      notes: pickString(rec.notes, rec.terms, rec.description),
      seller_note: pickString(rec.seller_note, rec.note),
      place_of_supply: pickString(rec.place_of_supply, rec.state, rec.billing_state, rec.shipping_state),
      cart_hash: cartHash,
      buyer_po_ref: pickString(rec.reference_number, rec.buyer_po_ref),
      discount_flat: pickNumber(rec.discount_flat, rec.discount),
      freight: pickNumber(rec.freight, rec.shipping_charge),
      round_off: pickNumber(rec.round_off),
      valid_until: asDateOnly(rec.expiry_date),
      date_issued: asDateOnly(rec.date_issued ?? rec.date ?? rec.created_time),
      expires_at: asDate(rec.expiry_date),
      sent_at: asDate(rec.sent_at ?? rec.date),
      created_at: asDate(rec.created_time ?? rec.date),
      updated_at: asDate(rec.last_modified_time ?? rec.updated_time ?? rec.created_time),
      source: 'zoho_import',
      source_payload: buildTransactionalSourcePayload(rec),
      deleted_at: null,
      created_by: actorId,
      updated_by: actorId,
    });

    parentRecords.push({
      estimateId: externalId,
      lineItems: Array.isArray(rec.line_items) ? rec.line_items as Record<string, unknown>[] : [],
    });
  }

  const guardedEstimateRows = await applyImmediateEchoGuards(
    admin, tenantId, integrationId, 'estimates', 'estimates', parentRows,
  );
  const persistedEstimates = guardedEstimateRows.length > 0
    ? await bulkPersistJsonbRecords(admin, 'estimates', guardedEstimateRows, ['tenant_id', 'external_ref'])
    : [];
  const estimateMapPairs = mapPersistedRowsByExternalRef(persistedEstimates);
  const estimateIdMap = new Map(estimateMapPairs.map((row) => [row.externalId, row.internalId] as const));
  const estimateIds = estimateMapPairs.map((row) => row.internalId);

  result.updated += estimateMapPairs.length;
  await batchUpsertEntityMap(admin, tenantId, integrationId, 'estimates', estimateMapPairs);

  const productExtIds = [...new Set(
    parentRecords.flatMap((entry) =>
      entry.lineItems.map((li) => asStr(li.item_id)).filter((x): x is string => x !== null),
    ),
  )];
  const productIdMap = await resolveInternalIdsWithFallback(
    admin, tenantId, integrationId, 'products', 'tenant_products', productExtIds,
  );

  const lineItemRows: Record<string, unknown>[] = [];
  for (const entry of parentRecords) {
    const estimateId = estimateIdMap.get(entry.estimateId) ?? null;
    if (!estimateId) continue;

    for (const [lineIndex, li] of entry.lineItems.entries()) {
      const extProdId = asStr(li.item_id);
      const productId = extProdId ? (productIdMap.get(extProdId) ?? null) : null;
      if (!productId) continue;

      const taxRate = pickNumber(li.tax_percentage, li.tax_rate);
      const discountPct = pickNumber(li.discount_percentage, li.disc_pct) ?? 0;
      const externalRef = await buildChildExternalRef(entry.estimateId, li, lineIndex);

      lineItemRows.push({
        estimate_id: estimateId,
        tenant_product_id: productId,
        external_ref: externalRef,
        qty: pickNumber(li.quantity, li.qty) ?? 1,
        unit_price: pickNumber(li.rate, li.unit_price, li.price) ?? 0,
        line_total: pickNumber(li.item_total, li.total, li.amount),
        tax_rate: taxRate,
        tax_pct: taxRate,
        disc_pct: discountPct,
        discount_pct: discountPct,
        scheme_tag: pickString(li.scheme_tag, li.discount_type),
        sku: pickString(li.sku, li.item_sku, li.item_code, li.code),
        hsn_code: pickString(li.hsn_code, li.hsn_or_sac, li.hsn_sac),
        source_payload: li,
        deleted_at: null,
        created_at: asDate(li.created_time ?? li.created_at),
        updated_at: asDate(li.last_modified_time ?? li.updated_at ?? li.created_time),
        created_by: actorId,
        updated_by: actorId,
      });
    }
  }

  await persistDerivedChildRows(admin, 'estimate_items', 'estimate_id', estimateIds, lineItemRows);

  return result;
}

// ── Orders ───────────────────────────────────────────────────────────────────

const ORDER_STATUS_MAP: Record<string, string> = {
  draft: 'draft',
  open: 'confirmed',
  confirmed: 'confirmed',
  void: 'cancelled',
  cancelled: 'cancelled',
  closed: 'delivered',
  partially_invoiced: 'confirmed',
  invoiced: 'delivered',
};

async function persistOrders(
  admin: AdminClient,
  tenantId: string,
  actorId: string | null,
  integrationId: string,
  records: Record<string, unknown>[],
): Promise<PersistResult> {
  const result: PersistResult = { created: 0, updated: 0, skipped: 0 };

  const customerExternalIds = records
    .map((r) => asStr(r.customer_id))
    .filter((x): x is string => x !== null);
  const buyerIdMap = await resolveInternalIdsWithFallback(
    admin, tenantId, integrationId, 'customers', 'buyers', customerExternalIds,
  );
  const locationExternalIds = [...new Set(
    records
      .map((r) => pickString(r.location_id, r.warehouse_id))
      .filter((x): x is string => x !== null),
  )];
  const locationIdMap = await resolveInternalIdsWithFallback(
    admin, tenantId, integrationId, 'locations', 'locations', locationExternalIds,
  );
  const parentRows: Record<string, unknown>[] = [];
  const parentRecords: Array<{ orderExternalId: string; lineItems: Record<string, unknown>[] }> = [];

  for (const rec of records) {
    const externalId = asStr(rec.salesorder_id);
    if (!externalId) { result.skipped++; continue; }

    const customerId = asStr(rec.customer_id);
    const buyerId = customerId ? (buyerIdMap.get(customerId) ?? null) : null;
    const locationExternalId = pickString(rec.location_id, rec.warehouse_id);
    const locationId = locationExternalId ? (locationIdMap.get(locationExternalId) ?? null) : null;

    const shippingAddr = rec.shipping_address;
    const deliveryAddress = shippingAddr && typeof shippingAddr === 'object'
      ? shippingAddr
      : null;
    const lineItems = Array.isArray(rec.line_items) ? rec.line_items as Record<string, unknown>[] : [];

    parentRows.push({
      tenant_id: tenantId,
      external_ref: externalId,
      buyer_id: buyerId,
      placed_by: null,
      order_number: asStr(rec.salesorder_number) ?? externalId,
      status: ORDER_STATUS_MAP[asStr(rec.status) ?? ''] ?? 'confirmed',
      source: 'zoho_import',
      location_id: locationId,
      estimate_id: asStr(rec.estimate_id)
        ? (await resolveInternalIdWithFallback(admin, tenantId, integrationId, 'estimates', 'estimates', asStr(rec.estimate_id) ?? ''))
        : null,
      subtotal: pickNumber(rec.sub_total, rec.subtotal),
      tax_amount: pickNumber(rec.tax_total, rec.tax_amount),
      total_amount: pickNumber(rec.total, rec.total_amount),
      delivery_address: deliveryAddress as Record<string, unknown> | null,
      notes: pickString(rec.notes, rec.seller_note, rec.description),
      seller_note: pickString(rec.seller_note, rec.note),
      buyer_po_ref: pickString(rec.reference_number, rec.buyer_po_ref),
      discount_flat: pickNumber(rec.discount_flat, rec.discount),
      freight: pickNumber(rec.freight, rec.shipping_charge),
      round_off: pickNumber(rec.round_off),
      has_backorder: asBool(rec.has_backorder ?? rec.backorder, false),
      expected_delivery: asDateOnly(rec.expected_delivery),
      placed_at: asDate(rec.date ?? rec.created_time),
      received_at: asDate(rec.received_at),
      confirmed_at: asDate(rec.confirmed_at),
      dispatched_at: asDate(rec.dispatched_at),
      delivered_at: asDate(rec.delivered_at),
      cancelled_at: asDate(rec.cancelled_at),
      created_at: asDate(rec.created_time ?? rec.date),
      updated_at: asDate(rec.last_modified_time ?? rec.updated_time ?? rec.created_time),
      source_payload: buildTransactionalSourcePayload(rec),
      deleted_at: null,
      created_by: actorId,
      updated_by: actorId,
    });

    parentRecords.push({
      orderExternalId: externalId,
      lineItems,
    });
  }

  const guardedOrderRows = await applyImmediateEchoGuards(
    admin, tenantId, integrationId, 'orders', 'orders', parentRows,
  );
  const persistedOrders = guardedOrderRows.length > 0
    ? await bulkPersistJsonbRecords(admin, 'orders', guardedOrderRows, ['tenant_id', 'external_ref'])
    : [];
  const orderMapPairs = mapPersistedRowsByExternalRef(persistedOrders);
  const orderIdMap = new Map(orderMapPairs.map((row) => [row.externalId, row.internalId] as const));
  const orderIds = orderMapPairs.map((row) => row.internalId);

  result.updated += orderMapPairs.length;
  await batchUpsertEntityMap(admin, tenantId, integrationId, 'orders', orderMapPairs);

  const productExtIds = [...new Set(
    parentRecords.flatMap((entry) =>
      entry.lineItems.map((li) => asStr(li.item_id)).filter((x): x is string => x !== null),
    ),
  )];
  const productIdMap = await resolveInternalIdsWithFallback(
    admin, tenantId, integrationId, 'products', 'tenant_products', productExtIds,
  );

  const lineItemRows: Record<string, unknown>[] = [];
  for (const entry of parentRecords) {
    const orderId = orderIdMap.get(entry.orderExternalId) ?? null;
    if (!orderId) continue;

    for (const [lineIndex, li] of entry.lineItems.entries()) {
      const extProdId = asStr(li.item_id);
      const productId = extProdId ? (productIdMap.get(extProdId) ?? null) : null;
      if (!productId) continue;

      const taxRate = pickNumber(li.tax_percentage, li.tax_rate);
      const discountPct = pickNumber(li.discount_percentage, li.disc_pct) ?? 0;
      const externalRef = await buildChildExternalRef(entry.orderExternalId, li, lineIndex);

      lineItemRows.push({
        order_id: orderId,
        tenant_product_id: productId,
        external_ref: externalRef,
        qty: pickNumber(li.quantity, li.qty) ?? 1,
        unit_price: pickNumber(li.rate, li.unit_price, li.price) ?? 0,
        line_total: pickNumber(li.item_total, li.total, li.amount),
        tax_rate: taxRate,
        tax_pct: taxRate,
        disc_pct: discountPct,
        discount_pct: discountPct,
        scheme_tag: pickString(li.scheme_tag, li.discount_type),
        on_hand_at_confirm: pickNumber(li.on_hand_at_confirm, li.on_hand, li.available_stock),
        sku: pickString(li.sku, li.item_sku, li.item_code, li.code),
        hsn_code: pickString(li.hsn_code, li.hsn_or_sac, li.hsn_sac),
        source_payload: li,
        deleted_at: null,
        created_at: asDate(li.created_time ?? li.created_at),
        updated_at: asDate(li.last_modified_time ?? li.updated_at ?? li.created_time),
        created_by: actorId,
        updated_by: actorId,
      });
    }
  }

  await persistDerivedChildRows(admin, 'order_items', 'order_id', orderIds, lineItemRows);

  return result;
}

// ── Invoices ─────────────────────────────────────────────────────────────────

const INVOICE_STATUS_MAP: Record<string, string> = {
  draft: 'draft',
  sent: 'sent',
  issued: 'sent',
  partially_paid: 'sent',
  paid: 'paid',
  void: 'void',
  overdue: 'overdue',
};

async function persistInvoices(
  admin: AdminClient,
  tenantId: string,
  actorId: string | null,
  integrationId: string,
  records: Record<string, unknown>[],
): Promise<PersistResult> {
  const result: PersistResult = { created: 0, updated: 0, skipped: 0 };

  const customerExternalIds = records
    .map((r) => asStr(r.customer_id))
    .filter((x): x is string => x !== null);
  const buyerIdMap = await resolveInternalIdsWithFallback(
    admin, tenantId, integrationId, 'customers', 'buyers', customerExternalIds,
  );
  const locationExternalIds = [...new Set(
    records
      .map((r) => pickString(r.location_id, r.warehouse_id))
      .filter((x): x is string => x !== null),
  )];
  const locationIdMap = await resolveInternalIdsWithFallback(
    admin, tenantId, integrationId, 'locations', 'locations', locationExternalIds,
  );
  const orderExternalIds = [...new Set(
    records
      .map((r) => pickString(r.salesorder_id, r.order_id))
      .filter((x): x is string => x !== null),
  )];
  const orderIdMap = await resolveInternalIdsWithFallback(
    admin, tenantId, integrationId, 'orders', 'orders', orderExternalIds,
  );
  const parentRows: Record<string, unknown>[] = [];
  const parentRecords: Array<{ invoiceExternalId: string; lineItems: Record<string, unknown>[] }> = [];

  for (const rec of records) {
    const externalId = asStr(rec.invoice_id);
    if (!externalId) { result.skipped++; continue; }

    const invoiceDate = asDate(rec.date) ?? nowIso();

    const customerId = asStr(rec.customer_id);
    const buyerId = customerId ? (buyerIdMap.get(customerId) ?? null) : null;
    const locationExternalId = pickString(rec.location_id, rec.warehouse_id);
    const locationId = locationExternalId ? (locationIdMap.get(locationExternalId) ?? null) : null;
    const orderExternalId = pickString(rec.salesorder_id, rec.order_id);
    const orderId = orderExternalId ? (orderIdMap.get(orderExternalId) ?? null) : null;

    const shippingAddr = rec.shipping_address;
    const deliveryAddress = shippingAddr && typeof shippingAddr === 'object'
      ? shippingAddr
      : null;
    const lineItems = Array.isArray(rec.line_items) ? rec.line_items as Record<string, unknown>[] : [];

    const total = asNum(rec.total) ?? 0;
    const balance = asNum(rec.balance) ?? 0;
    const amountPaid = asNum(rec.payment_made) ?? (total - balance);

    parentRows.push({
      tenant_id: tenantId,
      external_ref: externalId,
      buyer_id: buyerId,
      location_id: locationId,
      order_id: orderId,
      invoice_number: asStr(rec.invoice_number) ?? externalId,
      invoice_date: invoiceDate,
      status: INVOICE_STATUS_MAP[asStr(rec.status) ?? ''] ?? 'sent',
      subtotal: pickNumber(rec.sub_total, rec.subtotal),
      tax_amount: pickNumber(rec.tax_total, rec.tax_amount),
      total_amount: total,
      outstanding_balance: balance,
      amount_paid: amountPaid,
      delivery_address: deliveryAddress as Record<string, unknown> | null,
      place_of_supply: pickString(rec.place_of_supply, rec.state, rec.billing_state, rec.shipping_state),
      notes: pickString(rec.notes, rec.seller_note),
      notes_for_buyer: pickString(rec.notes_for_buyer, rec.notes),
      seller_note: pickString(rec.seller_note),
      buyer_po_ref: pickString(rec.reference_number, rec.buyer_po_ref),
      discount_flat: pickNumber(rec.discount_flat, rec.discount),
      freight: pickNumber(rec.freight, rec.shipping_charge),
      round_off: pickNumber(rec.round_off),
      sent_at: asDate(rec.sent_at ?? rec.date),
      sent_channel: pickString(rec.sent_channel, rec.channel),
      created_at: asDate(rec.created_time ?? rec.date),
      updated_at: asDate(rec.last_modified_time ?? rec.updated_time ?? rec.created_time),
      source_payload: buildTransactionalSourcePayload(rec),
      deleted_at: null,
      created_by: actorId,
      updated_by: actorId,
    });

    parentRecords.push({
      invoiceExternalId: externalId,
      lineItems,
    });
  }

  const guardedInvoiceRows = await applyImmediateEchoGuards(
    admin, tenantId, integrationId, 'invoices', 'invoices', parentRows,
  );
  const persistedInvoices = guardedInvoiceRows.length > 0
    ? await bulkPersistJsonbRecords(admin, 'invoices', guardedInvoiceRows, ['tenant_id', 'external_ref'])
    : [];
  const invoiceMapPairs = mapPersistedRowsByExternalRef(persistedInvoices);
  const invoiceIdMap = new Map(invoiceMapPairs.map((row) => [row.externalId, row.internalId] as const));
  const invoiceIds = invoiceMapPairs.map((row) => row.internalId);

  result.updated += invoiceMapPairs.length;
  await batchUpsertEntityMap(admin, tenantId, integrationId, 'invoices', invoiceMapPairs);

  const productExtIds = [...new Set(
    parentRecords.flatMap((entry) =>
      entry.lineItems.map((li) => asStr(li.item_id)).filter((x): x is string => x !== null),
    ),
  )];
  const productIdMap = await resolveInternalIdsWithFallback(
    admin, tenantId, integrationId, 'products', 'tenant_products', productExtIds,
  );

  const lineItemRows: Record<string, unknown>[] = [];
  for (const entry of parentRecords) {
    const invoiceId = invoiceIdMap.get(entry.invoiceExternalId) ?? null;
    if (!invoiceId) continue;

    for (const [lineIndex, li] of entry.lineItems.entries()) {
      const extProdId = asStr(li.item_id);
      const productId = extProdId ? (productIdMap.get(extProdId) ?? null) : null;
      if (!productId) continue;

      const taxRate = pickNumber(li.tax_percentage, li.tax_rate);
      const discountPct = pickNumber(li.discount_percentage, li.disc_pct) ?? 0;
      const externalRef = await buildChildExternalRef(entry.invoiceExternalId, li, lineIndex);

      lineItemRows.push({
        invoice_id: invoiceId,
        tenant_product_id: productId,
        external_ref: externalRef,
        qty: pickNumber(li.quantity, li.qty) ?? 1,
        unit_price: pickNumber(li.rate, li.unit_price, li.price) ?? 0,
        line_total: pickNumber(li.item_total, li.total, li.amount),
        tax_rate: taxRate,
        tax_pct: taxRate,
        disc_pct: discountPct,
        discount_pct: discountPct,
        sku: pickString(li.sku, li.item_sku, li.item_code, li.code),
        hsn_code: pickString(li.hsn_code, li.hsn_or_sac, li.hsn_sac),
        scheme_tag: pickString(li.scheme_tag, li.discount_type),
        source_payload: li,
        deleted_at: null,
        created_at: asDate(li.created_time ?? li.created_at),
        updated_at: asDate(li.last_modified_time ?? li.updated_at ?? li.created_time),
        created_by: actorId,
        updated_by: actorId,
      });
    }
  }

  await persistDerivedChildRows(admin, 'invoice_items', 'invoice_id', invoiceIds, lineItemRows);

  return result;
}

// ── Router ───────────────────────────────────────────────────────────────────

export async function persistZohoEntityPage(
  admin: AdminClient,
  tenantId: string,
  actorId: string | null,
  integrationId: string,
  entityType: string,
  integrationTypeId: ZohoIntegrationTypeId,
  records: Record<string, unknown>[],
  adapter?: ZohoAdapter,
): Promise<PersistResult> {
  switch (entityType) {
    case 'locations':
      return persistLocations(admin, tenantId, actorId, integrationId, integrationTypeId, records);

    case 'customers':
      if (!adapter) throw new Error('adapter required for customers persister');
      return persistBuyers(admin, tenantId, actorId, integrationId, records, adapter);

    case 'products':
      return persistProducts(admin, tenantId, actorId, integrationId, records);

    case 'estimates':
      return persistEstimates(admin, tenantId, actorId, integrationId, records);

    case 'orders':
      return persistOrders(admin, tenantId, actorId, integrationId, records);

    case 'invoices':
      return persistInvoices(admin, tenantId, actorId, integrationId, records);

    default:
      return { created: 0, updated: 0, skipped: records.length };
  }
}
