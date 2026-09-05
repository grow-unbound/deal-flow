import { describe, expect, it } from 'vitest';
import { storefrontDefaultTitle } from '@/lib/storefront-title';

describe('storefrontDefaultTitle', () => {
  it('joins business name and tagline', () => {
    expect(
      storefrontDefaultTitle({
        isTenantHost: true,
        businessName: 'WineYard',
        tagline: 'CCTV distributor',
        logoUrl: null,
      }),
    ).toBe('WineYard | CCTV distributor');
  });

  it('uses business name only when tagline missing', () => {
    expect(
      storefrontDefaultTitle({
        isTenantHost: true,
        businessName: 'WineYard',
        tagline: null,
        logoUrl: null,
      }),
    ).toBe('WineYard');
  });
});
