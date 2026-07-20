import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260720084201_preserve_buyer_app_flags_on_cockpit_conversion.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');

describe('preserve buyer app flags on cockpit conversion migration', () => {
  it('copies buyer-app estimate provenance into converted orders', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION "app"."estimate_convert_to_order"');
    expect(migrationSql).toContain('is_buyer_app_order');
    expect(migrationSql).toContain('COALESCE(v_est.is_buyer_app_estimate, false)');
  });

  it('copies buyer-app estimate provenance into converted invoices', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION "app"."estimate_convert_to_invoice"');
    expect(migrationSql).toContain('is_buyer_app_invoice');
    expect(migrationSql).toContain('COALESCE(v_est.is_buyer_app_estimate, false)');
  });

  it('keeps seller-created estimates non buyer-app by default', () => {
    const occurrences = migrationSql.match(/COALESCE\(v_est\.is_buyer_app_estimate, false\)/g) ?? [];
    expect(occurrences).toHaveLength(2);
  });
});
