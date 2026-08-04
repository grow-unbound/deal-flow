import type { BuyerHomeMetricsV4 } from '@/lib/buyer-home-types';

export function emptyBuyerHomeMetricsV4(): BuyerHomeMetricsV4 {
  return {
    period: {
      period_key: 'this_quarter',
      grain: 'quarter',
      period_start: '',
      period_end_exclusive: '',
    },
    spend_qtd: 0,
    invoice_count_qtd: 0,
    demand_qtd: 0,
    demand_document_count_qtd: 0,
    demand_kind: 'none',
    credit_limit: 0,
    outstanding: 0,
    overdue: 0,
    available_credit: 0,
    computed_at: null,
  };
}
