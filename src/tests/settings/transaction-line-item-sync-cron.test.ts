import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';

const migrationSql = readFileSync(
  'supabase/migrations/20260705102428_transaction_line_item_backfill_phase.sql',
  'utf8',
);

describe('transaction line item sync cron migration', () => {
  it('routes paused transaction line item jobs to their dedicated edge function', () => {
    expect(migrationSql).toContain("WHEN j.phase = 'transaction_line_items' THEN '/sync-transaction-line-items'");
    expect(migrationSql).toContain("'job_id', j.id");
    expect(migrationSql).toContain("'batch_size', COALESCE((j.progress->'next_cursor'->>'per_page')::int, 25)");
  });

  it('keeps normal paused sync phases routed through the sync orchestrator', () => {
    expect(migrationSql).toContain("ELSE '/integrations-sync'");
    expect(migrationSql).toContain("'phase', j.phase");
    expect(migrationSql).toContain("'page_from', (j.progress->'next_cursor'->>'page')::int");
  });

  it('defers initial transactional rebuilds until line items are hydrated', () => {
    expect(migrationSql).toContain("NEW.job_type = 'initial_transactional'");
    expect(migrationSql).toContain("NEW.phase IN ('estimates', 'orders', 'invoices')");
    expect(migrationSql).toContain('PERFORM app.post_sync_rebuild');
  });
});
