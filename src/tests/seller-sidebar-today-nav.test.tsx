import { describe, expect, it } from 'vitest';
import { collectPrefetchHrefs, navGroups } from '@/components/layout/SellerSidebar';
import { ROLES } from '@/constants';

describe('SellerSidebar Today nav item', () => {
  it('lists Today as the first OPERATIONS item, above Dashboard', () => {
    const operations = navGroups.find((g) => g.label === 'OPERATIONS')!;
    expect(operations.items[0].href).toBe('/today');
    expect(operations.items[1].href).toBe('/dashboard');
  });

  it('is prefetchable for both seller roles', () => {
    const hrefs = collectPrefetchHrefs(navGroups, { role: ROLES.SELLER_ADMIN, getFlag: () => true });
    expect(hrefs).toContain('/today');
  });
});
