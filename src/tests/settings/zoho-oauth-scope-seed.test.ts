import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const seedSql = readFileSync(path.join(process.cwd(), 'supabase/seed.sql'), 'utf8');
const seedMigrationSql = readFileSync(path.join(process.cwd(), 'supabase/migrations/20260701045110_seed_integration_types.sql'), 'utf8');
const oauthMigrationSql = readFileSync(path.join(process.cwd(), 'supabase/migrations/20260701051222_fix_integration_types_oauth.sql'), 'utf8');

describe('zoho oauth seed config', () => {
  it('keeps Zoho Books on books-only access while leaving inventory scopes intact', () => {
    for (const sql of [seedSql, seedMigrationSql, oauthMigrationSql]) {
      expect(sql).toContain('ZohoBooks.contacts.ALL');
      expect(sql).toContain('ZohoBooks.items.ALL');
      expect(sql).toContain('ZohoBooks.salesorders.ALL');
      expect(sql).toContain('ZohoBooks.invoices.ALL');
      expect(sql).toContain('ZohoBooks.estimates.ALL');
      expect(sql).toContain('ZohoBooks.settings.ALL');
      expect(sql).toContain('ZohoInventory.fullaccess.all');
    }

    expect(seedSql).toContain(`'zoho_books',`);
    expect(seedSql).toContain(`jsonb_build_array(`);
    expect(seedSql).toContain(`'ZohoBooks.contacts.ALL'`);
    expect(seedSql).toContain(`jsonb_build_array('ZohoInventory.fullaccess.all', 'ZohoInventory.settings.READ')`);

    expect(seedMigrationSql).toContain(`'ZohoBooks.contacts.ALL'`);
    expect(oauthMigrationSql).toContain(`'ZohoBooks.contacts.ALL'`);
  });
});
