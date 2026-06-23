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
  const categoryNames = [...new Set(
    records
      .map((r) => asStr(r.category_name))
      .filter((n): n is string => n !== null && n.trim().length > 0),
  )];

  const categoryRows = categoryNames.map((name) => ({
    tenant_id: tenantId,
    external_ref: `zoho_cat:${slugify(name)}`,
    name,
    slug: slugify(name),
    is_active: true,
    review_status: 'draft' as const,
    created_by: actorId,
    updated_by: actorId,
  }));

  const categoryMap = new Map<string, string>(); // zohoName → tenant_category_id

  if (categoryRows.length > 0) {
    const catRowsPersisted = await bulkPersistJsonbRecords(admin, 'tenant_categories', categoryRows, ['tenant_id', 'external_ref']);
    for (const cat of catRowsPersisted) {
      if (typeof cat.name === 'string' && typeof cat.id === 'string') {
        categoryMap.set(cat.name, cat.id);
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

    const catName = asStr(rec.category_name);
    const catId = catName ? (categoryMap.get(catName) ?? null) : null;

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
      default_uom: asStr(rec.unit),
      hsn_code: asStr(rec.hsn_or_sac) ?? asStr(rec.hsn_sac),
      is_active: (asStr(rec.status) ?? 'active') === 'active',
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

  const locationIdMap = await resolveInternalIds(
    admin, tenantId, integrationId, 'locations', locationExternalIds,
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
  const buyerIdMap = await resolveInternalIds(
    admin, tenantId, integrationId, 'customers', customerExternalIds,
  );
  const parentRows: Record<string, unknown>[] = [];
  const parentRecords: Array<{ estimateId: string; lineItems: Record<string, unknown>[] }> = [];

  for (const rec of records) {
    const externalId = asStr(rec.estimate_id);
    if (!externalId) { result.skipped++; continue; }

    const customerId = asStr(rec.customer_id);
    const buyerId = customerId ? (buyerIdMap.get(customerId) ?? null) : null;

    parentRows.push({
      tenant_id: tenantId,
      external_ref: externalId,
      buyer_id: buyerId,
      estimate_number: asStr(rec.estimate_number),
      status: ESTIMATE_STATUS_MAP[asStr(rec.status) ?? ''] ?? 'draft',
      subtotal: asNum(rec.sub_total),
      tax_amount: asNum(rec.tax_total),
      total_amount: asNum(rec.total),
      notes: asStr(rec.notes),
      expires_at: asDate(rec.expiry_date),
      sent_at: asDate(rec.date),
      source: 'zoho_import',
      created_by: actorId,
      updated_by: actorId,
    });

    parentRecords.push({
      estimateId: externalId,
      lineItems: Array.isArray(rec.line_items) ? rec.line_items as Record<string, unknown>[] : [],
    });
  }

  const persistedEstimates = parentRows.length > 0
    ? await bulkPersistJsonbRecords(admin, 'estimates', parentRows, ['tenant_id', 'external_ref'])
    : [];
  const estimateMapPairs = mapPersistedRowsByExternalRef(persistedEstimates);
  const estimateIdMap = new Map(estimateMapPairs.map((row) => [row.externalId, row.internalId] as const));
  const estimateIds = estimateMapPairs.map((row) => row.internalId);

  result.updated += estimateMapPairs.length;
  await batchUpsertEntityMap(admin, tenantId, integrationId, 'estimates', estimateMapPairs);

  if (estimateIds.length > 0) {
    await admin
      .schema('app')
      .from('estimate_items')
      .update({ deleted_at: nowIso() })
      .in('estimate_id', estimateIds)
      .is('deleted_at', null);
  }

  const productExtIds = [...new Set(
    parentRecords.flatMap((entry) =>
      entry.lineItems.map((li) => asStr(li.item_id)).filter((x): x is string => x !== null),
    ),
  )];
  const productIdMap = await resolveInternalIds(admin, tenantId, integrationId, 'products', productExtIds);

  const lineItemRows: Record<string, unknown>[] = [];
  for (const entry of parentRecords) {
    const estimateId = estimateIdMap.get(entry.estimateId) ?? null;
    if (!estimateId) continue;

    for (const li of entry.lineItems) {
      const extProdId = asStr(li.item_id);
      const productId = extProdId ? (productIdMap.get(extProdId) ?? null) : null;
      if (!productId) continue;

      const taxRate = asNum(li.tax_percentage) ?? asNum(li.tax_rate);
      const discountPct = asNum(li.discount_percentage) ?? asNum(li.disc_pct) ?? 0;

      lineItemRows.push({
        estimate_id: estimateId,
        tenant_product_id: productId,
        qty: asNum(li.quantity) ?? 1,
        unit_price: asNum(li.rate) ?? 0,
        line_total: asNum(li.item_total),
        tax_rate: taxRate,
        tax_pct: taxRate,
        disc_pct: discountPct,
        discount_pct: discountPct,
        created_by: actorId,
        updated_by: actorId,
      });
    }
  }

  if (lineItemRows.length > 0) {
    await bulkPersistJsonbRecords(admin, 'estimate_items', lineItemRows);
  }

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
  const buyerIdMap = await resolveInternalIds(
    admin, tenantId, integrationId, 'customers', customerExternalIds,
  );
  const parentRows: Record<string, unknown>[] = [];
  const parentRecords: Array<{ orderExternalId: string; lineItems: Record<string, unknown>[] }> = [];

  for (const rec of records) {
    const externalId = asStr(rec.salesorder_id);
    if (!externalId) { result.skipped++; continue; }

    const customerId = asStr(rec.customer_id);
    const buyerId = customerId ? (buyerIdMap.get(customerId) ?? null) : null;

    const shippingAddr = rec.shipping_address;
    const deliveryAddress = shippingAddr && typeof shippingAddr === 'object'
      ? shippingAddr
      : null;

    parentRows.push({
      tenant_id: tenantId,
      external_ref: externalId,
      buyer_id: buyerId,
      placed_by: null,
      order_number: asStr(rec.salesorder_number) ?? externalId,
      status: ORDER_STATUS_MAP[asStr(rec.status) ?? ''] ?? 'confirmed',
      source: 'zoho_import',
      subtotal: asNum(rec.sub_total),
      tax_amount: asNum(rec.tax_total),
      total_amount: asNum(rec.total),
      delivery_address: deliveryAddress as Record<string, unknown> | null,
      buyer_po_ref: asStr(rec.reference_number),
      placed_at: asDate(rec.date),
      created_by: actorId,
      updated_by: actorId,
    });

    parentRecords.push({
      orderExternalId: externalId,
      lineItems: Array.isArray(rec.line_items) ? rec.line_items as Record<string, unknown>[] : [],
    });
  }

  const persistedOrders = parentRows.length > 0
    ? await bulkPersistJsonbRecords(admin, 'orders', parentRows, ['tenant_id', 'external_ref'])
    : [];
  const orderMapPairs = mapPersistedRowsByExternalRef(persistedOrders);
  const orderIdMap = new Map(orderMapPairs.map((row) => [row.externalId, row.internalId] as const));
  const orderIds = orderMapPairs.map((row) => row.internalId);

  result.updated += orderMapPairs.length;
  await batchUpsertEntityMap(admin, tenantId, integrationId, 'orders', orderMapPairs);

  if (orderIds.length > 0) {
    await admin
      .schema('app')
      .from('order_items')
      .update({ deleted_at: nowIso() })
      .in('order_id', orderIds)
      .is('deleted_at', null);
  }

  const productExtIds = [...new Set(
    parentRecords.flatMap((entry) =>
      entry.lineItems.map((li) => asStr(li.item_id)).filter((x): x is string => x !== null),
    ),
  )];
  const productIdMap = await resolveInternalIds(admin, tenantId, integrationId, 'products', productExtIds);

  const lineItemRows: Record<string, unknown>[] = [];
  for (const entry of parentRecords) {
    const orderId = orderIdMap.get(entry.orderExternalId) ?? null;
    if (!orderId) continue;

    for (const li of entry.lineItems) {
      const extProdId = asStr(li.item_id);
      const productId = extProdId ? (productIdMap.get(extProdId) ?? null) : null;
      if (!productId) continue;

      const taxRate = asNum(li.tax_percentage) ?? asNum(li.tax_rate);
      const discountPct = asNum(li.discount_percentage) ?? asNum(li.disc_pct) ?? 0;

      lineItemRows.push({
        order_id: orderId,
        tenant_product_id: productId,
        qty: asNum(li.quantity) ?? 1,
        unit_price: asNum(li.rate) ?? 0,
        line_total: asNum(li.item_total),
        tax_rate: taxRate,
        tax_pct: taxRate,
        disc_pct: discountPct,
        discount_pct: discountPct,
        created_by: actorId,
        updated_by: actorId,
      });
    }
  }

  if (lineItemRows.length > 0) {
    await bulkPersistJsonbRecords(admin, 'order_items', lineItemRows);
  }

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
  const buyerIdMap = await resolveInternalIds(
    admin, tenantId, integrationId, 'customers', customerExternalIds,
  );
  const parentRows: Record<string, unknown>[] = [];
  const parentRecords: Array<{ invoiceExternalId: string; lineItems: Record<string, unknown>[] }> = [];

  for (const rec of records) {
    const externalId = asStr(rec.invoice_id);
    if (!externalId) { result.skipped++; continue; }

    const invoiceDate = asDate(rec.date) ?? nowIso();

    const customerId = asStr(rec.customer_id);
    const buyerId = customerId ? (buyerIdMap.get(customerId) ?? null) : null;

    const shippingAddr = rec.shipping_address;
    const deliveryAddress = shippingAddr && typeof shippingAddr === 'object'
      ? shippingAddr
      : null;

    const total = asNum(rec.total) ?? 0;
    const balance = asNum(rec.balance) ?? 0;
    const amountPaid = asNum(rec.payment_made) ?? (total - balance);

    parentRows.push({
      tenant_id: tenantId,
      external_ref: externalId,
      buyer_id: buyerId,
      invoice_number: asStr(rec.invoice_number) ?? externalId,
      invoice_date: invoiceDate,
      status: INVOICE_STATUS_MAP[asStr(rec.status) ?? ''] ?? 'sent',
      subtotal: asNum(rec.sub_total),
      tax_amount: asNum(rec.tax_total),
      total_amount: total,
      outstanding_balance: balance,
      amount_paid: amountPaid,
      delivery_address: deliveryAddress as Record<string, unknown> | null,
      notes_for_buyer: asStr(rec.notes),
      created_by: actorId,
      updated_by: actorId,
    });

    parentRecords.push({
      invoiceExternalId: externalId,
      lineItems: Array.isArray(rec.line_items) ? rec.line_items as Record<string, unknown>[] : [],
    });
  }

  const persistedInvoices = parentRows.length > 0
    ? await bulkPersistJsonbRecords(admin, 'invoices', parentRows, ['tenant_id', 'external_ref'])
    : [];
  const invoiceMapPairs = mapPersistedRowsByExternalRef(persistedInvoices);
  const invoiceIdMap = new Map(invoiceMapPairs.map((row) => [row.externalId, row.internalId] as const));
  const invoiceIds = invoiceMapPairs.map((row) => row.internalId);

  result.updated += invoiceMapPairs.length;
  await batchUpsertEntityMap(admin, tenantId, integrationId, 'invoices', invoiceMapPairs);

  if (invoiceIds.length > 0) {
    await admin
      .schema('app')
      .from('invoice_items')
      .update({ deleted_at: nowIso() })
      .in('invoice_id', invoiceIds)
      .is('deleted_at', null);
  }

  const productExtIds = [...new Set(
    parentRecords.flatMap((entry) =>
      entry.lineItems.map((li) => asStr(li.item_id)).filter((x): x is string => x !== null),
    ),
  )];
  const productIdMap = await resolveInternalIds(admin, tenantId, integrationId, 'products', productExtIds);

  const lineItemRows: Record<string, unknown>[] = [];
  for (const entry of parentRecords) {
    const invoiceId = invoiceIdMap.get(entry.invoiceExternalId) ?? null;
    if (!invoiceId) continue;

    for (const li of entry.lineItems) {
      const extProdId = asStr(li.item_id);
      const productId = extProdId ? (productIdMap.get(extProdId) ?? null) : null;
      if (!productId) continue;

      const taxRate = asNum(li.tax_percentage) ?? asNum(li.tax_rate);
      const discountPct = asNum(li.discount_percentage) ?? asNum(li.disc_pct) ?? 0;

      lineItemRows.push({
        invoice_id: invoiceId,
        tenant_product_id: productId,
        qty: asNum(li.quantity) ?? 1,
        unit_price: asNum(li.rate) ?? 0,
        line_total: asNum(li.item_total),
        tax_rate: taxRate,
        tax_pct: taxRate,
        disc_pct: discountPct,
        discount_pct: discountPct,
        created_by: actorId,
        updated_by: actorId,
      });
    }
  }

  if (lineItemRows.length > 0) {
    await bulkPersistJsonbRecords(admin, 'invoice_items', lineItemRows);
  }

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
