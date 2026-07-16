import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260716050114_metrics_v2_phase_3_manual_refresh_kernel.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');
const edgeFunctionPath = path.join(
  process.cwd(),
  'supabase/functions/metrics-refresh-tick/index.ts',
);
const edgeFunctionSource = readFileSync(edgeFunctionPath, 'utf8');

describe('metrics phase 3 manual refresh kernel migration', () => {
  it('fences every approved snapshot and low-cardinality daily table', () => {
    [
      'metrics_tenant_commercial_snapshot',
      'metrics_tenant_inventory_snapshot',
      'metrics_tenant_buyer_app_snapshot',
      'metrics_tenant_setup_snapshot',
      'metrics_location_snapshot',
      'metrics_buyer_snapshot',
      'metrics_buyer_location_snapshot',
      'metrics_product_snapshot',
      'metrics_product_location_snapshot',
      'metrics_tenant_daily',
      'metrics_location_daily',
    ].forEach((tableName) => {
      expect(migrationSql).toContain(
        `ALTER TABLE app.${tableName} ADD COLUMN IF NOT EXISTS fencing_epoch bigint DEFAULT 0 NOT NULL`,
      );
    });
  });

  it('stores range progress only in scalar cursor columns', () => {
    const cursorSection = migrationSql.slice(
      migrationSql.indexOf('ALTER TABLE app.metrics_dirty_work'),
      migrationSql.indexOf('-- These indexes'),
    );

    expect(cursorSection).toContain('ADD COLUMN IF NOT EXISTS cursor_kind text');
    expect(cursorSection).toContain('ADD COLUMN IF NOT EXISTS cursor_day date');
    expect(cursorSection).toContain('ADD COLUMN IF NOT EXISTS cursor_id uuid');
    expect(cursorSection).not.toMatch(/\bjsonb?\b/i);
    expect(cursorSection).not.toMatch(/\b(?:uuid|text|date)\s*\[\]/i);
  });

  it('implements every scalar range cursor state instead of truncating entity scopes', () => {
    const rangeRefreshSection = migrationSql.slice(
      migrationSql.indexOf('CREATE OR REPLACE FUNCTION app._metrics_refresh_commercial('),
      migrationSql.indexOf('CREATE OR REPLACE FUNCTION app.metrics_inspect('),
    );

    ['buyer', 'product', 'location', 'day'].forEach((cursorKind) => {
      expect(rangeRefreshSection).toMatch(
        new RegExp(
          `(?:cursor_kind[\\s\\S]{0,200}'${cursorKind}'|'${cursorKind}'[\\s\\S]{0,200}cursor_kind)`,
          'i',
        ),
      );
    });
    expect(rangeRefreshSection).toContain('cursor_id');
    expect(rangeRefreshSection).toContain('cursor_day');
    expect(rangeRefreshSection).not.toMatch(/\b(?:uuid|text|date)\s*\[\]/i);
  });

  it('writes bounded product-location and sparse location-daily read models', () => {
    expect(migrationSql).toContain('INSERT INTO app.metrics_product_location_snapshot');
    expect(migrationSql).toContain(
      'ON CONFLICT (tenant_id, location_id, tenant_product_id) WHERE deleted_at IS NULL',
    );
    expect(migrationSql).toContain('INSERT INTO app.metrics_location_daily');
    expect(migrationSql).toContain(
      'ON CONFLICT (tenant_id, location_id, day) WHERE deleted_at IS NULL',
    );
  });

  it('applies tenant/domain dispatch controls to the claimed domain', () => {
    expect(migrationSql).toContain(
      'CREATE OR REPLACE FUNCTION app.metrics_dispatch_enabled(p_tenant_id uuid, p_domain text)',
    );
    expect(migrationSql).toContain('app.metrics_dispatch_enabled(mdw.tenant_id, mdw.domain)');
    expect(migrationSql).toContain(
      'GRANT EXECUTE ON FUNCTION app.metrics_dispatch_enabled(uuid, text) TO authenticated, service_role',
    );
    expect(migrationSql).not.toContain('app.metrics_dispatch_enabled(mdw.tenant_id)');
  });

  it('defines the typed dirty marker, bounded claimant, and stable tick RPC', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION app.metrics_mark_dirty(');
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION app.metrics_claim_dirty_work(p_owner_token uuid)');
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION app.metrics_refresh_tick(');
    expect(migrationSql).toContain(
      'REVOKE ALL ON FUNCTION app.metrics_mark_dirty(uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, date, date, date) FROM PUBLIC',
    );
    expect(migrationSql).toContain(
      'GRANT EXECUTE ON FUNCTION app.metrics_mark_dirty(uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, date, date, date) TO service_role',
    );
    expect(migrationSql).toContain(
      'GRANT EXECUTE ON FUNCTION app.metrics_claim_dirty_work(uuid) TO service_role',
    );
    expect(migrationSql).toContain(
      'GRANT EXECUTE ON FUNCTION app.metrics_refresh_tick(text, uuid, bigint, uuid, text) TO service_role',
    );
    expect(migrationSql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION app\.metrics_(?:mark_dirty|claim_dirty_work|refresh_tick)[^;]* TO (?:authenticated|anon)/i,
    );
  });

  it('enforces source validation, transaction budgets, fair claiming, and replay-safe writes', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION app.metrics_source_type_valid(');
    expect(migrationSql).toContain('IF NOT app.metrics_source_type_valid(p_domain, p_source_type)');
    expect(migrationSql).toContain("p_stage <> ALL (ARRAY['compute', 'acknowledge', 'fail', 'release'])");
    expect(migrationSql).toContain("PERFORM set_config('lock_timeout', '100ms', true)");
    expect(migrationSql).toContain("PERFORM set_config('statement_timeout', '3000ms', true)");
    expect(migrationSql).toContain('FOR UPDATE SKIP LOCKED');
    expect(migrationSql).toContain('LIMIT v_control.max_dirty_sources_per_tick');
    expect(migrationSql).toContain('b.cumulative_keys <= v_control.max_refresh_keys_per_tick');
    expect(migrationSql).toContain('IF v_groups > 25 THEN');
    expect(migrationSql).toContain("* 1000 > 5000 THEN");
    expect(migrationSql).toContain('IS DISTINCT FROM ROW(');
  });

  it('extends post-sync rebuild with deterministic non-master markers', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION app.metrics_mark_sync_completion(');
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION app.trg_post_sync_rebuild()');
    expect(migrationSql).toContain("IF NEW.phase <> ALL (ARRAY['sync_run', 'analysis']) THEN");
    expect(migrationSql.indexOf('PERFORM app.metrics_mark_sync_completion(')).toBeLessThan(
      migrationSql.indexOf('IF NEW.master_job_id IS NOT NULL THEN'),
    );
    expect(migrationSql).toContain("p_phase = ANY (ARRAY['estimates', 'orders', 'invoices', 'transaction_line_items'])");
    expect(migrationSql).toContain("p_phase = ANY (ARRAY['inventory', 'products', 'locations'])");
  });

  it('maps transaction line-item sync completion to commercial and inventory work', () => {
    const syncCompletionSection = migrationSql.slice(
      migrationSql.indexOf('CREATE OR REPLACE FUNCTION app.metrics_mark_sync_completion('),
      migrationSql.indexOf('CREATE OR REPLACE FUNCTION app.trg_post_sync_rebuild()'),
    );

    expect(migrationSql).toContain(
      "p_phase = ANY (ARRAY['estimates', 'orders', 'invoices', 'transaction_line_items'])",
    );
    expect(syncCompletionSection).toMatch(
      /IF p_phase = 'transaction_line_items' THEN[\s\S]{0,500}p_tenant_id, 'inventory', 'sync_job'/i,
    );
  });

  it('keeps the reused post-sync trigger function service-only', () => {
    expect(migrationSql).toContain(
      'REVOKE ALL ON FUNCTION app.trg_post_sync_rebuild() FROM PUBLIC',
    );
    expect(migrationSql).toContain(
      'GRANT EXECUTE ON FUNCTION app.trg_post_sync_rebuild() TO service_role',
    );
    expect(migrationSql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION app\.trg_post_sync_rebuild\(\) TO (?:anon|authenticated)/i,
    );
  });

  it('authenticates the sequential Edge tick with a dedicated timing-safe secret', () => {
    expect(edgeFunctionSource).toContain("Deno.env.get('METRICS_REFRESH_TOKEN')");
    expect(edgeFunctionSource).toContain("request.headers.get('x-metrics-refresh-token')");
    expect(edgeFunctionSource).toContain('timingSafeEqual(received, expected)');
    expect(edgeFunctionSource).toContain('expected.length >= 32');
    expect(edgeFunctionSource).toContain("error: 'unauthorized'");
    expect(edgeFunctionSource).toMatch(/unauthorized'[\s\S]{0,80},\s*401\)/);
  });

  it('remains manual-only and avoids prohibited high-cardinality facts', () => {
    expect(migrationSql).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER/i);
    expect(migrationSql).not.toMatch(/cron\.schedule/i);
    expect(migrationSql).not.toMatch(/supabase_realtime/i);
    expect(migrationSql).not.toContain('df_metrics_v2');
    expect(migrationSql).not.toContain('read_model_version');
    expect(migrationSql).not.toMatch(
      /metrics_.*(?:buyer|buyers|product|brand|category|warehouse|campaign|group|price_list|pricelist)_daily/i,
    );
  });
});
