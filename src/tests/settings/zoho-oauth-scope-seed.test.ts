import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const seedSql = readFileSync(path.join(process.cwd(), 'supabase/seed.sql'), 'utf8');
const seedMigrationSql = readFileSync(path.join(process.cwd(), 'supabase/migrations/20260701045110_seed_integration_types.sql'), 'utf8');
const oauthMigrationSql = readFileSync(path.join(process.cwd(), 'supabase/migrations/20260701051222_fix_integration_types_oauth.sql'), 'utf8');

describe('zoho oauth seed config', () => {
  it('advertises the warehouse-capable scopes for both Zoho integration seeds', () => {
    for (const sql of [seedSql, seedMigrationSql, oauthMigrationSql]) {
      expect(sql).toContain('ZohoBooks.fullaccess.all');
      expect(sql).toContain('ZohoInventory.settings.READ');
      expect(sql).toContain('ZohoInventory.fullaccess.all');
    }
  });
});
