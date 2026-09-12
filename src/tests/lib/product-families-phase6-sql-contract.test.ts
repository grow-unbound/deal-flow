import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260912033258_buyer_product_families_phase6.sql'),
  'utf8',
);

describe('product families phase 6 migration contract', () => {
  it('creates tenant-owned family display records with product-style image keys', () => {
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS app.tenant_product_families');
    expect(migrationSql).toContain('tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT');
    expect(migrationSql).toContain('variant_axes jsonb NOT NULL DEFAULT');
    expect(migrationSql).toContain('r2_original_key text');
    expect(migrationSql).toContain('r2_thumb_key text');
    expect(migrationSql).toContain('ON app.tenant_product_families (tenant_id, external_ref)');
    expect(migrationSql).toContain('ALTER TABLE app.tenant_product_families ENABLE ROW LEVEL SECURITY');
  });

  it('links every product to a family and backfills one family per existing SKU', () => {
    expect(migrationSql).toContain('ADD COLUMN IF NOT EXISTS product_family_id uuid REFERENCES app.tenant_product_families(id) ON DELETE RESTRICT');
    expect(migrationSql).toContain("'tenant_product:' || tp.id::text AS external_ref");
    expect(migrationSql).toContain('UPDATE app.tenant_products tp');
    expect(migrationSql).toContain('SET product_family_id = fam.id');
  });

  it('does not add family display metadata to transaction line tables', () => {
    expect(migrationSql).not.toContain('ALTER TABLE app.estimate_items');
    expect(migrationSql).not.toContain('ALTER TABLE app.order_items');
    expect(migrationSql).not.toContain('ALTER TABLE app.invoice_items');
    expect(migrationSql).not.toContain('estimate_items_selected_attributes');
    expect(migrationSql).not.toContain('idx_estimate_items_product_family_id');
  });
});
