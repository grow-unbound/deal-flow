import { COHORT_GMV_BUCKETS, COHORT_LAST_ORDER_BUCKETS } from '@/lib/server/cohort-composer';

export interface CohortRulesSummaryFilterRow {
  label: string;
  value_text: string;
}

export interface CohortRulesSummary {
  is_static: boolean;
  member_count: number;
  total_tenant_buyers: number;
  /** e.g. "28 of 142 buyers" */
  matched_of_total_label: string;
  filters: CohortRulesSummaryFilterRow[];
  allowed_brands_label: string;
}

const RULE_FIELD_LABELS: Record<string, string> = {
  'geography.label': 'Geography',
  'geography.state': 'State',
  'geography.city': 'City',
  'geography.zone': 'Zone',
  tier: 'Buyer tier',
  brand_focus: 'Brand focus',
  last_order_bucket: 'Order history',
  gmv_90d_bucket: 'GMV (last 90 days)',
  buyer_id: 'Buyer',
};

function formatRuleFilterValue(field: string, operator: string, value: string | string[]): string {
  const parts = Array.isArray(value) ? value : [value];
  const joined = parts.filter(Boolean).join(', ');
  if (!joined) return '—';
  if (field === 'last_order_bucket') {
    const id = parts[0] as (typeof COHORT_LAST_ORDER_BUCKETS)[number]['id'];
    return COHORT_LAST_ORDER_BUCKETS.find((b) => b.id === id)?.label ?? joined;
  }
  if (field === 'gmv_90d_bucket') {
    return parts.map((p) => COHORT_GMV_BUCKETS.find((b) => b.id === p)?.label ?? p).join(', ');
  }
  if (operator === 'not_in') return `not in: ${joined}`;
  return joined;
}

/** Human-readable rules card rows for cohort detail Buyers tab. */
export function buildCohortRulesSummary(input: {
  is_static: boolean;
  filters: Array<{ field: string; operator: string; value: string | string[] }>;
  member_count: number;
  total_tenant_buyers: number;
  allowed_brand_names?: string[] | null;
}): CohortRulesSummary {
  const filters = (input.filters ?? []).map((f) => ({
    label: RULE_FIELD_LABELS[f.field] ?? f.field,
    value_text: formatRuleFilterValue(f.field, f.operator, f.value),
  }));

  return {
    is_static: input.is_static,
    member_count: input.member_count,
    total_tenant_buyers: input.total_tenant_buyers,
    matched_of_total_label: `${input.member_count} of ${input.total_tenant_buyers} buyers`,
    filters,
    allowed_brands_label: input.allowed_brand_names?.length ? input.allowed_brand_names.join(', ') : 'All Brands',
  };
}
