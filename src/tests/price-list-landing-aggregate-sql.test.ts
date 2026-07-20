import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260718131308_price_list_landing_kpi_callout_fix.sql'),
  'utf8',
);

describe('price list landing aggregate sql contract', () => {
  it('adds the new custom pricing KPI fields', () => {
    expect(migration).toContain("'products_with_custom_prices'");
    expect(migration).toContain("'customers_with_custom_prices'");
    expect(migration).toContain("'products_below_base_rate'");
  });

  it('counts customer coverage across buyer, cohort, and all-buyer assignments', () => {
    expect(migration).toContain("pla.target_type = 'buyer'");
    expect(migration).toContain("pla.target_type = 'cohort'");
    expect(migration).toContain("pla.target_type = 'all_buyers'");
    expect(migration).toContain('JOIN app.cohort_members cm ON cm.buyer_id = ab.id');
  });

  it('uses assignment presence, not active coverage, for uncovered cohorts', () => {
    expect(migration).toContain('assigned_cohorts AS MATERIALIZED');
    expect(migration).toContain('NOT EXISTS (SELECT 1 FROM assigned_cohorts ac WHERE ac.cohort_id = c.id)');
    expect(migration).toContain('pli.price < tp.base_selling_price');
  });
});
