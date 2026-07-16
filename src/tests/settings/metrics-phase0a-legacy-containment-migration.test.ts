import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260715112649_metrics_v2_phase_0a_legacy_containment.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');

describe('metrics phase 0A legacy containment migration', () => {
  it('adds buyer-scoped legacy refresh helpers', () => {
    expect(migrationSql).toContain('app.refresh_buyers_snapshot_for_buyer');
    expect(migrationSql).toContain('app.refresh_buyer_current_snapshot_for_buyer');
    expect(migrationSql).toContain('WHERE b.tenant_id = p_tenant_id');
    expect(migrationSql).toContain('AND b.id = p_buyer_id');
  });

  it('rewires document dispatchers to buyer-scoped refreshes', () => {
    const dispatcherSection = migrationSql.slice(
      migrationSql.indexOf('CREATE OR REPLACE FUNCTION app.dispatch_from_estimates()'),
      migrationSql.indexOf('CREATE OR REPLACE FUNCTION app.record_buyer_app_activity('),
    );

    expect(dispatcherSection).toContain('refresh_buyers_snapshot_for_buyer');
    expect(dispatcherSection).toContain('refresh_buyer_current_snapshot_for_buyer');
    expect(dispatcherSection).not.toContain('refresh_buyers_snapshot(v_tenant)');
    expect(dispatcherSection).not.toContain('refresh_buyer_current_snapshot(v_tenant)');
    expect(dispatcherSection).not.toContain('refresh_buyer_app_snapshot(v_tenant)');
  });

  it('keeps buyer app activity capture but removes inline tenant snapshot refresh', () => {
    const activitySection = migrationSql.slice(
      migrationSql.indexOf('CREATE OR REPLACE FUNCTION app.record_buyer_app_activity('),
      migrationSql.indexOf('CREATE OR REPLACE FUNCTION app.trg_post_sync_rebuild()'),
    );

    expect(activitySection).toContain('INSERT INTO app.buyer_app_activity');
    expect(activitySection).toContain('PERFORM app.refresh_buyer_app_daily');
    expect(activitySection).not.toContain('refresh_buyer_app_snapshot');
  });

  it('defers post-sync rebuild instead of running it inside the sync-job update', () => {
    const triggerSection = migrationSql.slice(
      migrationSql.indexOf('CREATE OR REPLACE FUNCTION app.trg_post_sync_rebuild()'),
    );

    expect(triggerSection).toContain('post_sync_rebuild_deferred');
    expect(triggerSection).toContain('post_sync_rebuild_days');
    expect(triggerSection).not.toContain('PERFORM app.post_sync_rebuild');
  });
});
