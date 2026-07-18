import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260716090456_metrics_v2_phase_5_dashboard_metrics_foundation.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');

describe('metrics phase 5 dashboard foundation migration', () => {
  it('adds read-only dashboard portfolio RPCs and the central primary-demand helper', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION app.metrics_v2_primary_demand_kind');
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION app.get_metrics_v2_seller_dashboard');
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION app.get_metrics_v2_buyer_app_dashboard');
    expect(migrationSql).toContain("THEN 'orders'");
    expect(migrationSql).toContain("THEN 'estimates'");
    expect(migrationSql).toContain("ELSE 'none'");
  });

  it('covers every non-later Seller Dashboard portfolio option from the product strategy', () => {
    [
      'invoiced_sales',
      'open_order_value',
      'overdue_receivables',
      'recently_sold_products_now_out_of_stock',
      'customers_who_purchased',
      'open_primary_demand_value',
      'amount_due_in_7_days',
      'stock_with_no_sale_90d',
      'buyer_app_demand_customers_sales_share',
      'primary_demand_action',
      'estimate_follow_up',
      'order_execution',
      'collections',
      'product_availability',
      'customer_reactivation',
      'buyer_app_activation',
      'business_flow',
      'sales_mix',
      'customer_activity',
      'inventory_actions',
      'buyer_app_teaser',
      'significant_changes',
      'location_comparison',
    ].forEach((id) => {
      expect(migrationSql).toContain(`'${id}'`);
    });
  });

  it('covers every non-later Buyer App dashboard portfolio option from the product strategy', () => {
    [
      'customers_with_access',
      'customers_submitting_app_demand',
      'app_sourced_invoiced_sales_share',
      'repeat_app_customers',
      'app_sourced_demand_value_share',
      'customers_who_used_app',
      'demand_cancellation_rate',
      'average_demand_docs_per_enabled_customer',
      'valuable_assisted_customers_without_access',
      'access_enabled_but_never_used',
      'used_app_but_no_demand',
      'previously_submitted_app_demand_now_inactive',
      'app_demand_needing_operational_action',
      'adoption_funnel',
      'business_through_app',
      'app_contribution_over_time',
      'adoption_by_location',
      'adoption_by_customer_group',
      'assisted_versus_app_order_quality',
      'customers_moving_from_assisted_to_app',
    ].forEach((id) => {
      expect(migrationSql).toContain(`'${id}'`);
    });
  });

  it('does not add runtime selectors, cron, realtime publication, or high-cardinality daily storage', () => {
    expect(migrationSql).not.toContain('df_metrics_v2');
    expect(migrationSql).not.toContain('read_model_version');
    expect(migrationSql).not.toMatch(/cron\.schedule/i);
    expect(migrationSql).not.toMatch(/supabase_realtime/i);
    expect(migrationSql).not.toMatch(/CREATE\s+TABLE/i);
    expect(migrationSql).not.toMatch(/metrics_.*(?:buyer|buyers|product|brand|category|warehouse|campaign|group|price_list|pricelist)_daily/i);
  });

  it('keeps LATER metrics excluded while retaining explicit conditional availability', () => {
    expect(migrationSql).not.toMatch(/gross_margin|margin_leakage|Margin leakage|Gross margin/i);
    expect(migrationSql).toContain("'CONDITIONAL'");
    expect(migrationSql).toContain("'unavailable_reason'");
    expect(migrationSql).toContain("'available'");
  });
});
