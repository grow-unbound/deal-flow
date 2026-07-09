import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260709112450_metrics_phase7_repair_and_freshness.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');

describe('metrics phase 7 migration', () => {
  it('is not empty and defines the analysis, repair, and freshness entrypoints', () => {
    expect(migrationSql.trim().length).toBeGreaterThan(0);
    expect(migrationSql).toContain('app.get_tenant_aggregate_freshness');
    expect(migrationSql).toContain('app.run_metrics_analysis_for_tenant');
    expect(migrationSql).toContain('app._run_metrics_analysis_for_tenant_range');
    expect(migrationSql).toContain('app.rebuild_metrics_for_tenant_range');
  });

  it('uses refreshed_at and updated_at timestamps when checking aggregate freshness', () => {
    expect(migrationSql).toContain('refreshed_at');
    expect(migrationSql).toContain('updated_at');
    expect(migrationSql).toContain("interval '6 hours'");
  });

  it('compares aggregate tables against raw transactional sources during analysis', () => {
    expect(migrationSql).toContain('kpi_tenant_daily');
    expect(migrationSql).toContain('kpi_estimates_daily');
    expect(migrationSql).toContain('kpi_orders_daily');
    expect(migrationSql).toContain('kpi_invoices_daily');
    expect(migrationSql).toContain('orders_snapshot');
    expect(migrationSql).toContain('invoices_snapshot');
  });

  it('supports bounded repair toggles and a days-based ad hoc analysis entrypoint', () => {
    expect(migrationSql).toContain('p_include_snapshots boolean DEFAULT true');
    expect(migrationSql).toContain('p_include_kpis boolean DEFAULT true');
    expect(migrationSql).toContain('p_days integer DEFAULT 90');
    expect(migrationSql).toContain('GREATEST(COALESCE(p_days, 90), 1)');
  });

  it('clears stale rows before refreshing the repaired aggregate range', () => {
    expect(migrationSql).toContain('DELETE FROM app.kpi_brand_daily');
    expect(migrationSql).toContain('DELETE FROM app.kpi_buyer_app_daily');
    expect(migrationSql).toContain('DELETE FROM app.kpi_buyers_daily');
    expect(migrationSql).toContain('DELETE FROM app.kpi_orders_daily');
    expect(migrationSql).toContain('PERFORM app.refresh_orders_snapshot(p_tenant_id)');
    expect(migrationSql).toContain('PERFORM app.refresh_buyer_current_snapshot(p_tenant_id)');
  });
});
