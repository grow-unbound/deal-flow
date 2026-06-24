import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260624102000_zoho_daily_sync_cron.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');

describe('zoho daily sync cron migration', () => {
  it('creates a live 5:00 AM cron job for active zoho tenants', () => {
    expect(migrationSql).toContain("cron.schedule(");
    expect(migrationSql).toContain("'zoho-daily-syncs'");
    expect(migrationSql).toContain("'0 5 * * *'");
    expect(migrationSql).toContain('SELECT app.run_zoho_daily_sync_cron();');
  });

  it('backfills and reuses per-tenant cron tokens instead of hard-coding a secret', () => {
    expect(migrationSql).toContain("zoho_daily_sync_cron_token");
    expect(migrationSql).toContain("x-zoho-cron-token");
    expect(migrationSql).toContain("app.tenant_settings");
  });
});
