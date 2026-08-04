import { describe, expect, it } from 'vitest';

import { withSellerLandingSearch } from '@/lib/seller-search-navigation';

describe('withSellerLandingSearch', () => {
  it('returns the path unchanged when the query is blank', () => {
    expect(withSellerLandingSearch('/products/p-1', '   ')).toBe('/products/p-1');
  });

  it('appends search to detail paths', () => {
    expect(withSellerLandingSearch('/products/p-1', 'alpha cable')).toBe('/products/p-1?search=alpha%20cable');
  });

  it('uses ampersand when the path already has query params', () => {
    expect(withSellerLandingSearch('/products/p-1?tab=pricing', 'alpha')).toBe('/products/p-1?tab=pricing&search=alpha');
  });
});
