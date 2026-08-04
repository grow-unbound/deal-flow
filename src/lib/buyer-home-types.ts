import type { BuyerCatalogItem, BuyerCatalogSummary } from '@/types/buyer';

export interface BuyerProductPageRecos {
  co_order: BuyerCatalogItem[];
  co_buyer: BuyerCatalogItem[];
  same_category: BuyerCatalogItem[];
}

export interface BuyerActivityItem {
  id: string;
  type: 'order' | 'invoice' | 'estimate' | 'payment';
  entity_id: string;
  title: string;
  status: string;
  amount: number;
  timestamp: string;
  href: string;
  secondary_label?: string | null;
  meta?: string | null;
}

export interface BuyerActivityFeedResponse {
  items: BuyerActivityItem[];
  next_cursor: string | null;
}

export type BuyerHomeDemandKind = 'orders' | 'estimates' | 'none';

export interface BuyerHomeMetricsPeriod {
  period_key: string;
  grain: string;
  period_start: string;
  period_end_exclusive: string;
}

/** V4 RPC payload from app.get_buyer_home_metrics_v4 — render as-is. */
export interface BuyerHomeMetricsV4 {
  period: BuyerHomeMetricsPeriod;
  spend_qtd: number;
  invoice_count_qtd: number;
  demand_qtd: number;
  demand_document_count_qtd: number;
  demand_kind: BuyerHomeDemandKind | string;
  credit_limit: number;
  outstanding: number;
  overdue: number;
  available_credit: number;
  computed_at: string | null;
}

export interface BuyerHomePromotionsResponse {
  latest_promotions_preview: BuyerCatalogSummary[];
  preview_message?: string | null;
}

export interface BuyerHomeRecoResponse {
  order_again_preview: BuyerCatalogItem[];
  bestsellers: BuyerCatalogItem[];
  preview_message?: string | null;
}
