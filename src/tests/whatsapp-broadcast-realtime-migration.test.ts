import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260718165738_whatsapp_broadcast_realtime_and_delivery_rollups.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');

describe('whatsapp broadcast realtime and delivery rollups migration', () => {
  it('adds broadcast rollup counters and the refresh helper', () => {
    expect(migrationSql).toContain('ADD COLUMN IF NOT EXISTS sent_count integer DEFAULT 0 NOT NULL');
    expect(migrationSql).toContain('ADD COLUMN IF NOT EXISTS delivered_count integer DEFAULT 0 NOT NULL');
    expect(migrationSql).toContain('ADD COLUMN IF NOT EXISTS failed_count integer DEFAULT 0 NOT NULL');
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION app.refresh_whatsapp_broadcast_rollup(p_broadcast_id uuid)');
  });

  it('keeps whatsapp broadcasts and messages in the realtime publication', () => {
    expect(migrationSql).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE app.whatsapp_broadcasts");
    expect(migrationSql).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE app.whatsapp_messages");
  });

  it('refreshes broadcast rollups from both send completion and migration backfill', () => {
    expect(migrationSql).toContain('PERFORM app.refresh_whatsapp_broadcast_rollup(v_broadcast_id);');
    expect(migrationSql).toContain('FOR v_broadcast_id IN');
    expect(migrationSql).toContain('SELECT id');
    expect(migrationSql).toContain('FROM app.whatsapp_broadcasts');
  });
});
