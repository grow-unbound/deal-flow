import { describe, expect, it } from 'vitest';
import { shouldShowBuyerDesktopBreadcrumbs } from '@/lib/buyer-routes';

describe('shouldShowBuyerDesktopBreadcrumbs', () => {
  it('hides breadcrumbs on landing pages', () => {
    expect(shouldShowBuyerDesktopBreadcrumbs('/buy/catalog')).toBe(false);
    expect(shouldShowBuyerDesktopBreadcrumbs('/buy/orders')).toBe(false);
    expect(shouldShowBuyerDesktopBreadcrumbs('/buy/profile')).toBe(false);
  });

  it('shows breadcrumbs on deep buyer pages', () => {
    expect(shouldShowBuyerDesktopBreadcrumbs('/buy/product/abc')).toBe(true);
    expect(shouldShowBuyerDesktopBreadcrumbs('/buy/catalog/category/abc')).toBe(true);
    expect(shouldShowBuyerDesktopBreadcrumbs('/buy/search')).toBe(true);
    expect(shouldShowBuyerDesktopBreadcrumbs('/buy/orders/123')).toBe(true);
  });
});
