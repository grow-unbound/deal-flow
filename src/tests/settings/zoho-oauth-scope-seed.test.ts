import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const seedSql = readFileSync(path.join(process.cwd(), 'supabase/seed.sql'), 'utf8');
// The original 2026-07-01 bootstrap migrations that first seeded these scopes
// were squashed into prod_bootstrap during the 2026-07-09 migration
// consolidation and no longer exist as standalone files — only seed.sql (used
// for fresh local/CI bootstraps) remains a live source of truth to check here.

describe('zoho oauth seed config', () => {
  it('keeps Zoho Books on a least-privilege module list while leaving inventory scopes intact', () => {
    // Deliberately NOT ZohoBooks.fullaccess.all — see the comment on
    // ZOHO_OAUTH_SCOPES_BY_INTEGRATION in zoho-oauth.ts for why (tried and
    // reverted 2026-09-05: too broad a blast radius on a live customer's
    // real accounting data for what this app actually uses). The
    // missing-module failure mode that motivated trying fullaccess.all is
    // instead guarded by zoho-scope-coverage.test.ts.
    for (const scope of [
      'ZohoBooks.contacts.ALL',
      'ZohoBooks.items.ALL',
      'ZohoBooks.salesorders.ALL',
      'ZohoBooks.invoices.ALL',
      'ZohoBooks.estimates.ALL',
      'ZohoBooks.settings.ALL',
      'ZohoBooks.customerpayments.ALL',
      'ZohoBooks.bills.READ',
    ]) {
      expect(seedSql).toContain(`'${scope}'`);
    }
    expect(seedSql).toContain(`'zoho_books',`);
    expect(seedSql).toContain(`jsonb_build_array(`);
    expect(seedSql).toContain(`jsonb_build_array('ZohoInventory.fullaccess.all', 'ZohoInventory.settings.READ')`);
  });
});
