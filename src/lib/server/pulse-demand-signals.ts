import type { SupabaseClient } from '@supabase/supabase-js';

export const PULSE_DEMAND_SIGNALS_PAGE_KEY = 'pulse_demand_signals';
export const PULSE_DEMAND_SIGNALS_PERIOD_KEY = 'today';

type HogqlResponse = {
  results?: unknown[][];
};

export type PulseDemandSignalRow = {
  id: string;
  label: string;
  count: number;
  unique_count: number;
  last_seen_at: string | null;
  source_channel: 'storefront';
  tenant_product_id?: string | null;
  product_name?: string | null;
  stock_state?: 'available' | 'limited' | 'out_of_stock' | null;
};

export type PulseDemandSignalsSnapshot = {
  missing_assortment: PulseDemandSignalRow[];
  conversion_gaps: PulseDemandSignalRow[];
  stock_mismatch: PulseDemandSignalRow[];
  signal_counts: {
    missing_assortment: number;
    conversion_gaps: number;
    stock_mismatch: number;
  };
  funnel_counts: {
    searches: number;
    zero_result_searches: number;
    product_views: number;
    cart_adds: number;
  };
  query_window: {
    started_at: string;
    ended_at: string;
  };
  computed_at: string | null;
  source_watermark: string | null;
  stale: boolean;
};

export type PulseDemandSignalsResponse = PulseDemandSignalsSnapshot & {
  page_key: typeof PULSE_DEMAND_SIGNALS_PAGE_KEY;
};

const EMPTY_SIGNALS: PulseDemandSignalsSnapshot = {
  missing_assortment: [],
  conversion_gaps: [],
  stock_mismatch: [],
  signal_counts: {
    missing_assortment: 0,
    conversion_gaps: 0,
    stock_mismatch: 0,
  },
  funnel_counts: {
    searches: 0,
    zero_result_searches: 0,
    product_views: 0,
    cart_adds: 0,
  },
  query_window: {
    started_at: '',
    ended_at: '',
  },
  computed_at: null,
  source_watermark: null,
  stale: true,
};

function istDate(input = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(input);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isStaleSnapshot(sourceWatermark: string | null, computedAt: string | null): boolean {
  const iso = sourceWatermark ?? computedAt;
  if (!iso) return true;
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return true;
  return Date.now() - time > 36 * 60 * 60 * 1000;
}

function hogqlString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function demandCard(id: string, rows: PulseDemandSignalRow[], meta: Record<string, unknown>) {
  return {
    id,
    label: id,
    value: rows.length,
    entity_count: rows.length,
    rows,
    meta,
  };
}

export function parsePulseDemandSignalsSnapshot(payload: unknown): PulseDemandSignalsSnapshot {
  if (!payload || typeof payload !== 'object') return EMPTY_SIGNALS;
  const source = payload as Record<string, unknown>;
  const cards = Array.isArray(source.cards) ? source.cards as Record<string, unknown>[] : [];
  const byId = new Map(cards.map((card) => [String(card.id ?? ''), card]));
  const rowsFor = (id: string): PulseDemandSignalRow[] => {
    const rows = byId.get(id)?.rows;
    return Array.isArray(rows) ? rows as PulseDemandSignalRow[] : [];
  };
  const meta = (byId.get('missing_assortment')?.meta ?? {}) as Record<string, unknown>;
  const computedAt = toStringOrNull(source.computed_at);
  const sourceWatermark = toStringOrNull(source.source_watermark);
  const countFor = (id: string): number => {
    const card = byId.get(id);
    const rows = rowsFor(id);
    return toNumber(card?.entity_count ?? card?.value ?? rows.length);
  };
  return {
    missing_assortment: rowsFor('missing_assortment'),
    conversion_gaps: rowsFor('conversion_gaps'),
    stock_mismatch: rowsFor('stock_mismatch'),
    signal_counts: {
      missing_assortment: countFor('missing_assortment'),
      conversion_gaps: countFor('conversion_gaps'),
      stock_mismatch: countFor('stock_mismatch'),
    },
    funnel_counts: {
      searches: toNumber(meta.searches),
      zero_result_searches: toNumber(meta.zero_result_searches),
      product_views: toNumber(meta.product_views),
      cart_adds: toNumber(meta.cart_adds),
    },
    query_window: {
      started_at: toStringOrNull(meta.query_window_start) ?? '',
      ended_at: toStringOrNull(meta.query_window_end) ?? '',
    },
    computed_at: computedAt,
    source_watermark: sourceWatermark,
    stale: isStaleSnapshot(sourceWatermark, computedAt),
  };
}

async function posthogHogql<T extends HogqlResponse>(query: string): Promise<T> {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID ?? '370765';
  if (!apiKey) throw new Error('posthog_personal_api_key_missing');
  const response = await fetch(`https://us.posthog.com/api/projects/${projectId}/query/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`posthog_query_failed:${response.status}:${text.slice(0, 200)}`);
  }
  return response.json() as Promise<T>;
}

async function fetchMissingAssortment(params: { tenantId: string; windowStart: string; windowEnd: string }) {
  const tenantId = hogqlString(params.tenantId);
  const windowStart = hogqlString(params.windowStart);
  const windowEnd = hogqlString(params.windowEnd);
  const query = `
    SELECT
      properties.normalized_query AS normalized_query,
      count() AS search_count,
      count(DISTINCT distinct_id) AS unique_count,
      max(timestamp) AS last_seen_at
    FROM events
    WHERE event = 'buyer_catalog_search_results_viewed'
      AND properties.tenant_id = ${tenantId}
      AND timestamp >= toDateTime(${windowStart})
      AND timestamp < toDateTime(${windowEnd})
      AND toInt(properties.result_count) = 0
      AND properties.query_redacted != true
      AND properties.normalized_query IS NOT NULL
    GROUP BY normalized_query
    HAVING unique_count >= 2
    ORDER BY unique_count DESC, search_count DESC, last_seen_at DESC
    LIMIT 25
  `;
  const raw = await posthogHogql<HogqlResponse>(query);
  return (raw.results ?? []).map((row) => ({
    id: String(row[0]),
    label: String(row[0]),
    count: toNumber(row[1]),
    unique_count: toNumber(row[2]),
    last_seen_at: toStringOrNull(row[3]),
    source_channel: 'storefront' as const,
  }));
}

async function fetchProductInterest(params: { tenantId: string; windowStart: string; windowEnd: string }) {
  const tenantId = hogqlString(params.tenantId);
  const windowStart = hogqlString(params.windowStart);
  const windowEnd = hogqlString(params.windowEnd);
  const query = `
    SELECT
      properties.tenant_product_id AS tenant_product_id,
      countIf(event = 'product_viewed') AS view_count,
      countIf(event = 'catalog_item_added_to_cart') AS add_count,
      count(DISTINCT distinct_id) AS unique_count,
      max(timestamp) AS last_seen_at
    FROM events
    WHERE event IN ('product_viewed', 'catalog_item_added_to_cart')
      AND properties.tenant_id = ${tenantId}
      AND timestamp >= toDateTime(${windowStart})
      AND timestamp < toDateTime(${windowEnd})
      AND properties.tenant_product_id IS NOT NULL
    GROUP BY tenant_product_id
    HAVING unique_count >= 2
    ORDER BY add_count DESC, view_count DESC, unique_count DESC, last_seen_at DESC
    LIMIT 25
  `;
  const raw = await posthogHogql<HogqlResponse>(query);
  return (raw.results ?? []).map((row) => ({
    tenant_product_id: String(row[0]),
    view_count: toNumber(row[1]),
    add_count: toNumber(row[2]),
    unique_count: toNumber(row[3]),
    last_seen_at: toStringOrNull(row[4]),
  }));
}

async function enrichProductInterest(db: SupabaseClient, tenantId: string, rows: Awaited<ReturnType<typeof fetchProductInterest>>) {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.tenant_product_id);
  const { data } = await (db as any)
    .schema('app')
    .rpc('get_tenant_products_summary', { p_tenant_id: tenantId, p_tenant_product_ids: ids });
  const byProduct = new Map((data ?? []).map((row: any) => [String(row.tenant_product_id), row]));
  return rows.map((row) => {
    const product = byProduct.get(row.tenant_product_id) as { product_name?: string | null } | undefined;
    return {
      id: row.tenant_product_id,
      tenant_product_id: row.tenant_product_id,
      label: product?.product_name ?? row.tenant_product_id,
      product_name: product?.product_name ?? null,
      count: row.view_count + row.add_count,
      unique_count: row.unique_count,
      last_seen_at: row.last_seen_at,
      source_channel: 'storefront' as const,
    };
  });
}

export async function buildPulseDemandSignalsSnapshot(db: SupabaseClient, tenantId: string, now = new Date()): Promise<PulseDemandSignalsSnapshot> {
  const endedAt = now.toISOString();
  const startedAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [missingAssortment, productInterest] = await Promise.all([
    fetchMissingAssortment({ tenantId, windowStart: startedAt, windowEnd: endedAt }),
    fetchProductInterest({ tenantId, windowStart: startedAt, windowEnd: endedAt }),
  ]);
  const enrichedInterest = await enrichProductInterest(db, tenantId, productInterest);
  const productViews = productInterest.reduce((sum, row) => sum + row.view_count, 0);
  const cartAdds = productInterest.reduce((sum, row) => sum + row.add_count, 0);
  return {
    missing_assortment: missingAssortment,
    conversion_gaps: enrichedInterest,
    stock_mismatch: [],
    signal_counts: {
      missing_assortment: missingAssortment.length,
      conversion_gaps: enrichedInterest.length,
      stock_mismatch: 0,
    },
    funnel_counts: {
      searches: missingAssortment.reduce((sum, row) => sum + row.count, 0),
      zero_result_searches: missingAssortment.reduce((sum, row) => sum + row.count, 0),
      product_views: productViews,
      cart_adds: cartAdds,
    },
    query_window: {
      started_at: startedAt,
      ended_at: endedAt,
    },
    computed_at: endedAt,
    source_watermark: endedAt,
    stale: false,
  };
}

export async function writePulseDemandSignalsSnapshot(db: SupabaseClient, tenantId: string, snapshot: PulseDemandSignalsSnapshot) {
  const periodStart = istDate(new Date(snapshot.computed_at ?? Date.now()));
  const cards = [
    demandCard('missing_assortment', snapshot.missing_assortment, {
      searches: snapshot.funnel_counts.searches,
      zero_result_searches: snapshot.funnel_counts.zero_result_searches,
      product_views: snapshot.funnel_counts.product_views,
      cart_adds: snapshot.funnel_counts.cart_adds,
      query_window_start: snapshot.query_window.started_at,
      query_window_end: snapshot.query_window.ended_at,
    }),
    demandCard('conversion_gaps', snapshot.conversion_gaps, {}),
    demandCard('stock_mismatch', snapshot.stock_mismatch, {}),
  ];
  const externalRef = `${PULSE_DEMAND_SIGNALS_PAGE_KEY}:tenant:${PULSE_DEMAND_SIGNALS_PERIOD_KEY}:${periodStart}`;
  const baseRow = {
    tenant_id: tenantId,
    external_ref: externalRef,
    page_key: PULSE_DEMAND_SIGNALS_PAGE_KEY,
    scope_kind: 'tenant',
    scope_id: null,
    period_key: PULSE_DEMAND_SIGNALS_PERIOD_KEY,
    period_start: periodStart,
    kpis: cards,
    source_watermark: snapshot.source_watermark,
    computed_at: snapshot.computed_at,
    calculation_version: 1,
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };
  const { data: existing, error: lookupError } = await (db as any)
    .schema('app')
    .from('metrics_landing_kpi_snapshot')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('page_key', PULSE_DEMAND_SIGNALS_PAGE_KEY)
    .eq('scope_kind', 'tenant')
    .is('scope_id', null)
    .eq('period_key', PULSE_DEMAND_SIGNALS_PERIOD_KEY)
    .eq('period_start', periodStart)
    .is('deleted_at', null)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  const existingId = (existing as { id?: string } | null)?.id;
  const { error } = existingId
    ? await (db as any)
      .schema('app')
      .from('metrics_landing_kpi_snapshot')
      .update(baseRow)
      .eq('id', existingId)
    : await (db as any)
      .schema('app')
      .from('metrics_landing_kpi_snapshot')
      .insert({ ...baseRow, created_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export function demandSignalsResponseFromSnapshot(payload: unknown): PulseDemandSignalsResponse {
  return {
    page_key: PULSE_DEMAND_SIGNALS_PAGE_KEY,
    ...parsePulseDemandSignalsSnapshot(payload),
  };
}
