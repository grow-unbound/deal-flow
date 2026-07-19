import { describe, expect, it } from 'vitest';
import { ENTITY_VARIANT_CONFIG } from '@/lib/image-entity-config';

describe('ENTITY_VARIANT_CONFIG', () => {
  it('stores campaign hero images under the tenant campaign picture path', () => {
    expect(ENTITY_VARIANT_CONFIG.catalog_hero.buildBaseKey('campaign-123', 'tenant-456')).toBe(
      'tenants/tenant-456/campaigns/campaign-123/picture',
    );
  });
});
