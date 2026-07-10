import type { BuyerCatalogItem, BuyerCatalogSummary } from '@/types/buyer';

export interface BuyerProductPageRecos {
  co_order: BuyerCatalogItem[];       // W2 — Frequently Bought Together
  co_buyer: BuyerCatalogItem[];       // W3 — People Also Bought
  same_category: BuyerCatalogItem[];  // W5 — More from this Category
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

export interface BuyerHomeResponse {
  greeting_name?: string | null;
  open_orders_count: number;
  summary_card: {
    gmv_mtd: number;
    gmv_ytd: number;
    invoice_count_ytd: number;
    trend_vs_last_month_pct: number;
  };
  dues_card: {
    outstanding_dues: number;
    open_invoice_count: number;
    earliest_due_date: string | null;
    days_until_earliest_due: number | null;
  };
  credit_card: {
    credit_limit: number;
    available_credit: number;
    credit_used: number;
  };
  order_again_preview: BuyerCatalogItem[];
  latest_promotions_preview: BuyerCatalogSummary[];
  recent_activity: BuyerActivityFeedResponse;
  // W1 — Bestsellers (weighted by invoice×2 + order×1 + estimate×0.5)
  bestsellers: BuyerCatalogItem[];
  // W4 — Buy Again (from buyer's purchase history; empty if no history)
  buy_again: BuyerCatalogItem[];
  preview_message?: string | null;
}
