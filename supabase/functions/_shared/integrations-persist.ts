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

async function persistLineItemRows(
  admin: AdminClient,
  entityType: 'estimate_items' | 'order_items' | 'invoice_items',
  items: Array<{ externalId: string; row: Record<string, unknown> }>,
): Promise<void> {
  if (items.length === 0) return;

  await bulkPersistJsonbRecords(admin, entityType, items.map((item) => item.row));
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
  const buyerMapPairs: Array<{ externalId: string; internalId: string }> = [];
  const contactMapPairs: Array<{ externalId: string; internalId: string }> = [];

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
      phone: asStr(rec.phone),
      gstin: asStr(rec.gst_no) ?? asStr((rec as Record<string, unknown>)['cf_gstin']),
      credit_limit: asNum(rec.credit_limit),
      payment_terms_days: asNum(rec.payment_terms) ?? asNum(rec.payment_terms_days),
      geography: geo,
      is_active: (asStr(rec.status) ?? 'active') === 'active',
      created_by: actorId,
      updated_by: actorId,
    };

    const persisted = await bulkPersistJsonbRecordsWithIds(admin, 'buyers', [row], ['tenant_id', 'external_ref']);
    const buyerId = persisted[0] ?? null;
    if (!buyerId) { result.skipped++; continue; }
    buyerMapPairs.push({ externalId, internalId: buyerId });
    result.updated++;

    const embeddedContactPersons = Array.isArray((rec as Record<string, unknown>).contact_persons)
      ? (rec as Record<string, unknown>).contact_persons as Record<string, unknown>[]
      : [];

    const cpRows = embeddedContactPersons
      .map((cp) => {
        const cpId = asStr(cp.contact_person_id);
        if (!cpId) return null;
        return {
          buyer_id: buyerId,
          external_ref: cpId,
          role: 'buyer_assistant' as const,
          first_name: asStr(cp.first_name),
          last_name: asStr(cp.last_name),
          email: asStr(cp.email),
          phone: asStr(cp.phone),
          mobile: asStr(cp.mobile),
          designation: asStr(cp.designation),
          department: asStr(cp.department),
          is_active: asBool(cp.is_active, true),
          created_by: actorId,
          updated_by: actorId,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (cpRows.length > 0) {
      const cpIds = await bulkPersistJsonbRecordsWithIds(admin, 'buyer_users', cpRows, ['buyer_id', 'external_ref']);
      for (const [index, id] of cpIds.entries()) {
        const externalId = cpRows[index]?.external_ref;
        if (externalId && id) {
          contactMapPairs.push({ externalId: String(externalId), internalId: id });
        }
      }
    }
  }

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

  // Step C: upsert products
  const productMapPairs: Array<{ externalId: string; internalId: string }> = [];
  const productIdMap = new Map<string, string>(); // external_id → tenant_product_id

  for (const rec of records) {
    const externalId = asStr(rec.item_id);
    if (!externalId) { result.skipped++; continue; }

    const brandName = asStr(rec.brand) ?? asStr(rec.manufacturer);
    const brandId = (brandName && brandMap.get(brandName)) ?? fallbackBrandId;
    if (!brandId) { result.skipped++; continue; }

    const catName = asStr(rec.category_name);
    const catId = catName ? (categoryMap.get(catName) ?? null) : null;

    const internalSku = asStr(rec.sku) ?? asStr(rec.cf_sku) ?? externalId;

    const row = {
      tenant_id: tenantId,
      external_ref: externalId,
      tenant_brand_id: brandId,
      tenant_category_id: catId,
      internal_sku: internalSku,
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
    };

    const productIds = await bulkPersistJsonbRecordsWithIds(admin, 'tenant_products', [row], ['tenant_id', 'external_ref']);
    const productId = productIds[0] ?? null;
    if (!productId) { result.skipped++; continue; }
    productMapPairs.push({ externalId, internalId: productId });
    productIdMap.set(externalId, productId);
    result.updated++;
  }

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

  for (const rec of records) {
    const externalId = asStr(rec.estimate_id);
    if (!externalId) { result.skipped++; continue; }

    const customerId = asStr(rec.customer_id);
    const buyerId = customerId ? (buyerIdMap.get(customerId) ?? null) : null;

    const row = {
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
    };

    const estimateIds = await bulkPersistJsonbRecordsWithIds(admin, 'estimates', [row], ['tenant_id', 'external_ref']);
    const estimateId = estimateIds[0] ?? null;
    if (!estimateId) { result.skipped++; continue; }
    result.updated++;

    // Soft-delete then reinsert line items
    await admin
      .schema('app')
      .from('estimate_items')
      .update({ deleted_at: nowIso() })
      .eq('estimate_id', estimateId)
      .is('deleted_at', null);

    const lineItems = Array.isArray(rec.line_items) ? rec.line_items as Record<string, unknown>[] : [];
    const productExtIds = lineItems
      .map((li) => asStr(li.item_id))
      .filter((x): x is string => x !== null);
    const productIdMap = await resolveInternalIds(
      admin, tenantId, integrationId, 'products', productExtIds,
    );

    const lineItemPayloads = lineItems
      .map((li) => {
        const extProdId = asStr(li.item_id);
        const productId = extProdId ? (productIdMap.get(extProdId) ?? null) : null;
        if (!productId) return null;

        const taxRate = asNum(li.tax_percentage) ?? asNum(li.tax_rate);
        const discountPct = asNum(li.discount_percentage) ?? asNum(li.disc_pct) ?? 0;

        return {
          row: {
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
          },
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    await persistLineItemRows(admin, 'estimate_items', lineItemPayloads);

    await batchUpsertEntityMap(admin, tenantId, integrationId, 'estimates', [
      { externalId, internalId: estimateId },
    ]);
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

  for (const rec of records) {
    const externalId = asStr(rec.salesorder_id);
    if (!externalId) { result.skipped++; continue; }

    const customerId = asStr(rec.customer_id);
    const buyerId = customerId ? (buyerIdMap.get(customerId) ?? null) : null;

    const shippingAddr = rec.shipping_address;
    const deliveryAddress = shippingAddr && typeof shippingAddr === 'object'
      ? shippingAddr
      : null;

    const row = {
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
    };

    const orderIds = await bulkPersistJsonbRecordsWithIds(admin, 'orders', [row], ['tenant_id', 'external_ref']);
    const orderId = orderIds[0] ?? null;
    if (!orderId) { result.skipped++; continue; }
    result.updated++;

    // Soft-delete then reinsert line items
    await admin
      .schema('app')
      .from('order_items')
      .update({ deleted_at: nowIso() })
      .eq('order_id', orderId)
      .is('deleted_at', null);

    const lineItems = Array.isArray(rec.line_items) ? rec.line_items as Record<string, unknown>[] : [];
    const productExtIds = lineItems
      .map((li) => asStr(li.item_id))
      .filter((x): x is string => x !== null);
    const productIdMap = await resolveInternalIds(
      admin, tenantId, integrationId, 'products', productExtIds,
    );

    const lineItemPayloads = lineItems
      .map((li) => {
        const extProdId = asStr(li.item_id);
        const productId = extProdId ? (productIdMap.get(extProdId) ?? null) : null;
        if (!productId) return null;

        const taxRate = asNum(li.tax_percentage) ?? asNum(li.tax_rate);
        const discountPct = asNum(li.discount_percentage) ?? asNum(li.disc_pct) ?? 0;

        return {
          row: {
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
          },
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    await persistLineItemRows(admin, 'order_items', lineItemPayloads);

    await batchUpsertEntityMap(admin, tenantId, integrationId, 'orders', [
      { externalId, internalId: orderId },
    ]);
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

    const row = {
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
    };

    const invoiceIds = await bulkPersistJsonbRecordsWithIds(admin, 'invoices', [row], ['tenant_id', 'external_ref']);
    const invoiceId = invoiceIds[0] ?? null;
    if (!invoiceId) { result.skipped++; continue; }
    result.updated++;

    // Soft-delete then reinsert line items
    await admin
      .schema('app')
      .from('invoice_items')
      .update({ deleted_at: nowIso() })
      .eq('invoice_id', invoiceId)
      .is('deleted_at', null);

    const lineItems = Array.isArray(rec.line_items) ? rec.line_items as Record<string, unknown>[] : [];
    const productExtIds = lineItems
      .map((li) => asStr(li.item_id))
      .filter((x): x is string => x !== null);
    const productIdMap = await resolveInternalIds(
      admin, tenantId, integrationId, 'products', productExtIds,
    );

    const lineItemPayloads = lineItems
      .map((li) => {
        const extProdId = asStr(li.item_id);
        const productId = extProdId ? (productIdMap.get(extProdId) ?? null) : null;
        if (!productId) return null;

        const taxRate = asNum(li.tax_percentage) ?? asNum(li.tax_rate);
        const discountPct = asNum(li.discount_percentage) ?? asNum(li.disc_pct) ?? 0;

        return {
          row: {
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
          },
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    await persistLineItemRows(admin, 'invoice_items', lineItemPayloads);

    await batchUpsertEntityMap(admin, tenantId, integrationId, 'invoices', [
      { externalId, internalId: invoiceId },
    ]);
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
