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
import {
  normalizeLocationAssociatedUsers,
  syncLocationAssignees,
} from '../../../src/lib/location-assignees.ts';

// ── Types ───────────────────────────────────────────────────────────────────

export interface PersistResult {
  created: number;
  updated: number;
  skipped: number;
  // Non-empty only for customers phase — caller must call search vector rebuild at invocation end
  pendingSearchVectorBuyerIds: string[];
  pendingSearchVectorBuyerUserIds: string[];
}

type AdminClient = Parameters<typeof persistZohoEntityPage>[0];
type JsonRecord = Record<string, unknown>;

export class IntegrationSyncError extends Error {
  entityType: string;
  externalId: string | null;
  details?: JsonRecord;

  constructor(entityType: string, message: string, externalId: string | null, details?: JsonRecord) {
    super(message);
    this.name = 'IntegrationSyncError';
    this.entityType = entityType;
    this.externalId = externalId;
    this.details = details;
  }
}

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

function formatErrorReason(message: string, details?: JsonRecord): string {
  if (!details || Object.keys(details).length === 0) return message;
  try {
    return `${message} :: ${JSON.stringify(details)}`;
  } catch {
    return message;
  }
}

function dedupeByExternalRef(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return dedupeByColumns(rows, ['external_ref']);
}

function dedupeByColumns(
  rows: Record<string, unknown>[],
  columns: string[],
): Record<string, unknown>[] {
  const deduped = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const parts: string[] = [];
    let hasAllValues = true;

    for (const column of columns) {
      const value = row[column];
      if (typeof value === 'string') {
        const normalized = value.trim();
        if (!normalized) {
          hasAllValues = false;
          break;
        }
        parts.push(normalized);
        continue;
      }

      if (typeof value === 'number' || typeof value === 'boolean') {
        parts.push(String(value));
        continue;
      }

      hasAllValues = false;
      break;
    }

    if (!hasAllValues) continue;
    deduped.set(parts.join('::'), row);
  }

  return [...deduped.values()];
}

function getRowNaturalKey(row: Record<string, unknown>, columns: string[]): string | null {
  const parts: string[] = [];
  for (const column of columns) {
    const value = asStr(row[column]);
    if (!value) return null;
    parts.push(value);
  }
  return parts.join('::');
}

function dedupeByExternalOrNaturalKey(
  rows: Record<string, unknown>[],
  naturalKeyColumns: string[],
): Record<string, unknown>[] {
  const keyToGroup = new Map<string, number>();
  const groupRows: Array<Record<string, unknown> | null> = [];
  const groupKeys: string[][] = [];

  for (const row of rows) {
    const keys = new Set<string>();
    const externalRef = asStr(row.external_ref);
    const naturalKey = getRowNaturalKey(row, naturalKeyColumns);

    if (externalRef) keys.add(`external_ref:${externalRef}`);
    if (naturalKey) keys.add(`natural:${naturalKey}`);
    if (keys.size === 0) continue;

    const attachedGroups = [...keys]
      .map((key) => keyToGroup.get(key))
      .filter((value): value is number => typeof value === 'number');

    const targetGroup = attachedGroups.length > 0 ? Math.min(...attachedGroups) : groupRows.length;
    if (attachedGroups.length === 0) {
      groupRows.push(null);
      groupKeys.push([]);
    }

    groupRows[targetGroup] = row;

    for (const attachedGroup of attachedGroups) {
      if (attachedGroup === targetGroup) continue;
      for (const key of groupKeys[attachedGroup]) {
        keyToGroup.set(key, targetGroup);
        if (!groupKeys[targetGroup].includes(key)) {
          groupKeys[targetGroup].push(key);
        }
      }
      groupRows[attachedGroup] = null;
      groupKeys[attachedGroup] = [];
    }

    for (const key of keys) {
      keyToGroup.set(key, targetGroup);
      if (!groupKeys[targetGroup].includes(key)) {
        groupKeys[targetGroup].push(key);
      }
    }
  }

  return groupRows.filter((row): row is Record<string, unknown> => row !== null);
}

type NaturalKeyCollision = {
  externalRef: string | null;
  naturalKey: string | null;
  reason: string;
};

async function resolveRowsByExternalRefOrNaturalKey(
  admin: AdminClient,
  opts: {
    table: string;
    tenantId: string;
    rows: Record<string, unknown>[];
    naturalKeyColumns: string[];
  },
): Promise<{ rows: Record<string, unknown>[]; conflicts: NaturalKeyCollision[] }> {
  const dedupedRows = dedupeByExternalOrNaturalKey(opts.rows, opts.naturalKeyColumns);
  if (dedupedRows.length === 0) {
    return { rows: [], conflicts: [] };
  }

  const externalRefs = [...new Set(
    dedupedRows
      .map((row) => asStr(row.external_ref))
      .filter((value): value is string => value !== null),
  )];
  const naturalKeys = [...new Set(
    dedupedRows
      .map((row) => getRowNaturalKey(row, opts.naturalKeyColumns))
      .filter((value): value is string => value !== null),
  )];

  const columns = ['id', 'external_ref', ...opts.naturalKeyColumns, 'deleted_at'].join(', ');
  const [existingByExternalRef, existingByNaturalKey] = await Promise.all([
    externalRefs.length > 0
      ? admin.schema('app').from(opts.table).select(columns).eq('tenant_id', opts.tenantId).in('external_ref', externalRefs)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null as { message?: string } | null }),
    naturalKeys.length > 0
      ? admin.schema('app').from(opts.table).select(columns).eq('tenant_id', opts.tenantId).in(opts.naturalKeyColumns[0], naturalKeys)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null as { message?: string } | null }),
  ]);

  if (existingByExternalRef.error) throw new Error(existingByExternalRef.error.message ?? `Failed to resolve ${opts.table} by external_ref`);
  if (existingByNaturalKey.error) throw new Error(existingByNaturalKey.error.message ?? `Failed to resolve ${opts.table} by natural key`);

  const externalRefMap = new Map<string, Array<Record<string, unknown>>>();
  for (const row of (existingByExternalRef.data ?? []) as Record<string, unknown>[]) {
    const externalRef = asStr(row.external_ref);
    if (!externalRef) continue;
    const entries = externalRefMap.get(externalRef) ?? [];
    entries.push(row);
    externalRefMap.set(externalRef, entries);
  }

  const naturalKeyMap = new Map<string, Array<Record<string, unknown>>>();
  for (const row of (existingByNaturalKey.data ?? []) as Record<string, unknown>[]) {
    const naturalKey = getRowNaturalKey(row, opts.naturalKeyColumns);
    if (!naturalKey) continue;
    const entries = naturalKeyMap.get(naturalKey) ?? [];
    entries.push(row);
    naturalKeyMap.set(naturalKey, entries);
  }

  const conflicts: NaturalKeyCollision[] = [];
  const resolvedRows: Record<string, unknown>[] = [];

  for (const row of dedupedRows) {
    const externalRef = asStr(row.external_ref);
    const naturalKey = getRowNaturalKey(row, opts.naturalKeyColumns);
    const externalMatches = externalRef ? (externalRefMap.get(externalRef) ?? []) : [];
    const naturalMatches = naturalKey ? (naturalKeyMap.get(naturalKey) ?? []) : [];
    const pickMatch = (matches: Record<string, unknown>[]) => {
      if (matches.length === 0) return null;
      const active = matches.find((match) => match.deleted_at === null || match.deleted_at === undefined);
      return active ?? matches[0] ?? null;
    };

    const externalMatch = pickMatch(externalMatches);
    const naturalMatch = pickMatch(naturalMatches);
    const activeExternalMatches = externalMatches.filter((match) => match.deleted_at === null || match.deleted_at === undefined);
    const activeNaturalMatches = naturalMatches.filter((match) => match.deleted_at === null || match.deleted_at === undefined);

    if (activeExternalMatches.length > 1 || activeNaturalMatches.length > 1) {
      conflicts.push({
        externalRef,
        naturalKey,
        reason: `multiple existing ${opts.table} rows matched the same key`,
      });
      continue;
    }

    if (externalMatch && naturalMatch && asStr(externalMatch.id) !== asStr(naturalMatch.id)) {
      conflicts.push({
        externalRef,
        naturalKey,
        reason: `external_ref matched ${asStr(externalMatch.id)} but natural key matched ${asStr(naturalMatch.id)}`,
      });
      continue;
    }

    const resolvedId = asStr(externalMatch?.id) ?? asStr(naturalMatch?.id);
    resolvedRows.push(
      resolvedId
        ? { ...row, id: resolvedId }
        : row,
    );
  }

  return { rows: resolvedRows, conflicts };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
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

function resolveLineTotal(line: Record<string, unknown>, lineIndex: number): number {
  const itemTotal = pickNumber(line.item_total, line.total, line.amount);
  if (itemTotal !== null) return itemTotal;
  const qty = pickNumber(line.quantity, line.qty) ?? 0;
  const rate = pickNumber(line.rate, line.unit_price, line.price) ?? 0;
  return qty * rate;
}

function resolveLineOrder(line: Record<string, unknown>, lineIndex: number): number {
  return pickNumber(line.item_order) ?? (lineIndex + 1);
}

function resolveImportedActorId(actorId: string | null, _salespersonId: string | null): string | null {
  return actorId;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null && !Array.isArray(entry))
    : [];
}

function pickSanitizedPhone(...values: unknown[]): string | null {
  for (const value of values) {
    const phone = sanitizeZohoPhone(value);
    if (phone) return phone;
  }
  return null;
}

function extractCustomField(rec: Record<string, unknown>, apiName: string): string | null {
  const fields = rec.custom_fields;
  if (!Array.isArray(fields)) return null;
  for (const f of fields) {
    if (typeof f === 'object' && f !== null && !Array.isArray(f)) {
      const field = f as Record<string, unknown>;
      if (asStr(field.api_name) === apiName) return asStr(field.value);
    }
  }
  return null;
}

// ── Generic Zoho custom field (cf_*) capture + tenant-configured mapping ────
// See app.tenant_field_mappings (migration 20260705040222). Every cf_* field
// on a Zoho record is captured into the row's `custom_fields` jsonb column
// unconditionally; a tenant's active mapping rows additionally "promote" a
// handful of those fields onto real typed columns used by app logic.

function buildCustomFieldsJson(rec: Record<string, unknown>): Record<string, string | null> {
  const fields = rec.custom_fields;
  if (!Array.isArray(fields)) return {};
  const out: Record<string, string | null> = {};
  for (const f of fields) {
    if (typeof f === 'object' && f !== null && !Array.isArray(f)) {
      const field = f as Record<string, unknown>;
      const apiName = asStr(field.api_name);
      if (apiName) out[apiName] = asStr(field.value);
    }
  }
  return out;
}

function coerceZohoBoolean(value: string | null): boolean | null {
  if (value === null) return null;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return null;
}

interface TenantFieldMappingRow {
  zoho_field_name: string;
  target_column: string;
  transform_type: string;
}

type FieldMappingEntityType = 'customers' | 'estimates' | 'invoices';

async function loadFieldMappings(
  admin: AdminClient,
  tenantIntegrationId: string,
  entityType: FieldMappingEntityType,
): Promise<TenantFieldMappingRow[]> {
  const { data, error } = await admin
    .schema('app')
    .from('tenant_field_mappings')
    .select('zoho_field_name, target_column, transform_type')
    .eq('tenant_integration_id', tenantIntegrationId)
    .eq('entity_type', entityType)
    .eq('is_active', true);

  if (error) throw new Error(`loadFieldMappings failed: ${error.message}`);
  return (data ?? []) as TenantFieldMappingRow[];
}

function applyFieldMappings(
  customFields: Record<string, string | null>,
  mappings: TenantFieldMappingRow[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const mapping of mappings) {
    if (!(mapping.zoho_field_name in customFields)) continue;
    const raw = customFields[mapping.zoho_field_name];
    if (mapping.transform_type === 'boolean_from_zoho') {
      const bool = coerceZohoBoolean(raw);
      if (bool !== null) out[mapping.target_column] = bool;
    } else if (mapping.transform_type === 'copy') {
      out[mapping.target_column] = raw;
    }
    // 'enum_map' reserved for future transform_config-driven lookups; no
    // tenant uses it yet.
  }
  return out;
}

function normalizeZohoStrategy(value: unknown): string {
  const raw = asStr(value)?.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!raw) return 'per_item';
  if (raw.includes('percent')) return 'percentage';
  if (raw.includes('per_item') || raw.includes('item_wise') || raw.includes('item')) return 'per_item';
  return 'per_item';
}

function isSalesPricebook(record: Record<string, unknown>): boolean {
  const rawType = asStr(record.pricebook_type) ?? asStr(record.price_list_type) ?? asStr(record.type);
  const normalized = rawType?.toLowerCase() ?? null;
  if (normalized?.includes('purchase')) return false;
  if (normalized?.includes('sale')) return true;
  if (typeof record.is_sales === 'boolean') return record.is_sales;
  return true;
}

function getPricebookItemRows(rec: Record<string, unknown>): Record<string, unknown>[] {
  return asRecordArray(
    rec.pricebook_items
    ?? rec.pricelist_items
    ?? rec.item_pricings
    ?? rec.item_pricing
    ?? rec.items
    ?? rec.pricing_details,
  );
}

async function rebuildProductSearchVectors(
  admin: AdminClient,
  tenantId: string,
  productIds: string[],
): Promise<void> {
  if (productIds.length === 0) return;
  await admin.schema('app').rpc('rebuild_tenant_products_search_vectors', {
    p_tenant_id: tenantId,
    p_ids: productIds,
  });
}

const SEARCH_VECTOR_CHUNK_SIZE = 500;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export async function rebuildBuyerSearchVectors(
  admin: AdminClient,
  tenantId: string,
  buyerIds: string[],
): Promise<void> {
  if (buyerIds.length === 0) return;
  for (const chunk of chunkArray(buyerIds, SEARCH_VECTOR_CHUNK_SIZE)) {
    const { error } = await admin.schema('app').rpc('rebuild_buyers_search_vectors', {
      p_tenant_id: tenantId,
      p_ids: chunk,
    });
    if (error) throw new Error(`rebuild_buyers_search_vectors failed: ${error.message}`);
  }
}

export async function rebuildBuyerUserSearchVectors(
  admin: AdminClient,
  buyerIds: string[],
  buyerUserIds: string[],
): Promise<void> {
  if (buyerIds.length === 0 && buyerUserIds.length === 0) return;
  // chunk by buyerUserIds; each chunk gets the full buyerIds list (RPC filters by both)
  const userIdChunks = buyerUserIds.length > 0
    ? chunkArray(buyerUserIds, SEARCH_VECTOR_CHUNK_SIZE)
    : [[]];
  for (const chunk of userIdChunks) {
    const { error } = await admin.schema('app').rpc('rebuild_buyer_users_search_vectors', {
      p_buyer_ids: buyerIds.length > 0 ? buyerIds : null,
      p_ids: chunk.length > 0 ? chunk : null,
    });
    if (error) throw new Error(`rebuild_buyer_users_search_vectors failed: ${error.message}`);
  }
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

function getEmbeddedLocationAssociatedUsers(rec: Record<string, unknown>): Record<string, unknown>[] {
  const candidate = rec.associated_users;
  if (Array.isArray(candidate)) {
    return candidate.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null && !Array.isArray(row));
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
  pairs: Array<{ externalId: string; internalId: string; sourcePayload?: Record<string, unknown> | null }>,
  options?: {
    syncStatus?: 'synced' | 'pending_push' | 'conflict' | 'error';
    errorReason?: string | null;
  },
): Promise<void> {
  if (pairs.length === 0) return;

  const rows = pairs.map((p) => ({
    tenant_id: tenantId,
    tenant_integration_id: integrationId,
    entity_type: entityType,
    external_id: p.externalId,
    internal_id: p.internalId,
    last_synced_at: nowIso(),
    sync_status: options?.syncStatus ?? 'synced',
    error_reason: options?.errorReason ?? null,
    source_payload: p.sourcePayload ?? null,
  }));

  await bulkPersistJsonbRecords(admin, 'integration_entity_map', dedupeByColumns(rows, [
    'tenant_id',
    'tenant_integration_id',
    'entity_type',
    'external_id',
  ]), [
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
  }], ['tenant_id', 'external_ref']);

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

function buildPersistedRowPairsFromSourceRows(
  sourceRows: Record<string, unknown>[],
  persistedRows: Record<string, unknown>[],
  naturalKeyColumns: string[],
): Array<{ externalId: string; internalId: string }> {
  const persistedByExternalRef = new Map<string, string>();
  const persistedByNaturalKey = new Map<string, string>();

  for (const row of persistedRows) {
    const externalId = asStr(row.external_ref);
    const internalId = asStr(row.id);
    const naturalKey = getRowNaturalKey(row, naturalKeyColumns);
    if (externalId && internalId) persistedByExternalRef.set(externalId, internalId);
    if (naturalKey && internalId) persistedByNaturalKey.set(naturalKey, internalId);
  }

  const pairs = new Map<string, string>();
  for (const row of sourceRows) {
    const externalId = asStr(row.external_ref);
    if (!externalId) continue;
    const naturalKey = getRowNaturalKey(row, naturalKeyColumns);
    const internalId = persistedByExternalRef.get(externalId) ?? (naturalKey ? persistedByNaturalKey.get(naturalKey) ?? null : null);
    if (internalId) {
      pairs.set(externalId, internalId);
    }
  }

  return [...pairs.entries()].map(([externalId, internalId]) => ({ externalId, internalId }));
}

function buildPersistedAuditUpdates(
  persisted: Record<string, unknown>[],
  sourceByExternalRef: Map<string, Record<string, unknown>>,
  actorId: string | null,
): Array<{ id: string; updatePayload: Record<string, unknown> }> {
  return persisted.flatMap((row) => {
    const id = asStr(row.id);
    const externalId = asStr(row.external_ref);
    const source = externalId ? sourceByExternalRef.get(externalId) ?? null : null;
    if (!id || !source) return [];

    const updatePayload: Record<string, unknown> = {
      updated_by: actorId,
    };

    const createdAt = asStr(source.created_at);
    const updatedAt = asStr(source.updated_at);
    const createdBy = asStr(source.created_by);
    const updatedBy = asStr(source.updated_by);

    if (createdAt) updatePayload.created_at = createdAt;
    if (updatedAt) updatePayload.updated_at = updatedAt;
    if (createdBy) updatePayload.created_by = createdBy;
    else if (actorId) updatePayload.created_by = actorId;
    if (updatedBy) updatePayload.updated_by = updatedBy;
    else if (actorId) updatePayload.updated_by = actorId;

    return [{ id, updatePayload }];
  });
}

async function applyPersistedAuditUpdates(
  admin: AdminClient,
  table: string,
  updates: Array<{ id: string; updatePayload: Record<string, unknown> }>,
): Promise<void> {
  for (const item of updates) {
    await admin
      .schema('app')
      .from(table)
      .update(item.updatePayload)
      .eq('id', item.id);
  }
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

// ── FK-failsafe ensure helpers ────────────────────────────────────────────────
// Each helper: resolve from entity_map+table → fetch from Zoho if missing → persist → re-resolve.
// Only active when adapter is provided (webhook path). Bulk sync callers omit adapter and get
// the existing graceful-degradation behaviour (null / skip / throw) unchanged.

async function ensureBuyerExists(
  admin: AdminClient,
  tenantId: string,
  actorId: string | null,
  integrationId: string,
  zohoTypeId: ZohoIntegrationTypeId,
  externalContactId: string,
  adapter: ZohoAdapter,
): Promise<string | null> {
  const existing = await resolveInternalIdWithFallback(admin, tenantId, integrationId, 'customers', 'buyers', externalContactId);
  if (existing) return existing;

  const fetched = await adapter.fetchContactById(externalContactId);
  if (!fetched) return null;

  await persistBuyers(admin, tenantId, actorId, integrationId, [fetched], adapter, zohoTypeId);
  return resolveInternalIdWithFallback(admin, tenantId, integrationId, 'customers', 'buyers', externalContactId);
}

async function ensureProductExists(
  admin: AdminClient,
  tenantId: string,
  actorId: string | null,
  integrationId: string,
  zohoTypeId: ZohoIntegrationTypeId,
  externalItemId: string,
  adapter: ZohoAdapter,
): Promise<string | null> {
  const existing = await resolveInternalIdWithFallback(admin, tenantId, integrationId, 'products', 'tenant_products', externalItemId);
  if (existing) return existing;

  const fetched = await adapter.fetchItemById(externalItemId);
  if (!fetched) return null;

  await persistProducts(admin, tenantId, actorId, integrationId, [fetched], adapter);
  return resolveInternalIdWithFallback(admin, tenantId, integrationId, 'products', 'tenant_products', externalItemId);
}

async function ensurePricelistExists(
  admin: AdminClient,
  tenantId: string,
  actorId: string | null,
  integrationId: string,
  zohoTypeId: ZohoIntegrationTypeId,
  externalPricebookId: string,
  adapter: ZohoAdapter,
): Promise<string | null> {
  const existing = await resolveInternalIdWithFallback(admin, tenantId, integrationId, 'pricelists', 'price_lists', externalPricebookId);
  if (existing) return existing;

  const fetched = await adapter.fetchPricebookDetail(externalPricebookId);
  if (!fetched) return null;

  await persistPricelists(admin, tenantId, actorId, integrationId, [fetched], adapter);
  return resolveInternalIdWithFallback(admin, tenantId, integrationId, 'pricelists', 'price_lists', externalPricebookId);
}

async function ensureLocationExists(
  admin: AdminClient,
  tenantId: string,
  actorId: string | null,
  integrationId: string,
  zohoTypeId: ZohoIntegrationTypeId,
  externalLocationId: string,
  adapter: ZohoAdapter,
): Promise<string | null> {
  const existing = await resolveInternalIdWithFallback(admin, tenantId, integrationId, 'locations', 'locations', externalLocationId);
  if (existing) return existing;

  const fetched = await adapter.fetchLocationById(externalLocationId);
  if (!fetched) return null;

  await persistLocations(admin, tenantId, actorId, integrationId, zohoTypeId, [fetched], adapter);
  return resolveInternalIdWithFallback(admin, tenantId, integrationId, 'locations', 'locations', externalLocationId);
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
  // Guard: no desired rows means we have no complete picture (e.g. Zoho list endpoint
  // omits line_items). Do not touch existing children — webhooks may have written them.
  if (rows.length === 0) return;
  const dedupedRows = dedupeByColumns(rows, [parentColumn, 'external_ref']);

  if (dedupedRows.length > 0) {
    await bulkPersistJsonbRecords(admin, table, dedupedRows, [parentColumn, 'external_ref']);
  }

  const { data } = await admin
    .schema('app')
    .from(table)
    .select(`id, ${parentColumn}, external_ref`)
    .in(parentColumn, parentIds)
    .is('deleted_at', null);

  if (!Array.isArray(data)) return;

  const desiredByParent = new Map<string, Set<string>>();
  for (const row of dedupedRows) {
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
  adapter?: ZohoAdapter,
): Promise<PersistResult> {
  const result: PersistResult = { created: 0, updated: 0, skipped: 0, pendingSearchVectorBuyerIds: [], pendingSearchVectorBuyerUserIds: [] };

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
  const zohoUsers = adapter ? await adapter.fetchUsers() : [];
  const zohoUserById = new Map(
    zohoUsers
      .map((user) => {
        const id = asStr(user.user_id);
        if (!id) return null;
        return [
          id,
          {
            email: asStr(user.email),
            user_name: asStr(user.name) ?? asStr(user.user_name),
          },
        ] as const;
      })
      .filter((entry): entry is readonly [string, { email: string | null; user_name: string | null }] => entry !== null),
  );

  // Build reverse map: location_id → users assigned there.
  // Zoho users carry a location_id/warehouse_id field; the location list itself
  // doesn't embed associated_users, so we infer assignments from the user list.
  const usersByLocationId = new Map<string, Array<{ email: string; user_name: string | null }>>();
  for (const user of zohoUsers) {
    const locId = asStr(user.location_id) ?? asStr(user.warehouse_id);
    if (!locId) continue;
    const email = asStr(user.email);
    if (!email) continue;
    if (!usersByLocationId.has(locId)) usersByLocationId.set(locId, []);
    usersByLocationId.get(locId)!.push({
      email,
      user_name: asStr(user.name) ?? asStr(user.user_name) ?? null,
    });
  }

  for (const rec of records) {
    const externalId = asStr(rec.location_id);
    if (!externalId) { result.skipped++; continue; }

    const name = asStr(rec.location_name);
    if (!name) { result.skipped++; continue; }

    const isPrimary = asBool(rec.is_primary);
    const isDefault = !defaultAssigned && isPrimary;
    if (isDefault) defaultAssigned = true;

    const rawAddr = rec.address;
    const address = rawAddr && typeof rawAddr === 'object' ? rawAddr : null;
    const phoneNumber = sanitizeZohoPhone(rec.phone);
    const status = asStr(rec.is_location_active) ?? asBool(rec.status) ? 'active' : 'inactive';
    const sourceAssociatedUsers = getEmbeddedLocationAssociatedUsers(rec);
    // Fall back to users inferred from the Zoho /users reverse map when the location
    // list endpoint doesn't embed associated_users.
    const effectiveAssociatedUsers = sourceAssociatedUsers.length > 0
      ? sourceAssociatedUsers.map((user) => {
          const sourceUserId = asStr(user.user_id) ?? asStr(user.id);
          const sourceUser = sourceUserId ? zohoUserById.get(sourceUserId) ?? null : null;
          const email = pickString(user.email, sourceUser?.email);
          if (!email) return null;
          return {
            email,
            user_name: pickString(user.user_name, sourceUser?.user_name),
            user_id: sourceUserId,
          };
        }).filter((user): user is Record<string, unknown> => user !== null)
      : (externalId ? (usersByLocationId.get(externalId) ?? []) : []);
    const associatedUsers = normalizeLocationAssociatedUsers(effectiveAssociatedUsers);

    const row = {
      tenant_id: tenantId,
      external_ref: externalId,
      name,
      address: address as Record<string, unknown> | null,
      phone_number: phoneNumber,
      status,
      associated_users: associatedUsers,
      deleted_at: null,
      ...(isDefault ? { is_default: true } : {}),
      created_at: asDate(rec.created_time ?? rec.created_at ?? rec.date_created),
      updated_at: asDate(rec.last_modified_time ?? rec.updated_at ?? rec.updated_time ?? rec.modified_time),
      created_by: actorId,
      updated_by: actorId,
    };
    rows.push(row);
  }

  const dedupedLocationRows = dedupeByColumns(rows, ['tenant_id', 'external_ref']);
  const persisted = dedupedLocationRows.length > 0
    ? await bulkPersistJsonbRecords(admin, 'locations', dedupedLocationRows, ['tenant_id', 'external_ref'])
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

  const sourceByExternalRef = new Map(
    rows
      .map((row) => {
        const externalRef = asStr(row.external_ref);
        return externalRef ? [externalRef, row] as const : null;
      })
      .filter((entry): entry is readonly [string, Record<string, unknown>] => entry !== null),
  );

  const auditUpdates = buildPersistedAuditUpdates(persisted, sourceByExternalRef, actorId);
  await applyPersistedAuditUpdates(admin, 'locations', auditUpdates);

  const assignments = persisted.flatMap((row) => {
    const id = asStr(row.id);
    const externalId = asStr(row.external_ref);
    if (!id || !externalId) return [];
    const source = sourceByExternalRef.get(externalId) ?? null;
    const users = normalizeLocationAssociatedUsers(source?.associated_users);
    return [{ locationId: id, users }];
  });

  for (const assignment of assignments) {
    await syncLocationAssignees(
      admin as any,
      tenantId,
      assignment.locationId,
      assignment.users,
      actorId,
    );
  }

  return result;
}

// ── Warehouses ───────────────────────────────────────────────────────────────

async function persistWarehouses(
  admin: AdminClient,
  tenantId: string,
  actorId: string | null,
  integrationId: string,
  records: Record<string, unknown>[],
): Promise<PersistResult> {
  const result: PersistResult = { created: 0, updated: 0, skipped: 0, pendingSearchVectorBuyerIds: [], pendingSearchVectorBuyerUserIds: [] };

  // Collect location external IDs to resolve location_id FK for each warehouse
  const locationExternalIds = [
    ...new Set(
      records.map((r) => asStr(r.location_id)).filter((x): x is string => x !== null),
    ),
  ];
  const locationIdMap = locationExternalIds.length > 0
    ? await resolveInternalIdsWithFallback(admin, tenantId, integrationId, 'locations', 'locations', locationExternalIds)
    : new Map<string, string>();

  const rows: Record<string, unknown>[] = [];

  for (const rec of records) {
    const externalId = asStr(rec.warehouse_id);
    if (!externalId) { result.skipped++; continue; }

    const name = asStr(rec.warehouse_name);
    if (!name) { result.skipped++; continue; }

    const locationExtId = asStr(rec.location_id);
    const locationId = locationExtId ? (locationIdMap.get(locationExtId) ?? null) : null;

    const rawAddr = rec.address;
    const address = rawAddr && typeof rawAddr === 'object' ? rawAddr : null;
    const phoneNumber = sanitizeZohoPhone(rec.phone);
    const status = asStr(rec.status) ?? (asBool(rec.is_active) === false ? 'inactive' : 'active');

    rows.push({
      tenant_id: tenantId,
      external_ref: externalId,
      name,
      location_id: locationId,
      address: address as Record<string, unknown> | null,
      phone_number: phoneNumber,
      status,
      is_default: asBool(rec.is_primary) ?? false,
      associated_users: [],
      deleted_at: null,
      created_at: asDate(rec.created_time ?? rec.created_at ?? rec.date_created),
      updated_at: asDate(rec.last_modified_time ?? rec.updated_at ?? rec.updated_time ?? rec.modified_time),
      created_by: actorId,
      updated_by: actorId,
    });
  }

  const dedupedRows = dedupeByColumns(rows, ['tenant_id', 'external_ref']);
  const persisted = dedupedRows.length > 0
    ? await bulkPersistJsonbRecords(admin, 'warehouses', dedupedRows, ['tenant_id', 'external_ref'])
    : [];

  const entityMapPairs = persisted
    .map((row) => {
      const externalId = asStr(row.external_ref);
      const internalId = asStr(row.id);
      return externalId && internalId ? { externalId, internalId } : null;
    })
    .filter((r): r is { externalId: string; internalId: string } => r !== null);

  result.updated += persisted.length;
  await batchUpsertEntityMap(admin, tenantId, integrationId, 'warehouses', entityMapPairs);

  const sourceByExternalRef = new Map(
    rows
      .map((row) => {
        const externalRef = asStr(row.external_ref);
        return externalRef ? [externalRef, row] as const : null;
      })
      .filter((entry): entry is readonly [string, Record<string, unknown>] => entry !== null),
  );

  const auditUpdates = buildPersistedAuditUpdates(persisted, sourceByExternalRef, actorId);
  await applyPersistedAuditUpdates(admin, 'warehouses', auditUpdates);

  return result;
}

// ── Buyers (contacts) + buyer_contacts (contact persons) ────────────────────

async function persistBuyers(
  admin: AdminClient,
  tenantId: string,
  actorId: string | null,
  integrationId: string,
  records: Record<string, unknown>[],
  adapter?: ZohoAdapter,
  zohoTypeId?: ZohoIntegrationTypeId,
): Promise<PersistResult> {
  const result: PersistResult = { created: 0, updated: 0, skipped: 0, pendingSearchVectorBuyerIds: [], pendingSearchVectorBuyerUserIds: [] };
  const buyerRows: Record<string, unknown>[] = [];
  const customerFieldMappings = await loadFieldMappings(admin, integrationId, 'customers');

  for (const rec of records) {
    const externalId = asStr(rec.contact_id);
    if (!externalId) { result.skipped++; continue; }

    const businessName = asStr(rec.company_name)
      ?? asStr(rec.contact_name)
      ?? 'Unknown';

    const billingAddress = asRecord(rec.billing_address);
    const shippingAddress = asRecord(rec.shipping_address);
    const geo = (() => {
      const a = billingAddress;
      if (!a) return null;
      return {
        state: asStr(a.state),
        city: asStr(a.city),
        address: asStr(a.address) ?? asStr(a.street),
        pincode: asStr(a.zip),
        country: asStr(a.country),
      };
    })();

    const customFields = buildCustomFieldsJson(rec);

    const row = {
      tenant_id: tenantId,
      external_ref: externalId,
      business_name: businessName,
      contact_name: asStr(rec.contact_name) ?? asStr(rec.first_name),
      email: asStr(rec.email),
      gstin: asStr(rec.gst_no) ?? asStr(rec.gstin) ?? extractCustomField(rec, 'cf_gstin'),
      gst_treatment: asStr(rec.gst_treatment),
      status: asStr(rec.status),
      billing_address: billingAddress,
      shipping_address: shippingAddress,
      credit_limit: asNum(rec.credit_limit),
      payment_terms_days: asNum(rec.payment_terms) ?? asNum(rec.payment_terms_days),
      geography: geo,
      is_active: (asStr(rec.status) ?? 'active') === 'active',
      custom_fields: customFields,
      ...applyFieldMappings(customFields, customerFieldMappings),
      deleted_at: null,
      created_by: actorId,
      updated_by: actorId,
      ...(pickSanitizedPhone(
        rec.phone,
        rec.mobile,
        billingAddress?.phone,
        billingAddress?.mobile,
        billingAddress?.phone_number,
        shippingAddress?.phone,
        shippingAddress?.mobile,
      ) ? {
        phone: pickSanitizedPhone(
          rec.phone,
          rec.mobile,
          billingAddress?.phone,
          billingAddress?.mobile,
          billingAddress?.phone_number,
          shippingAddress?.phone,
          shippingAddress?.mobile,
        ),
      } : {}),
    };

    buyerRows.push(row);
  }

  const persistedBuyers = buyerRows.length > 0
    ? await bulkPersistJsonbRecords(admin, 'buyers', dedupeByExternalRef(buyerRows), ['tenant_id', 'external_ref'])
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
  const buyerAssignmentRows: Record<string, unknown>[] = [];
  const pricebookExternalIds = [
    ...new Set(
      records
        .map((rec) => asStr(rec.pricebook_id) ?? asStr(rec.price_list_id))
        .filter((value): value is string => value !== null),
    ),
  ];
  const pricebookIdMap = await resolveInternalIdsWithFallback(
    admin,
    tenantId,
    integrationId,
    'pricelists',
    'price_lists',
    pricebookExternalIds,
  );

  // FK-failsafe: fetch missing pricelists from Zoho when adapter is present (webhook path)
  if (adapter && zohoTypeId) {
    for (const extId of pricebookExternalIds) {
      if (!pricebookIdMap.has(extId)) {
        const internalId = await ensurePricelistExists(admin, tenantId, actorId, integrationId, zohoTypeId, extId, adapter);
        if (internalId) pricebookIdMap.set(extId, internalId);
      }
    }
  }

  const remoteContactPersonMap = new Map<string, Record<string, unknown>[]>();
  // contact_persons are embedded in Zoho's list response (per_page=200). No per-contact fetch.

  for (const rec of records) {
    const externalId = asStr(rec.contact_id);
    if (!externalId) continue;

    const buyerId = buyerIdMap.get(externalId) ?? null;
    if (!buyerId) continue;

    const embeddedContactPersons = asRecordArray((rec as Record<string, unknown>).contact_persons);
    const contactPersons = embeddedContactPersons.length > 0
      ? embeddedContactPersons
      : remoteContactPersonMap.get(externalId) ?? [];

    for (const cp of contactPersons) {
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
        deleted_at: null,
        ...(pickSanitizedPhone(cp.phone, cp.mobile) ? { phone: pickSanitizedPhone(cp.phone, cp.mobile) } : {}),
      });
    }

    const pricebookExternalId = asStr(rec.pricebook_id) ?? asStr(rec.price_list_id);
    const priceListId = pricebookExternalId ? pricebookIdMap.get(pricebookExternalId) ?? null : null;
    if (priceListId) {
      buyerAssignmentRows.push({
        price_list_id: priceListId,
        target_type: 'buyer',
        target_id: buyerId,
        external_ref: `zoho_buyer_pricebook:${buyerId}`,
        source_payload: {
          source: 'zoho_pricebook_assignment',
          contact_id: externalId,
          pricebook_id: pricebookExternalId,
        },
        created_by: actorId,
        updated_by: actorId,
        deleted_at: null,
      });
    }
  }

  const dedupedContactRows = dedupeByColumns(contactRows, ['buyer_id', 'external_ref']);
  const persistedContacts = dedupedContactRows.length > 0
    ? await bulkPersistJsonbRecords(admin, 'buyer_users', dedupedContactRows, ['buyer_id', 'external_ref'])
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

  const buyerIds = buyerMapPairs.map((row) => row.internalId);
  const buyerUserIds = persistedContacts
    .map((row) => asStr(row.id))
    .filter((value): value is string => value !== null);

  if (buyerIds.length > 0) {
    await admin
      .schema('app')
      .from('price_list_assignments')
      .update({
        deleted_at: nowIso(),
        updated_at: nowIso(),
        updated_by: actorId,
      })
      .eq('target_type', 'buyer')
      .in('target_id', buyerIds)
      .like('external_ref', 'zoho_buyer_pricebook:%')
      .is('deleted_at', null);
  }

  const dedupedBuyerAssignmentRows = dedupeByColumns(
    buyerAssignmentRows,
    ['price_list_id', 'target_type', 'target_id', 'external_ref'],
  );

  if (dedupedBuyerAssignmentRows.length > 0) {
    await bulkPersistJsonbRecords(
      admin,
      'price_list_assignments',
      dedupedBuyerAssignmentRows,
      ['price_list_id', 'target_type', 'target_id', 'external_ref'],
    );
  }

  result.pendingSearchVectorBuyerIds = buyerIds;
  result.pendingSearchVectorBuyerUserIds = buyerUserIds;

  return result;
}

// ── Products (categories + brands + products + inventory) ────────────────────

const ITEM_LOC_CONCURRENCY = 5;

async function createWarehouseFromZoho(
  admin: AdminClient,
  tenantId: string,
  actorId: string | null,
  zohoWarehouse: Record<string, unknown>,
): Promise<string | null> {
  const externalRef = asStr(zohoWarehouse.warehouse_id);
  if (!externalRef) return null;

  const name = asStr(zohoWarehouse.warehouse_name) || 'Unknown Warehouse';

  try {
    const { data, error } = await admin
      .schema('app')
      .from('warehouses')
      .upsert({
        external_ref: externalRef,
        tenant_id: tenantId,
        name,
        status: 'active',
        associated_users: [],
        created_by: actorId,
        updated_by: actorId,
      }, {
        onConflict: 'tenant_id,external_ref',
        ignoreDuplicates: false,
      })
      .select('id')
      .single();

    if (error) {
      console.warn(`sync-products: Failed to create warehouse ${externalRef}:`, error.message);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.warn(`sync-products: Exception creating warehouse ${externalRef}:`, err);
    return null;
  }
}

async function ensureWarehouseExists(
  admin: AdminClient,
  tenantId: string,
  actorId: string | null,
  integrationId: string,
  zohoTypeId: ZohoIntegrationTypeId,
  warehouseExternalId: string,
  adapter?: ZohoAdapter,
  sourceWarehouse?: Record<string, unknown>,
): Promise<string | null> {
  const existing = await resolveInternalIdsWithFallback(
    admin,
    tenantId,
    integrationId,
    'warehouses',
    'warehouses',
    [warehouseExternalId],
  );
  const resolved = existing.get(warehouseExternalId) ?? null;
  if (resolved) return resolved;

  if (sourceWarehouse) {
    const created = await createWarehouseFromZoho(admin, tenantId, actorId, sourceWarehouse);
    if (created) {
      return created;
    }
  }

  if (!adapter) return null;

  const fetched = await adapter.fetchLocationById(warehouseExternalId);
  if (!fetched) return null;

  await persistWarehouses(admin, tenantId, actorId, integrationId, [fetched]);
  const afterCreate = await resolveInternalIdsWithFallback(
    admin,
    tenantId,
    integrationId,
    'warehouses',
    'warehouses',
    [warehouseExternalId],
  );
  return afterCreate.get(warehouseExternalId) ?? null;
}

async function fetchAndPersistMissingItemLocations(
  admin: AdminClient,
  tenantId: string,
  actorId: string | null,
  integrationId: string,
  itemIds: string[],
  adapter: ZohoAdapter,
  productIdMap: Map<string, string>,
  warehouseIdMap: Map<string, string>,
): Promise<number> {
  if (itemIds.length === 0) return 0;

  const inventoryRows: Record<string, unknown>[] = [];
  let updatedWarehouseIdMap = new Map(warehouseIdMap);

  for (let i = 0; i < itemIds.length; i += ITEM_LOC_CONCURRENCY) {
    const batch = itemIds.slice(i, i + ITEM_LOC_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((itemId) => adapter.request<{ item: Record<string, unknown> }>({ path: `/items/${itemId}` })),
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === 'rejected') {
        console.warn(`sync-products: GET /items/${batch[j]} failed:`, result.reason);
        continue;
      }

      const itemId = batch[j];
      const zohoItem = result.value?.item;
      if (!zohoItem?.item_id) {
        console.warn(`sync-products: invalid response for item ${itemId}`);
        continue;
      }

      const warehouses = Array.isArray(zohoItem.warehouses) ? zohoItem.warehouses : [];
      const productId = productIdMap.get(itemId);

      if (!productId) {
        console.warn(`sync-products: product not found for item ${itemId}`);
        continue;
      }

      for (const warehouse of warehouses) {
        const warehouseExternalId = asStr(warehouse.warehouse_id);
        if (!warehouseExternalId) continue;

        let warehouseId = updatedWarehouseIdMap.get(warehouseExternalId);

        if (!warehouseId) {
          try {
            const newWarehouseId = await ensureWarehouseExists(
              admin,
              tenantId,
              actorId,
              integrationId,
              adapter.integrationTypeId,
              warehouseExternalId,
              adapter,
              warehouse as Record<string, unknown>,
            );
            if (newWarehouseId) {
              warehouseId = newWarehouseId;
              updatedWarehouseIdMap.set(warehouseExternalId, newWarehouseId);
              console.log(`sync-products: created missing warehouse ${warehouseExternalId}`);
            }
          } catch (err) {
            console.warn(`sync-products: failed to create warehouse ${warehouseExternalId}:`, err);
            continue;
          }
        }

        if (!warehouseId) {
          console.warn(`sync-products: could not resolve warehouse ${warehouseExternalId}`);
          continue;
        }

        inventoryRows.push({
          tenant_product_id: productId,
          warehouse_id: warehouseId,
          qty_available: asNum(warehouse.warehouse_available_stock) || 0,
          qty_reserved: asNum(warehouse.warehouse_reserved_stock) || 0,
          reorder_point: asNum(warehouse.reorder_level) || null,
          updated_at: nowIso(),
          deleted_at: null,
          created_by: actorId,
          updated_by: actorId,
        });
      }
    }
  }

  if (inventoryRows.length === 0) return 0;

  const dedupedRows = dedupeByColumns(inventoryRows, ['tenant_product_id', 'warehouse_id']);

  try {
    await bulkPersistJsonbRecords(admin, 'tenant_inventory', dedupedRows, ['tenant_product_id', 'warehouse_id']);
    return dedupedRows.length;
  } catch (err) {
    // Fallback: row-by-row
    let count = 0;
    for (const row of dedupedRows) {
      try {
        await bulkPersistJsonbRecords(admin, 'tenant_inventory', [row], ['tenant_product_id', 'warehouse_id']);
        count++;
      } catch (rowErr) {
        console.warn(
          `sync-products: inventory upsert failed for ${row.tenant_product_id}/${row.warehouse_id}:`,
          rowErr,
        );
      }
    }
    return count;
  }
}

async function persistProducts(
  admin: AdminClient,
  tenantId: string,
  actorId: string | null,
  integrationId: string,
  records: Record<string, unknown>[],
  adapter?: ZohoAdapter,
): Promise<PersistResult> {
  const result: PersistResult = { created: 0, updated: 0, skipped: 0, pendingSearchVectorBuyerIds: [], pendingSearchVectorBuyerUserIds: [] };

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
      deleted_at: null,
      created_by: actorId,
      updated_by: actorId,
    });
  }

  if (categoryRows.length > 0) {
    const categoryResolution = await resolveRowsByExternalRefOrNaturalKey(admin, {
      table: 'tenant_categories',
      tenantId,
      rows: categoryRows,
      naturalKeyColumns: ['slug'],
    });
    if (categoryResolution.conflicts.length > 0) {
      console.warn('[persistProducts] category collision conflicts:', categoryResolution.conflicts);
      result.skipped += categoryResolution.conflicts.length;
    }
    const catRowsPersisted = categoryResolution.rows.length > 0
      ? await bulkPersistJsonbRecords(admin, 'tenant_categories', categoryResolution.rows, ['id'])
      : [];
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
      buildPersistedRowPairsFromSourceRows(categoryRows, catRowsPersisted, ['slug']),
    );
  }

  // Step B: upsert brands
  const brandNames = [...new Set(
    records
      .map((r) => asStr(r.brand) ?? asStr(r.manufacturer))
      .filter((n): n is string => n !== null),
  )];

  // Fallback brand for products with no brand field
  const fallbackBrandExtRef = 'zoho_brand:__unknown__';
  const allBrandRows = [
    ...brandNames.map((name) => ({
      tenant_id: tenantId,
      external_ref: `zoho_brand:${slugify(name)}`,
      display_name_override: name,
      slug: slugify(name),
      is_active: true,
      deleted_at: null,
      created_by: actorId,
      updated_by: actorId,
    })),
    {
      tenant_id: tenantId,
      external_ref: fallbackBrandExtRef,
      display_name_override: 'Unknown Brand',
      slug: 'unknown-brand',
      is_active: true,
      deleted_at: null,
      created_by: actorId,
      updated_by: actorId,
    },
  ];

  const brandMap = new Map<string, string>(); // zohoName → tenant_brand_id
  let fallbackBrandId: string | null = null;

  const brandResolution = await resolveRowsByExternalRefOrNaturalKey(admin, {
    table: 'tenant_brands',
    tenantId,
    rows: allBrandRows,
    naturalKeyColumns: ['slug'],
  });
  if (brandResolution.conflicts.length > 0) {
    console.warn('[persistProducts] brand collision conflicts:', brandResolution.conflicts);
    result.skipped += brandResolution.conflicts.length;
  }
  const brandData = brandResolution.rows.length > 0
    ? await bulkPersistJsonbRecords(admin, 'tenant_brands', brandResolution.rows, ['id'])
    : [];
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
    buildPersistedRowPairsFromSourceRows(allBrandRows, brandData, ['slug']),
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
      gst_rate: pickNumber(rec.tax_percentage, rec.gst_rate),
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
        'tax_percentage',
        'tax_id',
        'tax_name',
        'gst_rate',
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
      deleted_at: null,
    });
  }

  const productResolution = await resolveRowsByExternalRefOrNaturalKey(admin, {
    table: 'tenant_products',
    tenantId,
    rows: productRows,
    naturalKeyColumns: ['internal_sku'],
  });
  if (productResolution.conflicts.length > 0) {
    console.warn('[persistProducts] product collision conflicts:', productResolution.conflicts);
    result.skipped += productResolution.conflicts.length;
  }
  const persistedProducts = productResolution.rows.length > 0
    ? await bulkPersistJsonbRecords(admin, 'tenant_products', productResolution.rows, ['id'])
    : [];
  const productMapPairs = buildPersistedRowPairsFromSourceRows(productRows, persistedProducts, ['internal_sku']);
  const productIdMap = new Map(productMapPairs.map((row) => [row.externalId, row.internalId] as const));

  result.updated += productMapPairs.length;
  await batchUpsertEntityMap(admin, tenantId, integrationId, 'products', productMapPairs);

  // Step D: upsert inventory from embedded warehouse snapshots on each item
  const warehouseExternalIds = [
    ...new Set(
      records.flatMap((r) => {
        const locs = getEmbeddedLocationRows(r);
        return locs.map((l) => getEmbeddedLocationExternalId(l)).filter((x): x is string => x !== null);
      }),
    ),
  ];

  const warehouseIdMap = await resolveInternalIdsWithFallback(
    admin, tenantId, integrationId, 'warehouses', 'warehouses', warehouseExternalIds,
  );

  const inventoryRows: Record<string, unknown>[] = [];
  const needDetailItemIds: string[] = [];
  let inventorySyncError: IntegrationSyncError | null = null;

  for (const rec of records) {
    const extProductId = asStr(rec.item_id);
    if (!extProductId) continue;

    const productId = productIdMap.get(extProductId);
    if (!productId) {
      inventorySyncError = new IntegrationSyncError(
        'tenant_inventory',
        `Unable to resolve imported product ${extProductId} for inventory sync.`,
        extProductId,
        { product_id: extProductId },
      );
      break;
    }

    const locs = getEmbeddedLocationRows(rec);
    if (locs.length === 0 && adapter) {
      // No embedded warehouse data — queue for detail fetch
      needDetailItemIds.push(extProductId);
    } else {
      for (const loc of locs) {
        const extWarehouseId = getEmbeddedLocationExternalId(loc);
        if (!extWarehouseId) continue;

        let warehouseId = warehouseIdMap.get(extWarehouseId) ?? null;
        if (!warehouseId) {
          warehouseId = await ensureWarehouseExists(
            admin,
            tenantId,
            actorId,
            integrationId,
            adapter?.integrationTypeId ?? 'zoho_books',
            extWarehouseId,
            adapter,
            loc,
          );
          if (warehouseId) {
            warehouseIdMap.set(extWarehouseId, warehouseId);
          }
        }

        if (!warehouseId) {
          console.warn(
            `sync-products: unable to resolve warehouse ${extWarehouseId} for product ${extProductId}, skipping inventory row`,
          );
          continue;
        }

        inventoryRows.push({
          tenant_product_id: productId,
          warehouse_id: warehouseId,
          qty_available: getEmbeddedLocationQty(loc),
          qty_reserved: 0,
          updated_at: nowIso(),
          deleted_at: null,
        });
      }
    }
  }

  if (inventorySyncError) {
    const errorReason = formatErrorReason(inventorySyncError.message, inventorySyncError.details);
    await batchUpsertEntityMap(admin, tenantId, integrationId, 'products', productMapPairs, {
      syncStatus: 'error',
      errorReason,
    });
    throw inventorySyncError;
  }

  const dedupedInventoryRows = dedupeByColumns(inventoryRows, ['tenant_product_id', 'warehouse_id']);
  if (dedupedInventoryRows.length > 0) {
    await bulkPersistJsonbRecords(admin, 'tenant_inventory', dedupedInventoryRows, ['tenant_product_id', 'warehouse_id']);
  }

  // Fetch missing warehouse data via detail API if adapter available
  if (needDetailItemIds.length > 0 && adapter) {
    await fetchAndPersistMissingItemLocations(
      admin,
      tenantId,
      actorId,
      integrationId,
      needDetailItemIds,
      adapter,
      productIdMap,
      warehouseIdMap,
    );
  }

  await rebuildProductSearchVectors(
    admin,
    tenantId,
    productMapPairs.map((row) => row.internalId),
  );

  return result;
}

async function persistPricelists(
  admin: AdminClient,
  tenantId: string,
  actorId: string | null,
  integrationId: string,
  records: Record<string, unknown>[],
  adapter?: ZohoAdapter,
): Promise<PersistResult> {
  const sourceRecords = records.length > 0
    ? records
    : adapter
      ? await adapter.fetchPricelists()
      : [];
  const salesPricebooks = sourceRecords.filter(isSalesPricebook);
  const result: PersistResult = {
    created: 0,
    updated: 0,
    skipped: sourceRecords.length - salesPricebooks.length,
  };

  if (salesPricebooks.length === 0) {
    return result;
  }

  const priceListRows: Record<string, unknown>[] = [];
  for (const pricebook of salesPricebooks) {
    const externalRef = asStr(pricebook.pricebook_id) ?? asStr(pricebook.pricelist_id);
    if (!externalRef) {
      result.skipped++;
      continue;
    }

    priceListRows.push({
      tenant_id: tenantId,
      external_ref: externalRef,
      name: pickString(pricebook.name, pricebook.pricebook_name) ?? `Zoho pricelist ${externalRef}`,
      description: asStr(pricebook.description),
      currency: pickString(pricebook.currency_code, pricebook.currency) ?? 'INR',
      valid_from: asDate(pricebook.start_date ?? pricebook.valid_from ?? pricebook.created_time) ?? nowIso(),
      valid_to: asDate(pricebook.end_date ?? pricebook.valid_to),
      priority: asNum(pricebook.priority) ?? 0,
      is_active: (asStr(pricebook.status) ?? 'active') === 'active',
      pricing_strategy: normalizeZohoStrategy(pricebook.pricebook_type),
      pricebook_type: asStr(pricebook.pricebook_type),
      source_updated_at: asDate(pricebook.last_modified_time ?? pricebook.updated_time ?? pricebook.updated_at),
      created_by: actorId,
      updated_by: actorId,
      deleted_at: null,
    });
  }

  const dedupedPriceListRows = dedupeByExternalRef(priceListRows);
  const persistedPriceLists = dedupedPriceListRows.length > 0
    ? await bulkPersistJsonbRecords(admin, 'price_lists', dedupedPriceListRows, ['tenant_id', 'external_ref'])
    : [];
  const sourcePricebookByRef = new Map(
    salesPricebooks
      .map((pb) => {
        const id = asStr(pb.pricebook_id) ?? asStr(pb.pricelist_id);
        return id ? ([id, pb] as const) : null;
      })
      .filter((x): x is [string, Record<string, unknown>] => x !== null),
  );
  const priceListMapPairs = mapPersistedRowsByExternalRef(persistedPriceLists).map((p) => ({
    ...p,
    sourcePayload: sourcePricebookByRef.get(p.externalId) ?? null,
  }));
  const priceListIdByExternalRef = new Map(priceListMapPairs.map((row) => [row.externalId, row.internalId] as const));

  result.updated += priceListMapPairs.length;
  await batchUpsertEntityMap(admin, tenantId, integrationId, 'pricelists', priceListMapPairs);

  // Enrich pricebooks with per-book detail (list endpoint omits pricebook_items).
  // Sequential with 300ms inter-call delay to avoid Zoho rate limits (was: 5-concurrent).
  const detailedPricebooks = new Map<string, Record<string, unknown>>();
  if (adapter?.fetchPricebookDetail) {
    for (const pb of salesPricebooks) {
      const id = asStr(pb.pricebook_id) ?? asStr(pb.pricelist_id);
      if (!id) continue;
      const detail = await adapter.fetchPricebookDetail(id);
      if (detail) detailedPricebooks.set(id, detail);
      await new Promise<void>((r) => setTimeout(r, 300));
    }
  }

  const productExternalIds = [
    ...new Set(
      salesPricebooks.flatMap((pricebook) => {
        const id = asStr(pricebook.pricebook_id) ?? asStr(pricebook.pricelist_id);
        const effective = (id ? detailedPricebooks.get(id) : null) ?? pricebook;
        return getPricebookItemRows(effective)
          .map((item) => pickString(item.item_id, item.product_id, item.item_external_id))
          .filter((value): value is string => value !== null);
      }),
    ),
  ];

  const tenantProductIdMap = productExternalIds.length > 0
    ? await resolveInternalIdsWithFallback(
        admin, tenantId, integrationId, 'products', 'tenant_products', productExternalIds,
      )
    : new Map<string, string>();

  // FK-failsafe: fetch missing products from Zoho when adapter is present (webhook path)
  if (adapter) {
    const zohoTypeId = adapter.integrationTypeId;
    for (const extId of productExternalIds) {
      if (!tenantProductIdMap.has(extId)) {
        const internalId = await ensureProductExists(admin, tenantId, actorId, integrationId, zohoTypeId, extId, adapter);
        if (internalId) tenantProductIdMap.set(extId, internalId);
      }
    }
  }

  const priceListItemRows: Record<string, unknown>[] = [];
  const desiredExternalRefsByPriceListId = new Map<string, Set<string>>();
  // Collect errors per row instead of throwing — entity-level isolation keeps partial data intact
  const skippedItems: Array<{ pricebook_id: string; item_id: string | null; reason: string }> = [];

  for (const pricebook of salesPricebooks) {
    const externalRef = asStr(pricebook.pricebook_id) ?? asStr(pricebook.pricelist_id);
    if (!externalRef) continue;
    const priceListId = priceListIdByExternalRef.get(externalRef) ?? null;
    if (!priceListId) {
      // Pricebook itself couldn't be persisted — skip all its items
      skippedItems.push({ pricebook_id: externalRef, item_id: null, reason: `price_list row not found for ${externalRef}` });
      continue;
    }

    const effectivePricebook = detailedPricebooks.get(externalRef) ?? pricebook;
    for (const item of getPricebookItemRows(effectivePricebook)) {
      const sourceProductId = pickString(item.item_id, item.product_id, item.item_external_id);
      const tenantProductId = sourceProductId ? tenantProductIdMap.get(sourceProductId) ?? null : null;
      if (!tenantProductId) {
        // Product FK not found — skip this item row, continue with next
        skippedItems.push({
          pricebook_id: externalRef,
          item_id: sourceProductId ?? null,
          reason: `product ${sourceProductId ?? 'unknown'} not yet synced`,
        });
        continue;
      }

      const minQty = pickNumber(item.min_quantity, item.min_qty, item.from_quantity) ?? 1;
      const itemExternalRef = `${externalRef}:${sourceProductId}:${minQty}`;
      if (!desiredExternalRefsByPriceListId.has(priceListId)) {
        desiredExternalRefsByPriceListId.set(priceListId, new Set());
      }
      desiredExternalRefsByPriceListId.get(priceListId)?.add(itemExternalRef);

      priceListItemRows.push({
        price_list_id: priceListId,
        tenant_product_id: tenantProductId,
        price: pickNumber(item.price, item.rate, item.pricebook_rate, item.selling_price) ?? 0,
        min_qty: minQty,
        max_qty: pickNumber(item.max_quantity, item.max_qty, item.to_quantity),
        external_ref: itemExternalRef,
        source_updated_at: asDate(item.last_modified_time ?? item.updated_time ?? effectivePricebook.last_modified_time),
        created_by: actorId,
        updated_by: actorId,
        deleted_at: null,
      });
    }
  }

  if (skippedItems.length > 0) {
    console.warn('[persistPricelists] skipped items:', JSON.stringify(skippedItems.slice(0, 10)));
    // Persist skipped rows to entity map so they appear in the frontend entity-error section
    const errorPairs = skippedItems.map((s) => ({
      externalId: s.item_id ? `${s.pricebook_id}:${s.item_id}` : s.pricebook_id,
      internalId: '',
    }));
    await batchUpsertEntityMap(admin, tenantId, integrationId, 'price_list_items', errorPairs, {
      syncStatus: 'error',
      errorReason: skippedItems[0]?.reason ?? 'FK resolution failed',
    }).catch((e) => console.warn('[persistPricelists] entity map error write failed:', e));
  }

  const dedupedPriceListItemRows = dedupeByColumns(
    priceListItemRows,
    ['price_list_id', 'tenant_product_id', 'min_qty'],
  );

  if (dedupedPriceListItemRows.length > 0) {
    await bulkPersistJsonbRecords(
      admin,
      'price_list_items',
      dedupedPriceListItemRows,
      ['price_list_id', 'tenant_product_id', 'min_qty'],
    );
  }

  const importedPriceListIds = priceListMapPairs.map((row) => row.internalId);
  if (importedPriceListIds.length > 0) {
    const { data: existingItems } = await admin
      .schema('app')
      .from('price_list_items')
      .select('id, price_list_id, external_ref')
      .in('price_list_id', importedPriceListIds)
      .is('deleted_at', null);

    const staleItemIds = (existingItems ?? [])
      .filter((row: { id: string; price_list_id: string; external_ref: string | null }) => {
        if (!row.external_ref) return false;
        const desired = desiredExternalRefsByPriceListId.get(row.price_list_id);
        return !desired?.has(row.external_ref);
      })
      .map((row: { id: string }) => row.id);

    if (staleItemIds.length > 0) {
      await admin
        .schema('app')
        .from('price_list_items')
        .update({
          deleted_at: nowIso(),
          updated_at: nowIso(),
          updated_by: actorId,
        })
        .in('id', staleItemIds)
        .is('deleted_at', null);
    }
  }

  return result;
}

// ── Estimates ────────────────────────────────────────────────────────────────

async function persistEstimates(
  admin: AdminClient,
  tenantId: string,
  actorId: string | null,
  integrationId: string,
  records: Record<string, unknown>[],
  adapter?: ZohoAdapter,
  zohoTypeId?: ZohoIntegrationTypeId,
): Promise<PersistResult> {
  const result: PersistResult = { created: 0, updated: 0, skipped: 0, pendingSearchVectorBuyerIds: [], pendingSearchVectorBuyerUserIds: [] };
  const estimateFieldMappings = await loadFieldMappings(admin, integrationId, 'estimates');

  const customerExternalIds = records
    .map((r) => asStr(r.customer_id))
    .filter((x): x is string => x !== null);
  const buyerIdMap = await resolveInternalIdsWithFallback(
    admin, tenantId, integrationId, 'customers', 'buyers', customerExternalIds,
  );
  // FK-failsafe: fetch missing buyers from Zoho when adapter is present
  if (adapter && zohoTypeId) {
    for (const extId of customerExternalIds) {
      if (!buyerIdMap.has(extId)) {
        const internalId = await ensureBuyerExists(admin, tenantId, actorId, integrationId, zohoTypeId, extId, adapter);
        if (internalId) buyerIdMap.set(extId, internalId);
      }
    }
  }
  const locationExternalIds = [...new Set(
    records
      .map((r) => pickString(r.location_id, r.warehouse_id))
      .filter((x): x is string => x !== null),
  )];
  const locationIdMap = await resolveInternalIdsWithFallback(
    admin, tenantId, integrationId, 'locations', 'locations', locationExternalIds,
  );
  // FK-failsafe: fetch missing locations from Zoho when adapter is present
  if (adapter && zohoTypeId) {
    for (const extId of locationExternalIds) {
      if (!locationIdMap.has(extId)) {
        const internalId = await ensureLocationExists(admin, tenantId, actorId, integrationId, zohoTypeId, extId, adapter);
        if (internalId) locationIdMap.set(extId, internalId);
      }
    }
  }
  const parentRows: Record<string, unknown>[] = [];
  const parentRecords: Array<{ estimateId: string; sourcePayload: Record<string, unknown>; lineItems: Record<string, unknown>[]; resolvedActorId: string | null }> = [];

  for (const rec of records) {
    const externalId = asStr(rec.estimate_id);
    if (!externalId) { result.skipped++; continue; }

    const customerId = asStr(rec.customer_id);
    const buyerId = customerId ? (buyerIdMap.get(customerId) ?? null) : null;
    const locationExternalId = pickString(rec.location_id, rec.warehouse_id);
    const locationId = locationExternalId ? (locationIdMap.get(locationExternalId) ?? null) : null;
    const lineItems = Array.isArray(rec.line_items) ? rec.line_items as Record<string, unknown>[] : [];
    const salespersonId = asStr(rec.salesperson_id);
    const resolvedActorId = resolveImportedActorId(actorId, salespersonId);
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
        lineTotal: resolveLineTotal(li, 0),
        taxPct: pickNumber(li.tax_percentage, li.tax_rate),
        discPct: pickNumber(li.discount_percentage, li.disc_pct),
        schemeTag: pickString(li.scheme_tag, li.discount_type),
      })),
    }));

    const customFields = buildCustomFieldsJson(rec);

    parentRows.push({
      tenant_id: tenantId,
      external_ref: externalId,
      buyer_id: buyerId,
      estimate_number: asStr(rec.estimate_number),
      status: asStr(rec.status) ?? 'draft',
      location_id: locationId,
      custom_fields: customFields,
      ...applyFieldMappings(customFields, estimateFieldMappings),
      currency: asStr(rec.currency) ?? asStr(rec.currency_code) ?? 'INR',
      subtotal: pickNumber(rec.sub_total, rec.subtotal),
      tax_amount: pickNumber(rec.tax_total, rec.tax_amount),
      total_amount: pickNumber(rec.total, rec.total_amount),
      notes: pickString(rec.notes, rec.terms, rec.description),
      seller_note: pickString(rec.seller_note, rec.note),
      place_of_supply: pickString(rec.place_of_supply, rec.state, rec.billing_state, rec.shipping_state) ?? 'Unknown',
      cart_hash: cartHash,
      buyer_po_ref: pickString(rec.reference_number, rec.buyer_po_ref),
      discount_flat: pickNumber(rec.discount_flat, rec.discount) ?? 0,
      freight: pickNumber(rec.freight, rec.shipping_charge) ?? 0,
      round_off: pickNumber(rec.round_off) ?? 0,
      valid_until: asDateOnly(rec.expiry_date),
      estimate_date: asDateOnly(rec.date_issued ?? rec.date ?? rec.created_time),
      expires_at: asDate(rec.expiry_date),
      sent_at: asDate(rec.sent_at ?? rec.date),
      created_at: asDate(rec.created_time ?? rec.date),
      updated_at: asDate(rec.last_modified_time ?? rec.updated_time ?? rec.created_time),
      source: 'zoho_import',
      deleted_at: null,
      created_by: resolvedActorId,
      updated_by: resolvedActorId,
    });

    parentRecords.push({
      estimateId: externalId,
      sourcePayload: buildTransactionalSourcePayload(rec),
      lineItems: Array.isArray(rec.line_items) ? rec.line_items as Record<string, unknown>[] : [],
      resolvedActorId,
    });
  }

  const guardedEstimateRows = await applyImmediateEchoGuards(
    admin, tenantId, integrationId, 'estimates', 'estimates', parentRows,
  );
  const estimateResolution = await resolveRowsByExternalRefOrNaturalKey(admin, {
    table: 'estimates',
    tenantId,
    rows: guardedEstimateRows,
    naturalKeyColumns: ['estimate_number'],
  });
  if (estimateResolution.conflicts.length > 0) {
    console.warn('[persistEstimates] estimate collision conflicts:', estimateResolution.conflicts);
    result.skipped += estimateResolution.conflicts.length;
  }
  const persistedEstimates = estimateResolution.rows.length > 0
    ? await bulkPersistJsonbRecords(admin, 'estimates', estimateResolution.rows, ['id'])
    : [];
  const sourcePayloadByExternalRef = new Map(
    parentRecords.map((e) => [e.estimateId, e.sourcePayload] as const),
  );
  const estimateMapPairs = buildPersistedRowPairsFromSourceRows(parentRows, persistedEstimates, ['estimate_number']).map((p) => ({
    ...p,
    sourcePayload: sourcePayloadByExternalRef.get(p.externalId) ?? null,
  }));
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
  // FK-failsafe: fetch missing products from Zoho when adapter is present
  if (adapter && zohoTypeId) {
    for (const extId of productExtIds) {
      if (!productIdMap.has(extId)) {
        const internalId = await ensureProductExists(admin, tenantId, actorId, integrationId, zohoTypeId, extId, adapter);
        if (internalId) productIdMap.set(extId, internalId);
      }
    }
  }

  const lineItemRows: Record<string, unknown>[] = [];
  let estimateItemSyncError: IntegrationSyncError | null = null;
  for (const entry of parentRecords) {
    const estimateId = estimateIdMap.get(entry.estimateId) ?? null;
    if (!estimateId) {
      estimateItemSyncError = new IntegrationSyncError(
        'estimates',
        `Unable to resolve imported estimate ${entry.estimateId}.`,
        entry.estimateId,
        { estimate_id: entry.estimateId },
      );
      break;
    }

    for (const [lineIndex, li] of entry.lineItems.entries()) {
      const extProdId = asStr(li.item_id);
      const productId = extProdId ? (productIdMap.get(extProdId) ?? null) : null;
      if (!productId) {
        estimateItemSyncError = new IntegrationSyncError(
          'estimate_items',
          `Unable to resolve product ${extProdId ?? 'unknown'} for estimate ${entry.estimateId}.`,
          entry.estimateId,
          {
            estimate_id: entry.estimateId,
            item_id: extProdId,
            line_index: lineIndex,
          },
        );
        break;
      }

      const taxRate = pickNumber(li.tax_percentage, li.tax_rate);
      const discountPct = pickNumber(li.discount_percentage, li.disc_pct) ?? 0;
      const externalRef = await buildChildExternalRef(entry.estimateId, li, lineIndex);
      const lineOrder = resolveLineOrder(li, lineIndex);
      const parentCreatedAt = asDate(entry.sourcePayload.created_time ?? entry.sourcePayload.created_at);

      lineItemRows.push({
        estimate_id: estimateId,
        tenant_product_id: productId,
        external_ref: externalRef,
        item_order: lineOrder,
        qty: pickNumber(li.quantity, li.qty) ?? 1,
        unit_price: pickNumber(li.rate, li.unit_price, li.price) ?? 0,
        line_total: resolveLineTotal(li, lineIndex),
        tax_rate: taxRate,
        tax_pct: taxRate,
        disc_pct: discountPct,
        discount_pct: discountPct,
        scheme_tag: pickString(li.scheme_tag, li.discount_type),
        sku: pickString(li.sku, li.item_sku, li.item_code, li.code),
        hsn_code: pickString(li.hsn_code, li.hsn_or_sac, li.hsn_sac),
        deleted_at: null,
        created_at: asDate(li.created_time ?? li.created_at) ?? parentCreatedAt ?? nowIso(),
        updated_at: asDate(li.last_modified_time ?? li.updated_at ?? li.created_time) ?? parentCreatedAt ?? nowIso(),
        created_by: entry.resolvedActorId,
        updated_by: entry.resolvedActorId,
      });
    }

    if (estimateItemSyncError) break;
  }

  if (estimateItemSyncError) {
    const errorReason = formatErrorReason(estimateItemSyncError.message, estimateItemSyncError.details);
    await batchUpsertEntityMap(admin, tenantId, integrationId, 'estimates', estimateMapPairs, {
      syncStatus: 'error',
      errorReason,
    });
    throw estimateItemSyncError;
  }

  await persistDerivedChildRows(admin, 'estimate_items', 'estimate_id', estimateIds, lineItemRows);

  return result;
}

// ── Orders ───────────────────────────────────────────────────────────────────

async function persistOrders(
  admin: AdminClient,
  tenantId: string,
  actorId: string | null,
  integrationId: string,
  records: Record<string, unknown>[],
  adapter?: ZohoAdapter,
  zohoTypeId?: ZohoIntegrationTypeId,
): Promise<PersistResult> {
  const result: PersistResult = { created: 0, updated: 0, skipped: 0, pendingSearchVectorBuyerIds: [], pendingSearchVectorBuyerUserIds: [] };

  const customerExternalIds = records
    .map((r) => asStr(r.customer_id))
    .filter((x): x is string => x !== null);
  const buyerIdMap = await resolveInternalIdsWithFallback(
    admin, tenantId, integrationId, 'customers', 'buyers', customerExternalIds,
  );
  // FK-failsafe: fetch missing buyers from Zoho when adapter is present
  if (adapter && zohoTypeId) {
    for (const extId of customerExternalIds) {
      if (!buyerIdMap.has(extId)) {
        const internalId = await ensureBuyerExists(admin, tenantId, actorId, integrationId, zohoTypeId, extId, adapter);
        if (internalId) buyerIdMap.set(extId, internalId);
      }
    }
  }
  const locationExternalIds = [...new Set(
    records
      .map((r) => pickString(r.location_id, r.warehouse_id))
      .filter((x): x is string => x !== null),
  )];
  const locationIdMap = await resolveInternalIdsWithFallback(
    admin, tenantId, integrationId, 'locations', 'locations', locationExternalIds,
  );
  // FK-failsafe: fetch missing locations from Zoho when adapter is present
  if (adapter && zohoTypeId) {
    for (const extId of locationExternalIds) {
      if (!locationIdMap.has(extId)) {
        const internalId = await ensureLocationExists(admin, tenantId, actorId, integrationId, zohoTypeId, extId, adapter);
        if (internalId) locationIdMap.set(extId, internalId);
      }
    }
  }
  const parentRows: Record<string, unknown>[] = [];
  const parentRecords: Array<{ orderExternalId: string; sourcePayload: Record<string, unknown>; lineItems: Record<string, unknown>[]; resolvedActorId: string | null }> = [];

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
    const salespersonId = asStr(rec.salesperson_id);
    const resolvedActorId = resolveImportedActorId(actorId, salespersonId);

    parentRows.push({
      tenant_id: tenantId,
      external_ref: externalId,
      buyer_id: buyerId,
      placed_by: resolvedActorId,
      order_number: asStr(rec.salesorder_number) ?? externalId,
      status: asStr(rec.status) ?? 'open',
      source: 'zoho_import',
      location_id: locationId,
      estimate_id: asStr(rec.estimate_id)
        ? (await resolveInternalIdWithFallback(admin, tenantId, integrationId, 'estimates', 'estimates', asStr(rec.estimate_id) ?? ''))
        : null,
      subtotal: pickNumber(rec.sub_total, rec.subtotal),
      tax_amount: pickNumber(rec.tax_total, rec.tax_amount),
      total_amount: pickNumber(rec.total, rec.total_amount),
      delivery_address: deliveryAddress as Record<string, unknown> | null,
      place_of_supply: pickString(rec.place_of_supply, rec.state, rec.billing_state, rec.shipping_state) ?? 'Unknown',
      notes: pickString(rec.notes, rec.seller_note, rec.description),
      seller_note: pickString(rec.seller_note, rec.note),
      buyer_po_ref: pickString(rec.reference_number, rec.buyer_po_ref),
      discount_flat: pickNumber(rec.discount_flat, rec.discount) ?? 0,
      freight: pickNumber(rec.freight, rec.shipping_charge) ?? 0,
      round_off: pickNumber(rec.round_off) ?? 0,
      has_backorder: asBool(rec.has_backorder ?? rec.backorder, false),
      expected_delivery: asDateOnly(rec.expected_delivery),
      order_date: asDateOnly(rec.date ?? rec.created_time),
      placed_at: asDate(rec.date ?? rec.created_time),
      received_at: asDate(rec.received_at),
      confirmed_at: asDate(rec.confirmed_at),
      dispatched_at: asDate(rec.dispatched_at),
      delivered_at: asDate(rec.delivered_at),
      cancelled_at: asDate(rec.cancelled_at),
      created_at: asDate(rec.created_time ?? rec.date),
      updated_at: asDate(rec.last_modified_time ?? rec.updated_time ?? rec.created_time),
      deleted_at: null,
      created_by: resolvedActorId,
      updated_by: resolvedActorId,
    });

    parentRecords.push({
      orderExternalId: externalId,
      sourcePayload: buildTransactionalSourcePayload(rec),
      lineItems,
      resolvedActorId,
    });
  }

  const guardedOrderRows = await applyImmediateEchoGuards(
    admin, tenantId, integrationId, 'orders', 'orders', parentRows,
  );
  const orderResolution = await resolveRowsByExternalRefOrNaturalKey(admin, {
    table: 'orders',
    tenantId,
    rows: guardedOrderRows,
    naturalKeyColumns: ['order_number'],
  });
  if (orderResolution.conflicts.length > 0) {
    console.warn('[persistOrders] order collision conflicts:', orderResolution.conflicts);
    result.skipped += orderResolution.conflicts.length;
  }
  const persistedOrders = orderResolution.rows.length > 0
    ? await bulkPersistJsonbRecords(admin, 'orders', orderResolution.rows, ['id'])
    : [];
  const sourcePayloadByOrderRef = new Map(
    parentRecords.map((e) => [e.orderExternalId, e.sourcePayload] as const),
  );
  const orderMapPairs = buildPersistedRowPairsFromSourceRows(parentRows, persistedOrders, ['order_number']).map((p) => ({
    ...p,
    sourcePayload: sourcePayloadByOrderRef.get(p.externalId) ?? null,
  }));
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
  // FK-failsafe: fetch missing products from Zoho when adapter is present
  if (adapter && zohoTypeId) {
    for (const extId of productExtIds) {
      if (!productIdMap.has(extId)) {
        const internalId = await ensureProductExists(admin, tenantId, actorId, integrationId, zohoTypeId, extId, adapter);
        if (internalId) productIdMap.set(extId, internalId);
      }
    }
  }

  const lineItemRows: Record<string, unknown>[] = [];
  let orderItemSyncError: IntegrationSyncError | null = null;
  for (const entry of parentRecords) {
    const orderId = orderIdMap.get(entry.orderExternalId) ?? null;
    if (!orderId) {
      orderItemSyncError = new IntegrationSyncError(
        'orders',
        `Unable to resolve imported order ${entry.orderExternalId}.`,
        entry.orderExternalId,
        { order_id: entry.orderExternalId },
      );
      break;
    }

    for (const [lineIndex, li] of entry.lineItems.entries()) {
      const extProdId = asStr(li.item_id);
      const productId = extProdId ? (productIdMap.get(extProdId) ?? null) : null;
      if (!productId) {
        orderItemSyncError = new IntegrationSyncError(
          'order_items',
          `Unable to resolve product ${extProdId ?? 'unknown'} for order ${entry.orderExternalId}.`,
          entry.orderExternalId,
          {
            order_id: entry.orderExternalId,
            item_id: extProdId,
            line_index: lineIndex,
          },
        );
        break;
      }

      const taxRate = pickNumber(li.tax_percentage, li.tax_rate);
      const discountPct = pickNumber(li.discount_percentage, li.disc_pct) ?? 0;
      const externalRef = await buildChildExternalRef(entry.orderExternalId, li, lineIndex);
      const lineOrder = resolveLineOrder(li, lineIndex);
      const parentCreatedAt = asDate(entry.sourcePayload.created_time ?? entry.sourcePayload.created_at);

      lineItemRows.push({
        order_id: orderId,
        tenant_product_id: productId,
        external_ref: externalRef,
        item_order: lineOrder,
        qty: pickNumber(li.quantity, li.qty) ?? 1,
        unit_price: pickNumber(li.rate, li.unit_price, li.price) ?? 0,
        line_total: resolveLineTotal(li, lineIndex),
        tax_rate: taxRate,
        tax_pct: taxRate,
        disc_pct: discountPct,
        discount_pct: discountPct,
        scheme_tag: pickString(li.scheme_tag, li.discount_type),
        on_hand_at_confirm: pickNumber(li.on_hand_at_confirm, li.on_hand, li.available_stock),
        sku: pickString(li.sku, li.item_sku, li.item_code, li.code),
        hsn_code: pickString(li.hsn_code, li.hsn_or_sac, li.hsn_sac),
        deleted_at: null,
        created_at: asDate(li.created_time ?? li.created_at) ?? parentCreatedAt ?? nowIso(),
        updated_at: asDate(li.last_modified_time ?? li.updated_at ?? li.created_time) ?? parentCreatedAt ?? nowIso(),
        created_by: entry.resolvedActorId,
        updated_by: entry.resolvedActorId,
      });
    }

    if (orderItemSyncError) break;
  }

  if (orderItemSyncError) {
    const errorReason = formatErrorReason(orderItemSyncError.message, orderItemSyncError.details);
    await batchUpsertEntityMap(admin, tenantId, integrationId, 'orders', orderMapPairs, {
      syncStatus: 'error',
      errorReason,
    });
    throw orderItemSyncError;
  }

  await persistDerivedChildRows(admin, 'order_items', 'order_id', orderIds, lineItemRows);

  return result;
}

// ── Invoices ─────────────────────────────────────────────────────────────────

async function persistInvoices(
  admin: AdminClient,
  tenantId: string,
  actorId: string | null,
  integrationId: string,
  records: Record<string, unknown>[],
  adapter?: ZohoAdapter,
  zohoTypeId?: ZohoIntegrationTypeId,
): Promise<PersistResult> {
  const result: PersistResult = { created: 0, updated: 0, skipped: 0, pendingSearchVectorBuyerIds: [], pendingSearchVectorBuyerUserIds: [] };
  const invoiceFieldMappings = await loadFieldMappings(admin, integrationId, 'invoices');

  const customerExternalIds = records
    .map((r) => asStr(r.customer_id))
    .filter((x): x is string => x !== null);
  const buyerIdMap = await resolveInternalIdsWithFallback(
    admin, tenantId, integrationId, 'customers', 'buyers', customerExternalIds,
  );
  // FK-failsafe: fetch missing buyers from Zoho when adapter is present
  if (adapter && zohoTypeId) {
    for (const extId of customerExternalIds) {
      if (!buyerIdMap.has(extId)) {
        const internalId = await ensureBuyerExists(admin, tenantId, actorId, integrationId, zohoTypeId, extId, adapter);
        if (internalId) buyerIdMap.set(extId, internalId);
      }
    }
  }
  const locationExternalIds = [...new Set(
    records
      .map((r) => pickString(r.location_id, r.warehouse_id))
      .filter((x): x is string => x !== null),
  )];
  const locationIdMap = await resolveInternalIdsWithFallback(
    admin, tenantId, integrationId, 'locations', 'locations', locationExternalIds,
  );
  // FK-failsafe: fetch missing locations from Zoho when adapter is present
  if (adapter && zohoTypeId) {
    for (const extId of locationExternalIds) {
      if (!locationIdMap.has(extId)) {
        const internalId = await ensureLocationExists(admin, tenantId, actorId, integrationId, zohoTypeId, extId, adapter);
        if (internalId) locationIdMap.set(extId, internalId);
      }
    }
  }
  const orderExternalIds = [...new Set(
    records
      .map((r) => pickString(r.salesorder_id, r.order_id))
      .filter((x): x is string => x !== null),
  )];
  const orderIdMap = await resolveInternalIdsWithFallback(
    admin, tenantId, integrationId, 'orders', 'orders', orderExternalIds,
  );
  const estimateExternalIds = [...new Set(
    records
      .map((r) => asStr(r.estimate_id))
      .filter((x): x is string => x !== null),
  )];
  const estimateIdMap = estimateExternalIds.length > 0
    ? await resolveInternalIdsWithFallback(
        admin, tenantId, integrationId, 'estimates', 'estimates', estimateExternalIds,
      )
    : new Map<string, string>();
  const parentRows: Record<string, unknown>[] = [];
  const parentRecords: Array<{ invoiceExternalId: string; sourcePayload: Record<string, unknown>; lineItems: Record<string, unknown>[]; resolvedActorId: string | null }> = [];

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
    const estimateExternalId = asStr(rec.estimate_id);
    const estimateId = estimateExternalId ? (estimateIdMap.get(estimateExternalId) ?? null) : null;

    const shippingAddr = rec.shipping_address;
    const deliveryAddress = shippingAddr && typeof shippingAddr === 'object'
      ? shippingAddr
      : null;
    const lineItems = Array.isArray(rec.line_items) ? rec.line_items as Record<string, unknown>[] : [];
    const salespersonId = asStr(rec.salesperson_id);
    const resolvedActorId = resolveImportedActorId(actorId, salespersonId);

    const total = asNum(rec.total) ?? 0;
    const balance = asNum(rec.balance) ?? 0;
    const amountPaid = asNum(rec.payment_made) ?? (total - balance);
    const customFields = buildCustomFieldsJson(rec);

    parentRows.push({
      tenant_id: tenantId,
      external_ref: externalId,
      buyer_id: buyerId,
      location_id: locationId,
      order_id: orderId,
      custom_fields: customFields,
      ...applyFieldMappings(customFields, invoiceFieldMappings),
      invoice_number: asStr(rec.invoice_number) ?? externalId,
      invoice_date: invoiceDate,
      status: asStr(rec.status) ?? 'sent',
      subtotal: pickNumber(rec.sub_total, rec.subtotal),
      tax_amount: pickNumber(rec.tax_total, rec.tax_amount),
      total_amount: total,
      outstanding_balance: balance,
      amount_paid: amountPaid,
      delivery_address: deliveryAddress as Record<string, unknown> | null,
      place_of_supply: pickString(rec.place_of_supply, rec.state, rec.billing_state, rec.shipping_state) ?? 'Unknown',
      notes: pickString(rec.notes, rec.seller_note),
      notes_for_buyer: pickString(rec.notes_for_buyer, rec.notes),
      seller_note: pickString(rec.seller_note),
      buyer_po_ref: pickString(rec.reference_number, rec.buyer_po_ref),
      discount_flat: pickNumber(rec.discount_flat, rec.discount) ?? 0,
      freight: pickNumber(rec.freight, rec.shipping_charge) ?? 0,
      round_off: pickNumber(rec.round_off) ?? 0,
      estimate_id: estimateId,
      due_date: asDateOnly(rec.due_date),
      paid_at: asDate(rec.payment_date ?? rec.paid_at),
      payment_reference: pickString(rec.payment_reference, rec.reference_number),
      sent_at: asDate(rec.sent_at ?? rec.date),
      sent_channel: pickString(rec.sent_channel, rec.channel),
      created_at: asDate(rec.created_time ?? rec.date),
      updated_at: asDate(rec.last_modified_time ?? rec.updated_time ?? rec.created_time),
      deleted_at: null,
      created_by: resolvedActorId,
      updated_by: resolvedActorId,
    });

    parentRecords.push({
      invoiceExternalId: externalId,
      sourcePayload: buildTransactionalSourcePayload(rec),
      lineItems,
      resolvedActorId,
    });
  }

  const guardedInvoiceRows = await applyImmediateEchoGuards(
    admin, tenantId, integrationId, 'invoices', 'invoices', parentRows,
  );
  const invoiceResolution = await resolveRowsByExternalRefOrNaturalKey(admin, {
    table: 'invoices',
    tenantId,
    rows: guardedInvoiceRows,
    naturalKeyColumns: ['invoice_number'],
  });
  if (invoiceResolution.conflicts.length > 0) {
    console.warn('[persistInvoices] invoice collision conflicts:', invoiceResolution.conflicts);
    result.skipped += invoiceResolution.conflicts.length;
  }
  const persistedInvoices = invoiceResolution.rows.length > 0
    ? await bulkPersistJsonbRecords(admin, 'invoices', invoiceResolution.rows, ['id'])
    : [];
  const sourcePayloadByInvoiceRef = new Map(
    parentRecords.map((e) => [e.invoiceExternalId, e.sourcePayload] as const),
  );
  const invoiceMapPairs = buildPersistedRowPairsFromSourceRows(parentRows, persistedInvoices, ['invoice_number']).map((p) => ({
    ...p,
    sourcePayload: sourcePayloadByInvoiceRef.get(p.externalId) ?? null,
  }));
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
  // FK-failsafe: fetch missing products from Zoho when adapter is present
  if (adapter && zohoTypeId) {
    for (const extId of productExtIds) {
      if (!productIdMap.has(extId)) {
        const internalId = await ensureProductExists(admin, tenantId, actorId, integrationId, zohoTypeId, extId, adapter);
        if (internalId) productIdMap.set(extId, internalId);
      }
    }
  }

  const lineItemRows: Record<string, unknown>[] = [];
  let invoiceItemSyncError: IntegrationSyncError | null = null;
  for (const entry of parentRecords) {
    const invoiceId = invoiceIdMap.get(entry.invoiceExternalId) ?? null;
    if (!invoiceId) {
      invoiceItemSyncError = new IntegrationSyncError(
        'invoices',
        `Unable to resolve imported invoice ${entry.invoiceExternalId}.`,
        entry.invoiceExternalId,
        { invoice_id: entry.invoiceExternalId },
      );
      break;
    }

    for (const [lineIndex, li] of entry.lineItems.entries()) {
      const extProdId = asStr(li.item_id);
      const productId = extProdId ? (productIdMap.get(extProdId) ?? null) : null;
      if (!productId) {
        invoiceItemSyncError = new IntegrationSyncError(
          'invoice_items',
          `Unable to resolve product ${extProdId ?? 'unknown'} for invoice ${entry.invoiceExternalId}.`,
          entry.invoiceExternalId,
          {
            invoice_id: entry.invoiceExternalId,
            item_id: extProdId,
            line_index: lineIndex,
          },
        );
        break;
      }

      const taxRate = pickNumber(li.tax_percentage, li.tax_rate);
      const discountPct = pickNumber(li.discount_percentage, li.disc_pct) ?? 0;
      const externalRef = await buildChildExternalRef(entry.invoiceExternalId, li, lineIndex);
      const lineOrder = resolveLineOrder(li, lineIndex);
      const parentCreatedAt = asDate(entry.sourcePayload.created_time ?? entry.sourcePayload.created_at);

      lineItemRows.push({
        invoice_id: invoiceId,
        tenant_product_id: productId,
        external_ref: externalRef,
        item_order: lineOrder,
        qty: pickNumber(li.quantity, li.qty) ?? 1,
        unit_price: pickNumber(li.rate, li.unit_price, li.price) ?? 0,
        line_total: resolveLineTotal(li, lineIndex),
        tax_rate: taxRate,
        tax_pct: taxRate,
        disc_pct: discountPct,
        discount_pct: discountPct,
        sku: pickString(li.sku, li.item_sku, li.item_code, li.code),
        hsn_code: pickString(li.hsn_code, li.hsn_or_sac, li.hsn_sac),
        scheme_tag: pickString(li.scheme_tag, li.discount_type),
        deleted_at: null,
        created_at: asDate(li.created_time ?? li.created_at) ?? parentCreatedAt ?? nowIso(),
        updated_at: asDate(li.last_modified_time ?? li.updated_at ?? li.created_time) ?? parentCreatedAt ?? nowIso(),
        created_by: entry.resolvedActorId,
        updated_by: entry.resolvedActorId,
      });
    }

    if (invoiceItemSyncError) break;
  }

  if (invoiceItemSyncError) {
    const errorReason = formatErrorReason(invoiceItemSyncError.message, invoiceItemSyncError.details);
    await batchUpsertEntityMap(admin, tenantId, integrationId, 'invoices', invoiceMapPairs, {
      syncStatus: 'error',
      errorReason,
    });
    throw invoiceItemSyncError;
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
      return persistLocations(admin, tenantId, actorId, integrationId, integrationTypeId, records, adapter);

    case 'warehouses':
      return persistWarehouses(admin, tenantId, actorId, integrationId, records);

    case 'customers':
      return persistBuyers(admin, tenantId, actorId, integrationId, records, adapter, integrationTypeId);

    case 'products':
      return persistProducts(admin, tenantId, actorId, integrationId, records, adapter);

    case 'pricelists':
      return persistPricelists(admin, tenantId, actorId, integrationId, records, adapter);

    case 'estimates':
      return persistEstimates(admin, tenantId, actorId, integrationId, records, adapter, integrationTypeId);

    case 'orders':
      return persistOrders(admin, tenantId, actorId, integrationId, records, adapter, integrationTypeId);

    case 'invoices':
      return persistInvoices(admin, tenantId, actorId, integrationId, records, adapter, integrationTypeId);

    default:
      return { created: 0, updated: 0, skipped: records.length, pendingSearchVectorBuyerIds: [], pendingSearchVectorBuyerUserIds: [] };
  }
}
