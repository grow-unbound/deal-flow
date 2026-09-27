import { describe, expect, it } from 'vitest';

import { CatalogSetupPatchSchema } from '@/lib/server/catalog-setup';

describe('catalog setup schema', () => {
  it('accepts the onboarding setup place used to seed location and warehouse defaults', () => {
    const parsed = CatalogSetupPatchSchema.safeParse({
      settings: {
        business: {
          company_name: 'WineYard',
          tagline: 'Wholesale CCTV catalog',
        },
      },
      setup_place: {
        label: 'WineYard, Hyderabad',
        lat: 17.385044,
        lng: 78.486671,
        address: {
          line1: 'Road 1',
          line2: '',
          city: 'Hyderabad',
          state: 'TG',
          pincode: '500001',
        },
      },
    });

    expect(parsed.success).toBe(true);
  });
});
