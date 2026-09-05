import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve('supabase/migrations/20260902055517_app_catalogs_public_storefront.sql'),
  'utf8',
);

describe('app.catalogs public storefront SQL contract', () => {
  it('creates catalogs + exclusions with catalog-scoped pricing columns', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS app.catalogs');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS app.catalog_exclusions');
    expect(sql).toContain("kind text NOT NULL CHECK (kind IN ('public', 'named'))");
    expect(sql).toContain("pricing_mode text CHECK (pricing_mode IN ('hidden_until_login', 'base_selling_rate', 'assigned_price_list'))");
    expect(sql).toContain('price_list_id uuid REFERENCES app.price_lists(id) ON DELETE RESTRICT');
    expect(sql).toContain('live_at timestamptz');
    expect(sql).toContain("WHERE kind = 'public' AND deleted_at IS NULL");
  });

  it('does not copy campaign fields onto catalogs', () => {
    expect(sql).not.toContain('share_token');
    expect(sql).not.toContain('buyer_target_mode');
    expect(sql).not.toContain('valid_from');
  });

  it('backfills every tenant with a dormant public catalog (no auto-live)', () => {
    expect(sql).toContain("INSERT INTO app.catalogs (tenant_id, kind, include_all");
    expect(sql).not.toContain("AND t.slug = 'wineyard'");
    expect(sql).not.toContain('live_at = now()');
  });

  it('hooks create_tenant_and_admin to insert a dormant public catalog on useyukti.in', () => {
    expect(sql).toContain("INSERT INTO app.catalogs (tenant_id, kind, include_all, created_by, updated_by)");
    expect(sql).toContain("'subdomain', p_slug || '.useyukti.in'");
    expect(sql).toContain('v_subdomain := p_slug;');
  });

  it('keeps the scrape limiter service-role only', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS app.public_catalog_rate_limits');
    expect(sql).toContain('REVOKE ALL ON TABLE app.public_catalog_rate_limits FROM anon, authenticated');
    expect(sql).toContain('GRANT ALL ON TABLE app.public_catalog_rate_limits TO service_role');
  });
});
