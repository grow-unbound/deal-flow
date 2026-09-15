import { describe, expect, it } from 'vitest';
import { buildBuyerLocationHref, shouldShowBuyerDesktopBreadcrumbs } from '@/lib/buyer-routes';

describe('shouldShowBuyerDesktopBreadcrumbs', () => {
  it('hides breadcrumbs only on the Home landing page', () => {
    expect(shouldShowBuyerDesktopBreadcrumbs('/buy/home')).toBe(false);
  });

  it('shows breadcrumbs on the Orders and Profile landing tabs', () => {
    expect(shouldShowBuyerDesktopBreadcrumbs('/buy/orders')).toBe(true);
    expect(shouldShowBuyerDesktopBreadcrumbs('/buy/profile')).toBe(true);
  });

  it('shows breadcrumbs on deep buyer pages', () => {
    expect(shouldShowBuyerDesktopBreadcrumbs('/buy/product/abc')).toBe(true);
    expect(shouldShowBuyerDesktopBreadcrumbs('/buy/home/category/abc')).toBe(true);
    expect(shouldShowBuyerDesktopBreadcrumbs('/buy/search')).toBe(true);
    expect(shouldShowBuyerDesktopBreadcrumbs('/buy/orders/123')).toBe(true);
  });
});

describe('buildBuyerLocationHref', () => {
  it('uses public storefront return paths for internal buyer home routes', () => {
    expect(buildBuyerLocationHref('/buy/home')).toBe('/location?returnTo=%2F');
    expect(buildBuyerLocationHref('/buy/home?share_token=tok')).toBe('/location?returnTo=%2F%3Fshare_token%3Dtok');
    expect(buildBuyerLocationHref('/buy/home/list/list-1')).toBe('/location?returnTo=%2Flist%2Flist-1');
  });
});
