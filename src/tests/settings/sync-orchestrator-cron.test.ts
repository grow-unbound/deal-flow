import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260706164421_sync_orchestrator_v2.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');

describe('sync orchestrator v2 cron migration', () => {
  it('removes paused-job resume loop from orchestrator cron', () => {
    expect(migrationSql).not.toContain('JOIN LATERAL');
    expect(migrationSql).not.toMatch(/resume any paused/i);
  });

  it('schedules daily kickoff instead of high-frequency orchestrator', () => {
    expect(migrationSql).toContain("'zoho-sync-daily'");
    expect(migrationSql).toContain("'30 23 * * *'");
    expect(migrationSql).toContain('cron.unschedule');
    expect(migrationSql).not.toContain("'15 seconds'");
    expect(migrationSql).not.toContain("'30 seconds'");
  });

  it('passes previous IST date for incremental daily sync', () => {
    expect(migrationSql).toContain("AT TIME ZONE 'Asia/Kolkata'");
    expect(migrationSql).toContain("'job_type', 'incremental'");
    expect(migrationSql).toContain("'since'");
  });

  it('guards daily kickoff on active master sync_run jobs', () => {
    expect(migrationSql).toContain("mj.phase = 'sync_run'");
    expect(migrationSql).toContain("mj.status IN ('pending', 'running', 'paused')");
  });

  it('reaper does not reset tenant_integrations.status', () => {
    expect(migrationSql).toContain('reap_stale_sync_jobs');
    expect(migrationSql).not.toMatch(/UPDATE app\.tenant_integrations[\s\S]*status = 'connected'/);
  });

  it('skips per-phase post_sync_rebuild during orchestrated runs', () => {
    expect(migrationSql).toContain('trg_post_sync_rebuild');
    expect(migrationSql).toContain("sync_run_id");
    expect(migrationSql).toContain("master_job_id");
  });
});
