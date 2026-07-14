import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration = readFileSync(
  join(root, 'supabase/migrations/20260714090301_incremental_search_vectors_and_scoped_product_search.sql'),
  'utf8',
);
const indexMigration = readFileSync(
  join(root, 'supabase/migrations/20260714101036_product_search_trigram_indexes.sql'),
  'utf8',
);
const backfill = readFileSync(
  join(root, 'supabase/manual/RUN_ONCE_incremental_search_vector_backfill.sql'),
  'utf8',
);

describe('search-vector SQL safety contracts', () => {
  it('keeps rebuild RPCs explicit-ID-only and removes sync-completion sweeps', () => {
    expect(migration).toContain('tp.tenant_id = p_tenant_id');
    expect(migration).toContain('tp.id = ANY (p_ids)');
    expect(migration).toContain('DROP TRIGGER IF EXISTS integration_sync_jobs_rebuild_search_vectors');
    expect(migration).toContain('DROP FUNCTION IF EXISTS app.rebuild_tenant_search_vectors(uuid)');
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION app\.rebuild_tenant_search_vectors/);
  });

  it('limits search RPC access and avoids the unindexed joined-text LIKE fallback', () => {
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION app.search_products_scoped');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION app.global_search');
    expect(migration).toContain('TO service_role;');
    expect(migration).not.toContain("sp.search_text LIKE '%' || n.like_q || '%'");
    expect(migration).toContain('sp.search_vector @@ n.prefix_ts_query');
  });

  it('pushes buyer facet and master-category scope into tenant-validated SQL', () => {
    expect(migration).toContain('p_category_scope_id uuid DEFAULT NULL');
    expect(migration).toContain('OR cp.category_id = p_category_scope_id');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION app.get_buyer_product_facets_scoped');
    expect(migration).toContain('FROM app.tenants tenant');
    expect(migration).toContain('campaign.tenant_id = p_tenant_id');
    expect(migration).toContain('p_allowed_brand_ids IS NULL OR tp.tenant_brand_id = ANY (p_allowed_brand_ids)');
    expect(migration).toContain('LIMIT (SELECT facet_limit FROM bounds)');
    expect(migration).toContain('REVOKE ALL ON FUNCTION app.get_buyer_product_facets_scoped(uuid, uuid, uuid[], uuid, uuid, integer) FROM anon');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION app.get_buyer_product_facets_scoped(uuid, uuid, uuid[], uuid, uuid, integer) TO service_role');
  });

  it('creates product trigram indexes concurrently', () => {
    expect(indexMigration.match(/CREATE INDEX CONCURRENTLY/g)).toHaveLength(2);
    expect(indexMigration).toContain('idx_tenant_products_name_override_trgm');
    expect(indexMigration).toContain('idx_tenant_products_internal_sku_trgm');
  });

  it('keeps the manual backfill opt-in, chunked, paced, and lock-safe', () => {
    expect(backfill).not.toContain('allow_all_tenants');
    expect(backfill).toContain('all-tenant sweeps are intentionally disabled');
    expect(backfill).toContain("RAISE EXCEPTION 'Set target_tenant_id");
    expect(backfill).toContain('batch_size BETWEEN 1 AND 250');
    expect(backfill).toContain('FOR UPDATE SKIP LOCKED');
    expect(backfill).toContain('pg_sleep');
    expect(backfill).toContain('max_rows_per_table');
    expect(backfill).toContain('LIMIT 1001');
    expect(backfill).not.toContain('sync_trigger_bypass');
    expect(backfill).not.toContain('include_empty_vectors');
  });

  it('prevents search-vector-only rebuilds from dispatching snapshot refreshes', () => {
    for (const trigger of [
      'trg_buyer_users_dispatch',
      'trg_buyers_dispatch',
      'trg_tenant_brands_dispatch',
      'trg_tenant_products_dispatch',
    ]) {
      const definition = migration.match(new RegExp(`CREATE TRIGGER ${trigger}([\\s\\S]*?)EXECUTE FUNCTION`))?.[1] ?? '';
      expect(definition).toContain('UPDATE OF');
      expect(definition).not.toContain('search_vector');
      expect(definition).not.toContain('embedding');
      expect(definition).not.toContain('updated_at');
    }
  });

  it('builds buyer-user vectors consistently from contact and parent buyer text', () => {
    expect(migration).toContain('AND NEW.buyer_id IS NOT DISTINCT FROM OLD.buyer_id');
    expect(migration).toContain('COALESCE(v_business_name');
    expect(migration).toContain('BEFORE INSERT OR UPDATE OF buyer_id, first_name');
  });

  it('uses IST and canonical order dates for stock availability windows', () => {
    expect(migration).toContain(
      "sp.inventory_updated_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'",
    );
    expect(migration).toContain(
      "(recent_order.order_date::timestamp AT TIME ZONE 'Asia/Kolkata')",
    );
    expect(migration).toContain('recent_order.created_at');
    expect(migration).not.toContain("recent_order.placed_at >= now() - interval '30 days'");
  });
});
