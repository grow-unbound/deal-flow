type AdminClient = {
  schema: (schema: string) => {
    from: (table: string) => unknown;
  };
};

type QueryResult<T> = { data: T | null; error: { message: string } | null };

type AnalyticsEntityType = 'customers' | 'estimates' | 'orders' | 'invoices';
type AnalyticsStatus = 'pending' | 'sent' | 'failed' | 'skipped';

type AnalyticsEventRow = {
  id: string;
  tenant_id: string;
  tenant_integration_id: string;
  provider: string;
  entity_type: AnalyticsEntityType;
  external_id: string;
  internal_id: string;
  event_key: string;
  event_name: string;
  emit_status: AnalyticsStatus;
  attempt_count: number;
};

export type ZohoAnalyticsCandidate = {
  entityType: AnalyticsEntityType;
  externalId: string;
  internalId: string;
  eventName: string;
};

function getEnv(name: string): string | null {
  const denoEnv = (globalThis as unknown as { Deno?: { env?: { get?: (key: string) => string | undefined } } }).Deno?.env;
  const denoValue = denoEnv?.get?.(name);
  if (denoValue) return denoValue;

  const processEnv = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return processEnv?.[name] ?? null;
}

function tableForEntity(entityType: AnalyticsEntityType): string {
  switch (entityType) {
    case 'customers':
      return 'buyers';
    case 'estimates':
      return 'estimates';
    case 'orders':
      return 'orders';
    case 'invoices':
      return 'invoices';
  }
}

function selectForEntity(entityType: AnalyticsEntityType): string {
  switch (entityType) {
    case 'customers':
      return 'id, tenant_id, business_name, buyer_app_enabled';
    case 'estimates':
      return 'id, tenant_id, buyer_id, location_id, estimate_number, status, estimate_date, total_amount, currency, source, is_buyer_app_estimate';
    case 'orders':
      return 'id, tenant_id, buyer_id, location_id, order_number, status, order_date, total_amount, currency, source, estimate_id, is_buyer_app_order';
    case 'invoices':
      return 'id, tenant_id, buyer_id, location_id, order_id, estimate_id, invoice_number, status, invoice_date, total_amount, is_buyer_app_invoice';
  }
}

function eventKeyProviderEntity(entityType: AnalyticsEntityType): string {
  switch (entityType) {
    case 'customers':
      return 'customer';
    case 'estimates':
      return 'estimate';
    case 'orders':
      return 'order';
    case 'invoices':
      return 'invoice';
  }
}

export function buildZohoAnalyticsEventKey(
  tenantIntegrationId: string,
  entityType: AnalyticsEntityType,
  externalId: string,
  suffix: 'created' | 'buyer_access_enabled',
): string {
  return `zoho:${tenantIntegrationId}:${eventKeyProviderEntity(entityType)}:${externalId}:${suffix}`;
}

export function coerceAnalyticsBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  return false;
}

export function getZohoCustomFieldValue(record: Record<string, unknown>, apiName: string): unknown {
  const fields = record.custom_fields;
  if (!Array.isArray(fields)) return undefined;
  for (const field of fields) {
    if (!field || typeof field !== 'object' || Array.isArray(field)) continue;
    const candidate = field as Record<string, unknown>;
    if (candidate.api_name === apiName) return candidate.value;
  }
  return undefined;
}

export function isZohoCatalogTransactionCandidate(input: {
  entityType: 'estimates' | 'orders' | 'invoices';
  sourceRecord?: Record<string, unknown> | null;
  persistedRow: Record<string, unknown>;
}): boolean {
  const { entityType, sourceRecord, persistedRow } = input;
  if (entityType === 'estimates') {
    return coerceAnalyticsBoolean(sourceRecord ? getZohoCustomFieldValue(sourceRecord, 'cf_catalog_estimate') : undefined)
      || persistedRow.is_buyer_app_estimate === true;
  }
  if (entityType === 'orders') {
    return coerceAnalyticsBoolean(sourceRecord ? getZohoCustomFieldValue(sourceRecord, 'cf_catalog_order') : undefined)
      || persistedRow.is_buyer_app_order === true
      || Boolean(persistedRow.estimate_id);
  }
  return coerceAnalyticsBoolean(sourceRecord ? getZohoCustomFieldValue(sourceRecord, 'cf_catalog_invoice') : undefined)
    || persistedRow.is_buyer_app_invoice === true
    || Boolean(persistedRow.estimate_id)
    || Boolean(persistedRow.order_id);
}

export function isZohoBuyerAccessEnabledCandidate(input: {
  sourceRecord?: Record<string, unknown> | null;
  persistedRow: Record<string, unknown>;
  existingRow?: Record<string, unknown> | null;
}): boolean {
  const enabledFromZoho = coerceAnalyticsBoolean(
    input.sourceRecord ? getZohoCustomFieldValue(input.sourceRecord, 'cf_online_catalogue_access') : undefined,
  );
  const enabledNow = enabledFromZoho || input.persistedRow.buyer_app_enabled === true;
  const wasEnabled = input.existingRow?.buyer_app_enabled === true;
  return enabledNow && !wasEnabled;
}

function transactionSource(entityType: AnalyticsEntityType, row: Record<string, unknown>): string | null {
  if (entityType === 'orders') {
    return row.estimate_id ? 'converted_estimate' : 'erp_direct';
  }
  if (entityType === 'invoices') {
    if (row.order_id && row.estimate_id) return 'converted_order_and_estimate';
    if (row.order_id) return 'converted_order';
    if (row.estimate_id) return 'converted_estimate';
    return 'erp_direct';
  }
  return null;
}

function transactionDate(entityType: AnalyticsEntityType, row: Record<string, unknown>): string | null {
  if (entityType === 'estimates') return typeof row.estimate_date === 'string' ? row.estimate_date : null;
  if (entityType === 'orders') return typeof row.order_date === 'string' ? row.order_date : null;
  if (entityType === 'invoices') return typeof row.invoice_date === 'string' ? row.invoice_date : null;
  return null;
}

function eventTimestampFromDate(date: string | null): string | undefined {
  if (!date) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date}T12:00:00+05:30`;
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

async function maybeSingle<T>(query: unknown): Promise<QueryResult<T>> {
  const result = await (query as PromiseLike<QueryResult<T>>);
  return result;
}

async function loadTenant(admin: AdminClient, tenantId: string): Promise<Record<string, unknown> | null> {
  const query = (((admin.schema('app').from('tenants') as {
    select: (columns: string) => unknown;
  }).select('id, business_name, slug') as {
    eq: (column: string, value: unknown) => unknown;
  }).eq('id', tenantId) as {
    maybeSingle: () => PromiseLike<QueryResult<Record<string, unknown>>>;
  }).maybeSingle();
  const { data, error } = await maybeSingle<Record<string, unknown>>(query);
  if (error) throw new Error(`load tenant failed: ${error.message}`);
  return data;
}

async function loadEntity(admin: AdminClient, event: AnalyticsEventRow): Promise<Record<string, unknown> | null> {
  const query = (((admin.schema('app').from(tableForEntity(event.entity_type)) as {
    select: (columns: string) => unknown;
  }).select(selectForEntity(event.entity_type)) as {
    eq: (column: string, value: unknown) => unknown;
  }).eq('id', event.internal_id) as {
    maybeSingle: () => PromiseLike<QueryResult<Record<string, unknown>>>;
  }).maybeSingle();
  const { data, error } = await maybeSingle<Record<string, unknown>>(query);
  if (error) throw new Error(`load ${event.entity_type} failed: ${error.message}`);
  return data;
}

export async function buildZohoErpAnalyticsPayload(
  admin: AdminClient,
  event: AnalyticsEventRow,
): Promise<{ distinctId: string; properties: Record<string, unknown>; timestamp?: string }> {
  const [tenant, entity] = await Promise.all([
    loadTenant(admin, event.tenant_id),
    loadEntity(admin, event),
  ]);

  if (!entity) {
    throw new Error(`missing source row for ${event.entity_type}:${event.internal_id}`);
  }

  const date = transactionDate(event.entity_type, entity);
  const base = {
    event_origin: 'server',
    source_system: 'zoho',
    provider: event.provider,
    tenant_id: event.tenant_id,
    tenant_name: tenant?.business_name ?? null,
    tenant_slug: tenant?.slug ?? null,
    tenant_integration_id: event.tenant_integration_id,
    entity_type: event.entity_type,
    external_id: event.external_id,
    internal_id: event.internal_id,
    synced_at: new Date().toISOString(),
  };

  if (event.entity_type === 'customers') {
    return {
      distinctId: `integration:${event.tenant_id}:${event.tenant_integration_id}`,
      properties: {
        ...base,
        buyer_id: event.internal_id,
        buyer_name: entity.business_name ?? null,
        buyer_app_enabled: entity.buyer_app_enabled === true,
      },
    };
  }

  const docNumber = event.entity_type === 'estimates'
    ? entity.estimate_number
    : event.entity_type === 'orders'
      ? entity.order_number
      : entity.invoice_number;
  const sourceFlagName = event.entity_type === 'estimates'
    ? 'is_buyer_app_estimate'
    : event.entity_type === 'orders'
      ? 'is_buyer_app_order'
      : 'is_buyer_app_invoice';

  return {
    distinctId: `integration:${event.tenant_id}:${event.tenant_integration_id}`,
    timestamp: eventTimestampFromDate(date),
    properties: {
      ...base,
      buyer_id: entity.buyer_id ?? null,
      location_id: entity.location_id ?? null,
      transaction_id: event.internal_id,
      transaction_type: event.entity_type.slice(0, -1),
      transaction_number: docNumber ?? null,
      transaction_date: date,
      transaction_source: transactionSource(event.entity_type, entity),
      status: entity.status ?? null,
      total_amount: entity.total_amount ?? null,
      currency: entity.currency ?? 'INR',
      estimate_id: entity.estimate_id ?? null,
      order_id: entity.order_id ?? null,
      [sourceFlagName]: entity[sourceFlagName] === true,
    },
  };
}

async function updateAnalyticsEvent(
  admin: AdminClient,
  eventId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const query = ((admin.schema('app').from('integration_analytics_events') as {
    update: (values: Record<string, unknown>) => unknown;
  }).update(patch) as {
    eq: (column: string, value: unknown) => PromiseLike<{ error: { message: string } | null }>;
  }).eq('id', eventId);
  const { error } = await query;
  if (error) throw new Error(`update analytics event failed: ${error.message}`);
}

async function capturePostHog(event: AnalyticsEventRow, payload: Awaited<ReturnType<typeof buildZohoErpAnalyticsPayload>>): Promise<void> {
  const key = getEnv('POSTHOG_PROJECT_API_KEY') ?? getEnv('NEXT_PUBLIC_POSTHOG_KEY');
  if (!key) throw new Error('PostHog project key is not configured');
  const host = (getEnv('NEXT_PUBLIC_POSTHOG_HOST') ?? getEnv('POSTHOG_HOST') ?? 'https://us.i.posthog.com').replace(/\/+$/, '');
  const response = await fetch(`${host}/capture/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      event: event.event_name,
      distinct_id: payload.distinctId,
      properties: payload.properties,
      ...(payload.timestamp ? { timestamp: payload.timestamp } : {}),
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`PostHog capture failed ${response.status}: ${body.slice(0, 300)}`);
  }
}

async function sendAnalyticsEvent(admin: AdminClient, event: AnalyticsEventRow): Promise<void> {
  await updateAnalyticsEvent(admin, event.id, {
    emit_status: 'pending',
    attempt_count: (event.attempt_count ?? 0) + 1,
    last_attempted_at: new Date().toISOString(),
    last_error: null,
  });

  try {
    const payload = await buildZohoErpAnalyticsPayload(admin, event);
    await capturePostHog(event, payload);
    await updateAnalyticsEvent(admin, event.id, {
      emit_status: 'sent',
      sent_at: new Date().toISOString(),
      last_error: null,
    });
  } catch (error) {
    await updateAnalyticsEvent(admin, event.id, {
      emit_status: 'failed',
      last_error: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
    });
  }
}

async function insertPendingEvents(
  admin: AdminClient,
  input: {
    tenantId: string;
    tenantIntegrationId: string;
    candidates: ZohoAnalyticsCandidate[];
  },
): Promise<AnalyticsEventRow[]> {
  if (input.candidates.length === 0) return [];
  const rows = input.candidates.map((candidate) => ({
    tenant_id: input.tenantId,
    tenant_integration_id: input.tenantIntegrationId,
    provider: 'zoho',
    entity_type: candidate.entityType,
    external_id: candidate.externalId,
    internal_id: candidate.internalId,
    event_name: candidate.eventName,
    event_key: buildZohoAnalyticsEventKey(
      input.tenantIntegrationId,
      candidate.entityType,
      candidate.externalId,
      candidate.entityType === 'customers' ? 'buyer_access_enabled' : 'created',
    ),
    emit_status: 'pending',
  }));

  const query = ((admin.schema('app').from('integration_analytics_events') as {
    upsert: (values: Record<string, unknown>[], options: Record<string, unknown>) => unknown;
  }).upsert(rows, { onConflict: 'event_key', ignoreDuplicates: true }) as {
    select: (columns: string) => PromiseLike<QueryResult<AnalyticsEventRow[]>>;
  }).select('*');

  const { data, error } = await query;
  if (error) throw new Error(`insert analytics event failed: ${error.message}`);
  return data ?? [];
}

async function loadRetryableEventsByKeys(
  admin: AdminClient,
  eventKeys: string[],
): Promise<AnalyticsEventRow[]> {
  if (eventKeys.length === 0) return [];
  const table = admin.schema('app').from('integration_analytics_events') as {
    select: (columns: string) => {
      in: (column: string, values: string[]) => {
        eq: (column: string, value: unknown) => {
          lt: (column: string, value: unknown) => PromiseLike<QueryResult<AnalyticsEventRow[]>>;
        };
      };
    };
  };

  const { data, error } = await table
    .select('*')
    .in('event_key', eventKeys)
    .eq('emit_status', 'failed')
    .lt('attempt_count', 5);

  if (error) throw new Error(`load retryable analytics events failed: ${error.message}`);
  return data ?? [];
}

export async function captureZohoErpAnalyticsEvents(input: {
  admin: AdminClient;
  tenantId: string;
  tenantIntegrationId: string;
  candidates: ZohoAnalyticsCandidate[];
}): Promise<void> {
  try {
    const eventKeys = input.candidates.map((candidate) => buildZohoAnalyticsEventKey(
      input.tenantIntegrationId,
      candidate.entityType,
      candidate.externalId,
      candidate.entityType === 'customers' ? 'buyer_access_enabled' : 'created',
    ));
    const inserted = await insertPendingEvents(input.admin, input);
    const retryable = await loadRetryableEventsByKeys(input.admin, eventKeys);
    const eventsById = new Map([...inserted, ...retryable].map((event) => [event.id, event] as const));
    await Promise.all(Array.from(eventsById.values()).map((event) => sendAnalyticsEvent(input.admin, event)));
  } catch (error) {
    console.warn('[posthog-erp-analytics] capture failed non-blocking', error instanceof Error ? error.message : String(error));
  }
}

export async function retryPendingZohoErpAnalyticsEvents(admin: AdminClient, limit = 50): Promise<void> {
  const table = admin.schema('app').from('integration_analytics_events') as {
    select: (columns: string) => {
      in: (column: string, values: string[]) => {
        lt: (column: string, value: unknown) => {
          order: (column: string, options: Record<string, unknown>) => {
            limit: (count: number) => PromiseLike<QueryResult<AnalyticsEventRow[]>>;
          };
        };
      };
    };
  };
  const query = table
    .select('*')
    .in('emit_status', ['pending', 'failed'])
    .lt('attempt_count', 5)
    .order('created_at', { ascending: true });

  const { data, error } = await query.limit(limit);
  if (error) throw new Error(`load pending analytics events failed: ${error.message}`);
  await Promise.all((data ?? []).map((event) => sendAnalyticsEvent(admin, event)));
}
