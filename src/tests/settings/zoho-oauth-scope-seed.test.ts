import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const seedSql = readFileSync(path.join(process.cwd(), 'supabase/seed.sql'), 'utf8');
// The original 2026-07-01 bootstrap migrations that first seeded these scopes
// were squashed into prod_bootstrap during the 2026-07-09 migration
// consolidation and no longer exist as standalone files — only seed.sql (used
// for fresh local/CI bootstraps) remains a live source of truth to check here.

describe('zoho oauth seed config', () => {
  it('grants Zoho Books full-module access (fullaccess.all) while leaving inventory scopes intact', () => {
    // Books moved off a hand-picked module list to a single fullaccess.all grant
    // (2026-09-05) — a missing module in that list is what 401'd WineYard's
    // customer_payments backfill (Zoho error code 57). fullaccess.all avoids
    // that class of bug recurring for future modules.
    expect(seedSql).toContain(`'zoho_books',`);
    expect(seedSql).toContain(`jsonb_build_array(`);
    expect(seedSql).toContain(`'ZohoBooks.fullaccess.all'`);
    expect(seedSql).toContain(`jsonb_build_array('ZohoInventory.fullaccess.all', 'ZohoInventory.settings.READ')`);
  });
});
