import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const scalarSql = readFileSync(
  resolve('supabase/migrations/20260910050247_align_resolve_price_tiebreak.sql'),
  'utf8',
);

const batchSql = readFileSync(
  resolve('supabase/migrations/20260823053455_resolve_prices_batch_deterministic_tiebreak.sql'),
  'utf8',
);

describe('resolve_price SQL contract', () => {
  it('keeps scalar and batch price resolution deterministic on full ties', () => {
    expect(batchSql).toContain(
      'ORDER BY c.tenant_product_id, c.tier ASC, c.priority DESC, c.min_qty DESC, c.price ASC',
    );

    expect(scalarSql.match(/ORDER BY pl\.priority DESC, pli\.min_qty DESC, pli\.price ASC/g)).toHaveLength(3);
  });

  it('preserves the same three price-list tiers before base price fallback', () => {
    expect(scalarSql).toContain("pla.target_type = 'buyer'");
    expect(scalarSql).toContain("pla.target_type = 'cohort'");
    expect(scalarSql).toContain("pla.target_type = 'all_buyers'");
    expect(scalarSql).toContain('SELECT base_selling_price INTO v_price');
  });
});
