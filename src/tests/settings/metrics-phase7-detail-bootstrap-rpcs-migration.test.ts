import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260716135550_metrics_v2_phase_7_detail_bootstrap_rpcs.sql',
);
const migrationSql = fs.readFileSync(migrationPath, 'utf8');

const detailRpcNames = [
  'get_seller_customer_detail_v2',
  'get_seller_product_detail_v2',
  'get_seller_brand_detail_v2',
  'get_seller_category_detail_v2',
  'get_seller_location_detail_v2',
  'get_seller_warehouse_detail_v2',
  'get_seller_cohort_detail_v2',
  'get_seller_pricelist_detail_v2',
  'get_seller_campaign_detail_v2',
];

describe('Metrics V2 Phase 7 detail bootstrap RPC migration', () => {
  it('creates one page-specific detail bootstrap RPC for each analytic seller detail page', () => {
    for (const rpcName of detailRpcNames) {
      expect(migrationSql).toContain(`CREATE OR REPLACE FUNCTION app.${rpcName}`);
      expect(migrationSql).toContain(`GRANT EXECUTE ON FUNCTION app.${rpcName}`);
    }
  });

  it('uses the shared detail card payload contract in every bootstrap RPC', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION app.metrics_v2_detail_card');
    for (const key of ['representation', 'title', 'subtitle', 'time_basis', 'availability', 'body']) {
      expect(migrationSql).toContain(`'${key}'`);
    }
    expect(migrationSql).toContain("'performance_cards'");
    expect(migrationSql).toContain("'kpi_grid'");
    expect(migrationSql).toContain("'tab_badges'");
  });

  it('does not read legacy V1 snapshot or KPI tables from detail RPCs', () => {
    expect(migrationSql).not.toMatch(/\bbuyers_snapshot\b/i);
    expect(migrationSql).not.toMatch(/\blocations_snapshot\b/i);
    expect(migrationSql).not.toMatch(/\bkpi_[a-z_]+_daily\b/i);
    expect(migrationSql).not.toMatch(/\b(products|brands|categories|warehouses|orders|invoices|estimates)_snapshot\b/i);
  });

  it('reads only Metrics V2 analytic sources for card metrics', () => {
    for (const source of [
      'app.metrics_buyer_snapshot',
      'app.metrics_product_snapshot',
      'app.metrics_product_location_snapshot',
      'app.metrics_location_snapshot',
      'app.metrics_location_daily',
      'app.metrics_tenant_setup_snapshot',
    ]) {
      expect(migrationSql).toContain(source);
    }
  });

  it('enforces period validation, twelve-month history labels, and top-list caps', () => {
    expect(migrationSql).toContain('metrics_v2_assert_detail_period');
    expect(migrationSql).toContain("ARRAY['90d']");
    expect(migrationSql).toContain("ARRAY['now_90d']");
    expect(migrationSql).toContain("ARRAY['now']");
    expect(migrationSql).toContain("ARRAY['lifetime']");
    expect(migrationSql).toContain("ARRAY['12m', 'ytd', '3m']");
    expect(migrationSql).toContain('LEAST(GREATEST(COALESCE(p_limit_top, 20), 1), 20)');
  });

  it('keeps deferred high-cardinality cards explicit instead of silently zeroing them', () => {
    expect(migrationSql).toContain("'unavailable'");
    expect(migrationSql).toContain('No V2 product-repeat read model exists');
    expect(migrationSql).toContain('No V2 brand-buyer read model exists');
    expect(migrationSql).toContain('No V2 campaign timeline read model exists');
  });

  it('implements the two previously deferred truthful coverage cards with distribution representations', () => {
    expect(migrationSql).toContain("'current-inventory-by-warehouse'");
    expect(migrationSql).toContain("'Product coverage gaps'");
    expect(migrationSql).toContain("'representation', p_representation");
  });
});
