import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve('supabase/migrations/20260911071609_campaign_auto_pricelist_overrides.sql'),
  'utf8',
);

describe('campaign pricelist override SQL contract', () => {
  it('loads membership and pricing metadata independently', () => {
    expect(sql).toContain('product_membership_mode,');
    expect(sql).toContain('pricing_source,');
    expect(sql).toContain('price_list_id');
    expect(sql).toContain('INTO v_tenant_id, v_rules, v_product_membership_mode, v_pricing_source, v_price_list_id');
    expect(sql).toContain('WHERE id = p_campaign_id AND deleted_at IS NULL');
    expect(sql).not.toContain("WHERE id = p_campaign_id AND product_membership_mode = 'automatic'");
  });

  it('keeps product membership recomputation gated to automatic campaigns', () => {
    expect(sql).toContain("IF v_product_membership_mode = 'automatic' THEN");
    expect(sql).toContain('INSERT INTO app.campaign_items (campaign_id, tenant_product_id, valid_from)');
    expect(sql).toContain('DO UPDATE SET updated_at = v_now, deleted_at = NULL');
  });

  it('materializes selected pricelist prices into active campaign item overrides', () => {
    expect(sql).toContain("IF v_pricing_source = 'pricelist' THEN");
    expect(sql).toContain('UPDATE app.campaign_items ci');
    expect(sql).toContain('LEFT JOIN app.price_list_items pli');
    expect(sql).toContain('pli.price_list_id = v_price_list_id');
    expect(sql).toContain('pli.tenant_product_id = ci_inner.tenant_product_id');
    expect(sql).toContain('COALESCE(pli.min_qty, 1) = 1');
    expect(sql).toContain('COALESCE(pli.price, tp.base_selling_price) AS price_override');
    expect(sql).toContain('WHERE ci_inner.campaign_id = p_campaign_id');
    expect(sql).toContain('AND ci_inner.deleted_at IS NULL');
  });

  it('does not fall back to MRP for campaign overrides', () => {
    expect(sql.toLowerCase()).not.toContain('mrp');
  });

  it('only bumps campaign item updated_at when the price actually changes', () => {
    expect(sql).toContain('WHEN ci.price_override IS DISTINCT FROM priced.price_override THEN v_now');
    expect(sql).toContain('WHERE ci.id = priced.campaign_item_id');
    expect(sql).toContain('AND ci.price_override IS DISTINCT FROM priced.price_override');
  });
});
