import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationSql = fs.readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/20260716152124_metrics_v2_phase_8_prelaunch_retirement_readiness.sql'),
  'utf8',
);

const runtimeFiles = [
  'app/api/tenant/customers/metrics/route.ts',
  'src/lib/server/cohort-composer.ts',
  'src/lib/server/seller-dashboard.ts',
];

const retiredRuntimeSourcePattern =
  /\b(?:buyers_snapshot|buyer_current_snapshot|buyer_app_snapshot|kpi_buyers_daily|kpi_product_daily|kpi_buyer_app_daily)\b/i;

describe('Metrics V2 Phase 8 pre-launch retirement readiness', () => {
  it('moves customer summary and cohort composer search onto Metrics V2 snapshots', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION app.get_metrics_v2_customer_summary');
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION app.search_cohort_composer_buyers');
    expect(migrationSql).toContain('app.metrics_buyer_snapshot');
    expect(migrationSql).toContain('app.metrics_buyer_location_snapshot');
    expect(migrationSql).not.toMatch(/\bapp\.buyers_snapshot\b/i);
    expect(migrationSql).not.toMatch(/\bapp\.kpi_buyers_daily\b/i);
  });

  it('keeps Phase 8 hot RPCs bounded for routine app reads', () => {
    expect(migrationSql).toContain("SET statement_timeout = '3s'");
    expect(migrationSql).toContain("SET lock_timeout = '100ms'");
    expect(migrationSql).toContain('LIMIT v_limit');
    expect(migrationSql).toContain('LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100)');
  });

  it('removes retired high-cardinality V1 runtime reads from remaining app consumers', () => {
    for (const file of runtimeFiles) {
      const source = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

      expect(source, file).not.toMatch(retiredRuntimeSourcePattern);
    }
  });
});
