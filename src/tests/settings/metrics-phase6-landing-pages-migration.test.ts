import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260716092549_metrics_v2_phase_6_landing_pages.sql'),
  'utf8',
);

describe('Metrics V2 Phase 6 landing migration', () => {
  it('adds read-only transaction landing contracts without runtime activation', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION app.metrics_v2_transaction_landing');
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION app.metrics_v2_products_landing');
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION app.metrics_v2_customers_landing');
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION app.metrics_v2_transaction_landing');
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION app.metrics_v2_products_landing');
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION app.metrics_v2_customers_landing');
    expect(migrationSql).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/i);
    expect(migrationSql).not.toContain('cron.schedule');
    expect(migrationSql).not.toContain('supabase_realtime');
  });

  it('does not introduce prohibited high-cardinality daily or membership storage', () => {
    expect(migrationSql).not.toMatch(/metrics_.*(buyer|product|brand|category|warehouse).*_daily/i);
    expect(migrationSql).not.toMatch(/CREATE\s+TABLE[\s\S]*\b(jsonb|json)\b/i);
    expect(migrationSql).not.toMatch(/CREATE\s+TABLE[\s\S]*\b(uuid\[\]|text\[\])/i);
    expect(migrationSql).not.toContain('df_metrics_v2');
    expect(migrationSql).not.toContain('read_model_version');
  });

  it('keeps transaction actions independent of toolbar table periods', () => {
    expect(migrationSql).toContain("'table_period_owner', 'toolbar'");
    expect(migrationSql).toContain("'headline_period', 'this_month'");
    expect(migrationSql).toContain("'action_period', 'now'");
    expect(migrationSql).toContain("'headline_period', 'trailing_90_days'");
  });
});
