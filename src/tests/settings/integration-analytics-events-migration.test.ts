import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260728060552_integration_analytics_events.sql'),
  'utf8',
);

describe('integration analytics events migration', () => {
  it('creates a compact dedupe table without payload JSON', () => {
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS app.integration_analytics_events');
    expect(migrationSql).toContain('CONSTRAINT integration_analytics_events_event_key_key UNIQUE (event_key)');
    expect(migrationSql).not.toMatch(/payload\s+jsonb/i);
  });

  it('purges terminal analytics event rows after two days through storage maintenance', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION app.purge_integration_analytics_events()');
    expect(migrationSql).toContain("created_at < now() - interval '2 days'");
    expect(migrationSql).toContain('PERFORM app.purge_integration_analytics_events();');
  });
});
