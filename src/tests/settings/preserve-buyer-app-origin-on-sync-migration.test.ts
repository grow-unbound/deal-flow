import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('preserve buyer-app origin on sync migration', () => {
  const migrationPath = path.resolve(
    process.cwd(),
    'supabase/migrations/20260723082626_preserve_buyer_app_origin_on_sync.sql',
  );
  const migrationSql = readFileSync(migrationPath, 'utf8');

  it('makes estimate buyer-app derivation monotonic across updates', () => {
    expect(migrationSql).toContain('COALESCE(OLD.is_buyer_app_estimate, false)');
    expect(migrationSql).toContain("OR (NEW.source = 'buyer_app')");
  });

  it('makes order buyer-app derivation monotonic across updates and keeps estimate inheritance', () => {
    expect(migrationSql).toContain('COALESCE(OLD.is_buyer_app_order, false)');
    expect(migrationSql).toContain("OR (NEW.source = 'buyer_app')");
    expect(migrationSql).toContain('WHERE e.id = NEW.estimate_id AND e.is_buyer_app_estimate');
  });
});
