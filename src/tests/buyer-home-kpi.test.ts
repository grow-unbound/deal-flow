import { describe, expect, it } from 'vitest';

import {
  buyerHomeDemandCountLabel,
  buyerHomeDemandHref,
  buyerHomeDemandTitle,
} from '@/lib/buyer-home-kpi';

describe('buyer home kpi helpers', () => {
  it('labels demand from demand_kind', () => {
    expect(buyerHomeDemandTitle('estimates')).toBe('Estimates this quarter');
    expect(buyerHomeDemandTitle('orders')).toBe('Orders this quarter');
    expect(buyerHomeDemandTitle('none')).toBe('Demand this quarter');
    expect(buyerHomeDemandCountLabel('orders', 3)).toBe('3 orders');
    expect(buyerHomeDemandCountLabel('estimates', 1)).toBe('1 estimate');
    expect(buyerHomeDemandHref('estimates')).toBe('/buy/orders?tab=enquiries');
    expect(buyerHomeDemandHref('orders')).toBe('/buy/orders?tab=orders');
  });
});
