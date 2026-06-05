import type { CohortRules } from '@/lib/zod';

type DbClient = {
  schema: (name: 'app') => {
    from: (table: string) => any;
  };
};

type BuyerDbRow = {
  id: string;
  business_name: string;
  contact_name: string | null;
  geography: { city?: string; state?: string } | null;
  tier: 'A' | 'B' | 'C' | null;
  payment_terms_days: number | null;
  credit_limit: number | null;
  external_ref: string | null;
};

type OrderDbRow = {
  buyer_id: string;
  total_amount: number | null;
  placed_at: string | null;
  status: string | null;
  deleted_at?: string | null;
};

type InvoiceDbRow = {
  buyer_id: string;
  outstanding_balance: number | null;
};

export type CohortComposerBuyerRow = {
  id: string;
  business_name: string;
  contact_name: string | null;
  external_ref: string | null;
  geography_label: string;
  city: string | null;
  state: string | null;
  tier: 'A' | 'B' | 'C' | null;
  last_order_at: string | null;
  mtd_spend: number;
  orders_mtd: number;
  credit_used: number;
  payment_terms_days: number;
  gmv_90d: number;
  initials: string;
  hue: 'teal' | 'ember' | 'cream';
};

export type CohortComposerFilterOption = {
  value: string;
  label: string;
  count: number;
};

export type CohortComposerPayload = {
  buyers: CohortComposerBuyerRow[];
  filters: {
    geographies: CohortComposerFilterOption[];
    tiers: CohortComposerFilterOption[];
    last_order_buckets: CohortComposerFilterOption[];
    gmv_90d_buckets: CohortComposerFilterOption[];
  };
};

const INVOICE_MISSING_CODES = new Set(['PGRST205', '42P01']);
const INDIAN_STATE_LABELS: Record<string, string> = {
  AN: 'Andaman and Nicobar Islands',
  AP: 'Andhra Pradesh',
  AR: 'Arunachal Pradesh',
  AS: 'Assam',
  BR: 'Bihar',
  CG: 'Chhattisgarh',
  CH: 'Chandigarh',
  DD: 'Daman and Diu',
  DH: 'Dadra and Nagar Haveli and Daman and Diu',
  DL: 'Delhi',
  GA: 'Goa',
  GJ: 'Gujarat',
  HP: 'Himachal Pradesh',
  HR: 'Haryana',
  JH: 'Jharkhand',
  JK: 'Jammu and Kashmir',
  KA: 'Karnataka',
  KL: 'Kerala',
  LA: 'Ladakh',
  LD: 'Lakshadweep',
  MH: 'Maharashtra',
  ML: 'Meghalaya',
  MN: 'Manipur',
  MP: 'Madhya Pradesh',
  MZ: 'Mizoram',
  NL: 'Nagaland',
  OD: 'Odisha',
  PB: 'Punjab',
  PY: 'Puducherry',
  RJ: 'Rajasthan',
  SK: 'Sikkim',
  TN: 'Tamil Nadu',
  TR: 'Tripura',
  TS: 'Telangana',
  UK: 'Uttarakhand',
  UP: 'Uttar Pradesh',
  WB: 'West Bengal',
};

export const COHORT_GMV_BUCKETS: Array<{
  id: 'gmv_0' | 'gmv_1_50000' | 'gmv_50001_200000' | 'gmv_200001_500000' | 'gmv_500001_plus';
  label: string;
  test: (value: number) => boolean;
}> = [
  { id: 'gmv_0', label: 'No GMV', test: (value) => value <= 0 },
  { id: 'gmv_1_50000', label: '₹1 - ₹50k', test: (value) => value > 0 && value <= 50_000 },
  { id: 'gmv_50001_200000', label: '₹50k - ₹2L', test: (value) => value > 50_000 && value <= 200_000 },
  { id: 'gmv_200001_500000', label: '₹2L - ₹5L', test: (value) => value > 200_000 && value <= 500_000 },
  { id: 'gmv_500001_plus', label: '₹5L+', test: (value) => value > 500_000 },
];

export const COHORT_LAST_ORDER_BUCKETS: Array<{
  id: 'anytime' | 'within_30_days' | 'within_90_days' | 'dormant_90_plus_days';
  label: string;
}> = [
  { id: 'anytime', label: 'Anytime' },
  { id: 'within_30_days', label: 'Within 30 days' },
  { id: 'within_90_days', label: 'Within 90 days' },
  { id: 'dormant_90_plus_days', label: 'Dormant 90+ days' },
];

function getInitials(value: string) {
  return (
    value
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'CH'
  );
}

function expandStateLabel(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  return INDIAN_STATE_LABELS[trimmed.toUpperCase()] ?? trimmed;
}

function isInvoiceTableMissing(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return INVOICE_MISSING_CODES.has(error.code ?? '') || (error.message ?? '').toLowerCase().includes('invoices');
}

function getIstMonthBounds(now = new Date()) {
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const year = istNow.getFullYear();
  const month = istNow.getMonth();

  const currentStart = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const nextStart = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));
  return {
    currentStartIso: currentStart.toISOString(),
    nextStartIso: nextStart.toISOString(),
  };
}

function buildOptionCounts(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value?.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function deriveLastOrderBucket(lastOrderAt: string | null, now = new Date()) {
  if (!lastOrderAt) return 'dormant_90_plus_days' as const;
  const diffMs = now.getTime() - new Date(lastOrderAt).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 30) return 'within_30_days' as const;
  if (diffDays <= 90) return 'within_90_days' as const;
  return 'dormant_90_plus_days' as const;
}

export function matchesLastOrderBucket(
  lastOrderAt: string | null,
  bucket: 'anytime' | 'within_30_days' | 'within_90_days' | 'dormant_90_plus_days',
  now = new Date(),
) {
  if (bucket === 'anytime') return true;
  const resolved = deriveLastOrderBucket(lastOrderAt, now);
  if (bucket === 'within_30_days') return resolved === 'within_30_days';
  if (bucket === 'within_90_days') {
    return resolved === 'within_30_days' || resolved === 'within_90_days';
  }
  return resolved === 'dormant_90_plus_days';
}

export function deriveGmv90dBucket(value: number) {
  return COHORT_GMV_BUCKETS.find((bucket) => bucket.test(value))?.id ?? 'gmv_0';
}

export function buildCohortRulesFromComposerState(input: {
  geographies: string[];
  tiers: string[];
  lastOrderBucket: 'anytime' | 'within_30_days' | 'within_90_days' | 'dormant_90_plus_days';
  gmvBuckets: Array<'gmv_0' | 'gmv_1_50000' | 'gmv_50001_200000' | 'gmv_200001_500000' | 'gmv_500001_plus'>;
  selectedBuyerIds: string[];
  excludedBuyerIds: string[];
}) {
  const filters: CohortRules['filters'] = [];

  if (input.geographies.length > 0) {
    filters.push({
      field: 'geography.label',
      operator: 'in',
      value: input.geographies,
    });
  }

  if (input.tiers.length > 0) {
    filters.push({
      field: 'tier',
      operator: 'in',
      value: input.tiers,
    });
  }

  if (input.lastOrderBucket !== 'anytime') {
    filters.push({
      field: 'last_order_bucket',
      operator: 'eq',
      value: input.lastOrderBucket,
    });
  }

  if (input.gmvBuckets.length > 0) {
    filters.push({
      field: 'gmv_90d_bucket',
      operator: 'in',
      value: input.gmvBuckets,
    });
  }

  return {
    filters,
    selected_buyer_ids: input.selectedBuyerIds,
    excluded_buyer_ids: input.excludedBuyerIds,
  } satisfies CohortRules;
}

export function resolveBuyerIdsForRules(
  buyers: CohortComposerBuyerRow[],
  rules: CohortRules | null | undefined,
  isStatic: boolean,
) {
  const normalizedRules: CohortRules = {
    filters: rules?.filters ?? [],
    selected_buyer_ids: rules?.selected_buyer_ids ?? [],
    excluded_buyer_ids: rules?.excluded_buyer_ids ?? [],
  };

  if (isStatic) {
    return normalizedRules.selected_buyer_ids;
  }

  const selectedGeographies = new Set<string>();
  const selectedTiers = new Set<string>();
  const selectedGmvBuckets = new Set<string>();
  let lastOrderBucket: string | null = null;

  for (const filter of normalizedRules.filters) {
    const values = Array.isArray(filter.value) ? filter.value : [filter.value];
    if (filter.field === 'geography.label') values.forEach((value) => selectedGeographies.add(value));
    if (filter.field === 'tier') values.forEach((value) => selectedTiers.add(value));
    if (filter.field === 'gmv_90d_bucket') values.forEach((value) => selectedGmvBuckets.add(value));
    if (filter.field === 'last_order_bucket') lastOrderBucket = values[0] ?? null;
  }

  const excluded = new Set(normalizedRules.excluded_buyer_ids ?? []);

  return buyers
    .filter((buyer) => {
      if (selectedGeographies.size > 0 && !selectedGeographies.has(buyer.geography_label)) return false;
      if (selectedTiers.size > 0 && !selectedTiers.has(buyer.tier ?? '')) return false;
      if (selectedGmvBuckets.size > 0 && !selectedGmvBuckets.has(deriveGmv90dBucket(buyer.gmv_90d))) return false;
      if (lastOrderBucket && !matchesLastOrderBucket(buyer.last_order_at, lastOrderBucket as 'anytime' | 'within_30_days' | 'within_90_days' | 'dormant_90_plus_days')) return false;
      if (excluded.has(buyer.id)) return false;
      return true;
    })
    .map((buyer) => buyer.id);
}

export async function getCohortComposerPayload(db: DbClient, tenantId: string): Promise<CohortComposerPayload> {
  const { data: buyers, error: buyersError } = await db
    .schema('app')
    .from('buyers')
    .select('id, business_name, contact_name, geography, tier, payment_terms_days, credit_limit, external_ref')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('business_name', { ascending: true });

  if (buyersError) {
    throw buyersError;
  }

  const buyerRows = (buyers ?? []) as BuyerDbRow[];
  const buyerIds = buyerRows.map((buyer) => buyer.id);
  if (buyerIds.length === 0) {
    return {
      buyers: [],
      filters: {
        geographies: [],
        tiers: [],
        last_order_buckets: COHORT_LAST_ORDER_BUCKETS.map((bucket) => ({ value: bucket.id, label: bucket.label, count: 0 })),
        gmv_90d_buckets: COHORT_GMV_BUCKETS.map((bucket) => ({ value: bucket.id, label: bucket.label, count: 0 })),
      },
    };
  }

  const { currentStartIso, nextStartIso } = getIstMonthBounds();
  const ninetyDaysAgoIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [allOrdersRes, mtdOrdersRes, invoicesRes] = await Promise.all([
    db
      .schema('app')
      .from('orders')
      .select('buyer_id, total_amount, placed_at, status')
      .eq('tenant_id', tenantId)
      .in('buyer_id', buyerIds)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .order('placed_at', { ascending: false }),
    db
      .schema('app')
      .from('orders')
      .select('buyer_id, total_amount, placed_at, status')
      .eq('tenant_id', tenantId)
      .in('buyer_id', buyerIds)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .gte('placed_at', currentStartIso)
      .lt('placed_at', nextStartIso),
    db
      .schema('app')
      .from('invoices')
      .select('buyer_id, outstanding_balance')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .in('buyer_id', buyerIds)
      .in('status', ['issued', 'partially_paid']),
  ]);

  if (allOrdersRes.error) throw allOrdersRes.error;
  if (mtdOrdersRes.error) throw mtdOrdersRes.error;
  if (invoicesRes.error && !isInvoiceTableMissing(invoicesRes.error)) throw invoicesRes.error;

  const allOrders = (allOrdersRes.data ?? []) as OrderDbRow[];
  const mtdOrders = (mtdOrdersRes.data ?? []) as OrderDbRow[];
  const invoices = isInvoiceTableMissing(invoicesRes.error) ? [] : ((invoicesRes.data ?? []) as InvoiceDbRow[]);

  const lastOrderByBuyer = new Map<string, string>();
  const mtdSpendByBuyer = new Map<string, number>();
  const ordersMtdByBuyer = new Map<string, number>();
  const gmv90dByBuyer = new Map<string, number>();
  const creditUsedByBuyer = new Map<string, number>();

  for (const order of allOrders) {
    if (order.placed_at && !lastOrderByBuyer.has(order.buyer_id)) {
      lastOrderByBuyer.set(order.buyer_id, order.placed_at);
    }
    if (order.placed_at && order.placed_at >= ninetyDaysAgoIso) {
      gmv90dByBuyer.set(order.buyer_id, (gmv90dByBuyer.get(order.buyer_id) ?? 0) + Number(order.total_amount ?? 0));
    }
  }

  for (const order of mtdOrders) {
    mtdSpendByBuyer.set(order.buyer_id, (mtdSpendByBuyer.get(order.buyer_id) ?? 0) + Number(order.total_amount ?? 0));
    ordersMtdByBuyer.set(order.buyer_id, (ordersMtdByBuyer.get(order.buyer_id) ?? 0) + 1);
  }

  for (const invoice of invoices) {
    creditUsedByBuyer.set(invoice.buyer_id, (creditUsedByBuyer.get(invoice.buyer_id) ?? 0) + Number(invoice.outstanding_balance ?? 0));
  }

  const buyersPayload = buyerRows.map((buyer, index) => {
    const city = buyer.geography?.city?.trim() || null;
    const state = expandStateLabel(buyer.geography?.state?.trim() || null);
    const geographyLabel = [city, state].filter(Boolean).join(', ') || '—';
    return {
      id: buyer.id,
      business_name: buyer.business_name,
      contact_name: buyer.contact_name,
      external_ref: buyer.external_ref,
      geography_label: geographyLabel,
      city,
      state,
      tier: buyer.tier,
      last_order_at: lastOrderByBuyer.get(buyer.id) ?? null,
      mtd_spend: Number((mtdSpendByBuyer.get(buyer.id) ?? 0).toFixed(2)),
      orders_mtd: ordersMtdByBuyer.get(buyer.id) ?? 0,
      credit_used: Number((creditUsedByBuyer.get(buyer.id) ?? 0).toFixed(2)),
      payment_terms_days: Number(buyer.payment_terms_days ?? 0),
      gmv_90d: Number((gmv90dByBuyer.get(buyer.id) ?? 0).toFixed(2)),
      initials: getInitials(buyer.business_name),
      hue: index % 3 === 0 ? 'teal' : index % 3 === 1 ? 'ember' : 'cream',
    } satisfies CohortComposerBuyerRow;
  });

  const lastOrderBuckets = COHORT_LAST_ORDER_BUCKETS.map((bucket) => ({
    value: bucket.id,
    label: bucket.label,
    count:
      bucket.id === 'anytime'
        ? buyersPayload.length
        : buyersPayload.filter((buyer) => matchesLastOrderBucket(buyer.last_order_at, bucket.id)).length,
  }));

  const gmvBuckets = COHORT_GMV_BUCKETS.map((bucket) => ({
    value: bucket.id,
    label: bucket.label,
    count: buyersPayload.filter((buyer) => deriveGmv90dBucket(buyer.gmv_90d) === bucket.id).length,
  }));

  return {
    buyers: buyersPayload,
    filters: {
      geographies: buildOptionCounts(buyersPayload.map((buyer) => buyer.geography_label)),
      tiers: buildOptionCounts(buyersPayload.map((buyer) => buyer.tier)),
      last_order_buckets: lastOrderBuckets,
      gmv_90d_buckets: gmvBuckets,
    },
  };
}
