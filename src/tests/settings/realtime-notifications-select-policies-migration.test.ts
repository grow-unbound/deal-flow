import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260727064729_realtime_notifications_select_policies.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');

describe('realtime notifications select policies migration', () => {
  it('creates a select policy for authenticated realtime subscribers', () => {
    expect(migrationSql).toContain('DROP POLICY IF EXISTS realtime_notifications_select ON app.realtime_notifications;');
    expect(migrationSql).toContain('CREATE POLICY realtime_notifications_select ON app.realtime_notifications');
    expect(migrationSql).toContain('FOR SELECT');
    expect(migrationSql).toContain('TO authenticated');
  });

  it('allows seller users to receive notifications for their tenant', () => {
    expect(migrationSql).toContain("(app.is_seller() AND tenant_id = app.jwt_tenant_id())");
  });

  it('allows buyer users to receive their own tenant-scoped document notifications and published campaigns', () => {
    expect(migrationSql).toContain('app.is_buyer()');
    expect(migrationSql).toContain('tenant_id = app.jwt_tenant_id()');
    expect(migrationSql).toContain('buyer_id = app.jwt_buyer_id()');
    expect(migrationSql).toContain("entity_type = 'campaigns'");
    expect(migrationSql).toContain("(payload ->> 'status') = 'published'");
    expect(migrationSql).toContain("(payload ->> 'valid_to') IS NULL");
    expect(migrationSql).toContain("((payload ->> 'valid_to')::timestamptz > now())");
  });
});
