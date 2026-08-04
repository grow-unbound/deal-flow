import type { CustomersLandingMetricsV4 } from '@/lib/customers-landing-v4-types';

export function emptyCustomersLandingMetricsV4(): CustomersLandingMetricsV4 {
  return {
    page_key: 'customers',
    period: {
      period_key: 'this_quarter',
      grain: 'quarter',
      period_start: '',
      period_end_exclusive: '',
      label: 'This Quarter',
    },
    computed_at: null,
    source_watermark: null,
    cards: [],
  };
}
