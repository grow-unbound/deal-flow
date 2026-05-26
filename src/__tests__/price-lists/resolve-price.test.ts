import { describe, it, expect } from 'vitest';

// Mock the resolution logic as a pure function to test each tier
function resolvePrice(
  items: Array<{ tier: 'catalog_override' | 'buyer' | 'cohort' | 'all_buyers' | 'base'; price: number; priority?: number; min_qty?: number; is_active?: boolean; valid_to?: Date | null }>,
  qty: number = 1,
  now: Date = new Date()
): number | null {
  // Tier 1: catalog override
  const catalogOverride = items.find(i => i.tier === 'catalog_override');
  if (catalogOverride) return catalogOverride.price;

  // Tier 2: buyer
  const buyerItems = items
    .filter(i => i.tier === 'buyer' && (i.is_active !== false) && (!i.valid_to || i.valid_to > now) && (i.min_qty ?? 1) <= qty)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  if (buyerItems.length > 0) return buyerItems[0].price;

  // Tier 3: cohort
  const cohortItems = items
    .filter(i => i.tier === 'cohort' && (i.is_active !== false) && (!i.valid_to || i.valid_to > now) && (i.min_qty ?? 1) <= qty)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  if (cohortItems.length > 0) return cohortItems[0].price;

  // Tier 4: all_buyers
  const allBuyerItems = items
    .filter(i => i.tier === 'all_buyers' && (i.is_active !== false) && (!i.valid_to || i.valid_to > now) && (i.min_qty ?? 1) <= qty)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  if (allBuyerItems.length > 0) return allBuyerItems[0].price;

  // Tier 5: base
  const base = items.find(i => i.tier === 'base');
  return base?.price ?? null;
}

describe('resolve_price logic', () => {
  it('returns catalog price_override first', () => {
    const items = [
      { tier: 'catalog_override' as const, price: 50 },
      { tier: 'buyer' as const, price: 80 },
      { tier: 'base' as const, price: 100 },
    ];
    expect(resolvePrice(items)).toBe(50);
  });

  it('falls through to buyer tier when no catalog override', () => {
    const items = [
      { tier: 'buyer' as const, price: 75, priority: 1, min_qty: 1, is_active: true, valid_to: null },
      { tier: 'base' as const, price: 100 },
    ];
    expect(resolvePrice(items)).toBe(75);
  });

  it('falls through to cohort tier when no buyer price', () => {
    const items = [
      { tier: 'cohort' as const, price: 85, priority: 1, min_qty: 1, is_active: true, valid_to: null },
      { tier: 'base' as const, price: 100 },
    ];
    expect(resolvePrice(items)).toBe(85);
  });

  it('falls through to all_buyers tier', () => {
    const items = [
      { tier: 'all_buyers' as const, price: 90, priority: 0, min_qty: 1, is_active: true, valid_to: null },
      { tier: 'base' as const, price: 100 },
    ];
    expect(resolvePrice(items)).toBe(90);
  });

  it('falls through to base_selling_price', () => {
    expect(resolvePrice([{ tier: 'base' as const, price: 100 }])).toBe(100);
  });

  it('returns null when no price set', () => {
    expect(resolvePrice([])).toBeNull();
  });

  it('excludes expired price lists', () => {
    const yesterday = new Date(Date.now() - 86400000);
    const items = [
      { tier: 'buyer' as const, price: 75, priority: 1, min_qty: 1, is_active: true, valid_to: yesterday },
      { tier: 'base' as const, price: 100 },
    ];
    expect(resolvePrice(items)).toBe(100);
  });

  it('higher priority buyer list wins over lower priority', () => {
    const items = [
      { tier: 'buyer' as const, price: 70, priority: 10, min_qty: 1, is_active: true, valid_to: null },
      { tier: 'buyer' as const, price: 80, priority: 1, min_qty: 1, is_active: true, valid_to: null },
      { tier: 'base' as const, price: 100 },
    ];
    expect(resolvePrice(items)).toBe(70);
  });

  it('qty-break: skips tiers where min_qty > qty', () => {
    const items = [
      { tier: 'buyer' as const, price: 60, priority: 1, min_qty: 10, is_active: true, valid_to: null },
      { tier: 'base' as const, price: 100 },
    ];
    expect(resolvePrice(items, 5)).toBe(100);
    expect(resolvePrice(items, 10)).toBe(60);
  });
});
