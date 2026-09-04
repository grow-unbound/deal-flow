import { describe, expect, it } from 'vitest';
import { compareWinningPriceLists, priceListsEqual } from '@/lib/buy-as';

describe('priceListsEqual', () => {
  it('treats null and undefined as the same base-rate list', () => {
    expect(priceListsEqual(null, undefined)).toBe(true);
    expect(priceListsEqual('pl-1', 'pl-1')).toBe(true);
    expect(priceListsEqual('pl-1', 'pl-2')).toBe(false);
  });
});

describe('compareWinningPriceLists', () => {
  it('matches when both buyers resolve to the same list or base rate', () => {
    expect(compareWinningPriceLists(
      { price_list_id: null },
      { price_list_id: null },
    )).toBe(true);

    expect(compareWinningPriceLists(
      { price_list_id: 'pl-1' },
      { price_list_id: 'pl-1' },
    )).toBe(true);

    expect(compareWinningPriceLists(
      { price_list_id: 'pl-1' },
      { price_list_id: 'pl-2' },
    )).toBe(false);
  });
});
