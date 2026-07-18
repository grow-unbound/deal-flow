import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260716071422_metrics_v2_phase_4_capture_only_validation.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');

describe('metrics phase 4 capture-only migration', () => {
  it('adds only approved capture triggers and no dispatcher cron', () => {
    [
      'estimates',
      'orders',
      'invoices',
      'estimate_items',
      'order_items',
      'invoice_items',
      'inventory',
      'tenant_products',
      'tenant_brands',
      'buyers',
      'buyer_users',
      'locations',
      'warehouses',
    ].forEach((suffix) => {
      expect(migrationSql).toContain(`trg_metrics_v2_capture_${suffix}`);
    });

    expect(migrationSql).not.toMatch(/cron\.schedule/i);
    expect(migrationSql).not.toContain('df_metrics_v2');
    expect(migrationSql).not.toContain('read_model_version');
  });

  it('keeps capture wrappers internal and routed through the existing marker', () => {
    [
      'metrics_capture_estimates',
      'metrics_capture_orders',
      'metrics_capture_invoices',
      'metrics_capture_estimate_items',
      'metrics_capture_order_items',
      'metrics_capture_invoice_items',
      'metrics_capture_inventory',
      'metrics_capture_tenant_products',
      'metrics_capture_tenant_brands',
      'metrics_capture_buyers',
      'metrics_capture_buyer_users',
      'metrics_capture_locations',
      'metrics_capture_warehouses',
    ].forEach((functionName) => {
      expect(migrationSql).toContain(`CREATE OR REPLACE FUNCTION app.${functionName}()`);
      expect(migrationSql).toMatch(
        new RegExp(
          `CREATE OR REPLACE FUNCTION app\\.${functionName}\\(\\)[\\s\\S]{0,140}SECURITY DEFINER[\\s\\S]{0,120}SET search_path = pg_catalog, app, pg_temp`,
          'i',
        ),
      );
      expect(migrationSql).toContain(`REVOKE ALL ON FUNCTION app.${functionName}() FROM PUBLIC`);
      expect(migrationSql).not.toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION app\\.${functionName}\\(\\) TO (?:anon|authenticated|PUBLIC)`, 'i'),
      );
    });

    expect(migrationSql).toMatch(/PERFORM app\.metrics_mark_dirty\(/);
    expect(migrationSql).not.toMatch(/GRANT EXECUTE ON FUNCTION app\.metrics_mark_dirty[^;]+TO (?:anon|authenticated|PUBLIC)/i);
  });

  it('honors sync bypass in every capture wrapper', () => {
    const functions = migrationSql.match(/CREATE OR REPLACE FUNCTION app\.metrics_capture_[\s\S]*?\$\$;/g) ?? [];
    expect(functions.length).toBe(13);
    functions.forEach((body) => {
      expect(body).toContain('app.sync_trigger_bypass_active()');
    });
  });

  it('captures old and new scalar dependencies without arrays or stored membership', () => {
    expect(migrationSql).toContain("v_tenant_id, 'commercial', 'estimate'");
    expect(migrationSql).toContain("v_tenant_id, 'buyer_app', 'estimate'");
    expect(migrationSql).toContain("v_tenant_id, 'commercial', 'order_item'");
    expect(migrationSql).toContain("v_tenant_id, 'buyer_app', 'order'");
    expect(migrationSql).toContain("v_tenant_id, 'commercial', 'invoice_item'");
    expect(migrationSql).toContain("v_tenant_id, 'buyer_app', 'invoice'");
    expect(migrationSql).toContain("v_tenant_id, 'inventory', 'inventory'");
    expect(migrationSql).toContain("v_tenant_id, 'setup', 'buyer_access'");

    expect(migrationSql).not.toMatch(/\bjsonb?\b/i);
    expect(migrationSql).not.toMatch(/\b(?:uuid|text|date)\s*\[\]/i);
    expect(migrationSql).not.toMatch(/metrics_.*(?:buyer|buyers|product|brand|category|warehouse|campaign|group|price_list|pricelist)_daily/i);
  });
});
