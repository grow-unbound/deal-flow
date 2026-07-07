import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const syncUtilsPath = path.join(process.cwd(), 'supabase/functions/_shared/sync-utils.ts');
const syncUtilsSource = readFileSync(syncUtilsPath, 'utf8');

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260706164421_sync_orchestrator_v2.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');

describe('cooperative sync cancellation', () => {
  it('updatePhaseJob no-ops when job or master run is cancelled', () => {
    expect(syncUtilsSource).toContain('isSyncJobCancelled');
    expect(syncUtilsSource).toContain("if (patch.status !== 'cancelled' && await isSyncJobCancelled");
  });

  it('runPhaseSync checks cancellation inside the page loop', () => {
    expect(syncUtilsSource).toContain('while (true)');
    expect(syncUtilsSource).toMatch(/isSyncJobCancelled[\s\S]*Time-budget check/s);
  });

  it('cancel RPC cancels master + slaves and does not flip tenant_integrations.status', () => {
    expect(migrationSql).toContain('cancel_tenant_integration_sync_job');
    expect(migrationSql).toContain("phase = 'sync_run'");
    expect(migrationSql).toContain('run_cancelled');
    expect(migrationSql).not.toContain("UPDATE app.tenant_integrations");
  });
});
