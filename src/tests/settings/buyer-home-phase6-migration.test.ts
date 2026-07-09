import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260709055452_buyer_home_phase6_completion.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');

describe('buyer home phase 6 migration', () => {
  it('switches buyer current snapshot to shared status helpers', () => {
    expect(migrationSql).toContain('invoice_status_has_receivable');
    expect(migrationSql).toContain('invoice_is_overdue');
    expect(migrationSql).toContain('order_status_is_open');
    expect(migrationSql).not.toContain("i.status IN ('sent', 'overdue', 'unpaid', 'viewed', 'partially_paid')");
    expect(migrationSql).not.toContain("'accepted',\n          'received'");
  });

  it('preserves buyer YTD facts during generic KPI pruning', () => {
    expect(migrationSql).toContain('DELETE FROM app.kpi_buyers_daily');
    expect(migrationSql).toContain("date_trunc('year'");
    expect(migrationSql).toContain("AT TIME ZONE 'Asia/Kolkata'");
    expect(migrationSql).toContain('LEAST(');
  });

  it('widens buyer KPI rebuild coverage and schedules freshness cron', () => {
    expect(migrationSql).toContain('buyer_rebuild_days');
    expect(migrationSql).toContain('rebuild_kpi_buyers_daily_for_tenant(p_tenant_id, buyer_rebuild_days)');
    expect(migrationSql).toContain('ensure_buyer_metric_snapshot_cron_scheduled');
  });

  it('cleans stale customers snapshot trigger residue without removing readers', () => {
    expect(migrationSql).toContain("to_regprocedure('app.refresh_customers_snapshot(uuid)')");
    expect(migrationSql).toContain('DROP FUNCTION IF EXISTS app.trg_refresh_customers_snapshot()');
    expect(migrationSql).not.toContain('DROP TABLE app.customers_snapshot');
  });
});
