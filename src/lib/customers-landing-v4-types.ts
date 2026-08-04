/** V4 landing KPI card from app.get_landing_metrics_v4 / metrics_v4_kpi. */
export interface CustomersLandingKpiCardV4 {
  id: string;
  label: string;
  value: number;
  entity_count?: number;
  document_count?: number | null;
  secondary_value?: number | null;
  supporting_text?: string;
  time_basis?: string;
  filter_preset?: Record<string, unknown>;
}

export interface CustomersLandingMetricsPeriodV4 {
  period_key: string;
  grain: string;
  period_start: string;
  period_end_exclusive: string;
  label?: string;
}

/** Pass-through shape from app.get_landing_metrics_v4 for page_key=customers. */
export interface CustomersLandingMetricsV4 {
  page_key: string;
  period: CustomersLandingMetricsPeriodV4;
  computed_at: string | null;
  source_watermark: string | null;
  cards: CustomersLandingKpiCardV4[];
}

export type CustomersLandingTableSort =
  | 'invoice_value'
  | 'receivable_amount'
  | 'overdue_amount';

export interface CustomersLandingTableRowV4 {
  id: string;
  business_name: string;
  phone: string | null;
  is_active: boolean;
  buyer_app_enabled: boolean;
  invoice_value: number;
  invoice_count: number;
  estimate_value: number;
  estimate_count: number;
  order_value: number;
  order_count: number;
  app_demand_value: number;
  app_demand_count: number;
  receivable_amount: number;
  overdue_amount: number;
  credit_limit: number;
  credit_available: number;
  credit_used: number;
}

export interface CustomersLandingTableResponseV4 {
  buyers: CustomersLandingTableRowV4[];
  nextCursor: string | null;
  total: number | null;
  sort: CustomersLandingTableSort;
  period_start: string;
  grain: 'quarter';
}
