import { describe, expect, it } from 'vitest';
import {
  BUYER_ORDERS_DEFAULT_TAB,
  resolveBuyerOrdersDefaultTab,
  resolveBuyerOrdersTabVisibility,
} from '@/lib/buyer-orders-tabs';

describe('resolveBuyerOrdersTabVisibility', () => {
  it('stays not-ready until features and flags resolve', () => {
    expect(
      resolveBuyerOrdersTabVisibility({
        orderFeatures: undefined,
        salesOrdersFlag: true,
        estimatesFlag: true,
        invoicesFlag: true,
      }).ready,
    ).toBe(false);

    expect(
      resolveBuyerOrdersTabVisibility({
        orderFeatures: { enquiries: true, sales_orders: true, invoices: true },
        salesOrdersFlag: undefined,
        estimatesFlag: true,
        invoicesFlag: true,
      }).ready,
    ).toBe(false);
  });

  it('ANDs tenant features with PostHog flags', () => {
    const visibility = resolveBuyerOrdersTabVisibility({
      orderFeatures: { enquiries: true, sales_orders: true, invoices: false },
      salesOrdersFlag: true,
      estimatesFlag: false,
      invoicesFlag: true,
    });

    expect(visibility).toEqual({
      ready: true,
      orders: true,
      enquiries: false,
      invoices: false,
    });
  });
});

describe('resolveBuyerOrdersDefaultTab', () => {
  it('prefers invoices when available', () => {
    expect(
      resolveBuyerOrdersDefaultTab({
        ready: true,
        orders: true,
        enquiries: true,
        invoices: true,
      }),
    ).toBe(BUYER_ORDERS_DEFAULT_TAB);
  });

  it('falls back to orders then enquiries', () => {
    expect(
      resolveBuyerOrdersDefaultTab({
        ready: true,
        orders: true,
        enquiries: true,
        invoices: false,
      }),
    ).toBe('orders');

    expect(
      resolveBuyerOrdersDefaultTab({
        ready: true,
        orders: false,
        enquiries: true,
        invoices: false,
      }),
    ).toBe('enquiries');
  });
});
