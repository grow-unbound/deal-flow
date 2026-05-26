import { describe, it, expect } from 'vitest';
import { PriceListItemCreateSchema } from '@/lib/zod';

// Pure helper: selects the price for a given qty from a sorted tier list.
// Returns the price of the highest min_qty tier where min_qty <= qty
// (and max_qty is null or >= qty). Returns null if no tier matches.
function selectQtyBreakPrice(
  items: Array<{ price: number; min_qty: number; max_qty: number | null }>,
  qty: number,
): number | null {
  if (items.length === 0) return null;

  let matched: { price: number; min_qty: number; max_qty: number | null } | null = null;

  for (const item of items) {
    if (item.min_qty > qty) continue;
    if (item.max_qty !== null && item.max_qty < qty) continue;

    // Pick the highest min_qty that is still <= qty
    if (matched === null || item.min_qty > matched.min_qty) {
      matched = item;
    }
  }

  return matched !== null ? matched.price : null;
}

describe('PriceListItemCreateSchema', () => {
  it('requires tenant_product_id', () => {
    const result = PriceListItemCreateSchema.safeParse({
      price: 100,
      min_qty: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.errors.map((e) => e.path[0]);
      expect(fields).toContain('tenant_product_id');
    }
  });

  it('rejects invalid uuid for tenant_product_id', () => {
    const result = PriceListItemCreateSchema.safeParse({
      tenant_product_id: 'not-a-uuid',
      price: 100,
      min_qty: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toBe('Invalid product ID');
    }
  });

  it('requires price > 0', () => {
    const result = PriceListItemCreateSchema.safeParse({
      tenant_product_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      price: 0,
      min_qty: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.errors.map((e) => e.message);
      expect(messages.some((m) => m.toLowerCase().includes('price'))).toBe(true);
    }
  });

  it('rejects negative price', () => {
    const result = PriceListItemCreateSchema.safeParse({
      tenant_product_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      price: -50,
      min_qty: 1,
    });
    expect(result.success).toBe(false);
  });

  it('defaults min_qty to 1', () => {
    const result = PriceListItemCreateSchema.safeParse({
      tenant_product_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      price: 99.99,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.min_qty).toBe(1);
    }
  });

  it('accepts optional nullable max_qty', () => {
    const result = PriceListItemCreateSchema.safeParse({
      tenant_product_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      price: 75,
      min_qty: 10,
      max_qty: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_qty).toBeNull();
    }
  });

  it('coerces string price to number', () => {
    const result = PriceListItemCreateSchema.safeParse({
      tenant_product_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      price: '149.50',
      min_qty: '5',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.price).toBe(149.5);
      expect(result.data.min_qty).toBe(5);
    }
  });
});

describe('selectQtyBreakPrice', () => {
  const items = [
    { price: 100, min_qty: 1, max_qty: null },
    { price: 90, min_qty: 10, max_qty: null },
    { price: 80, min_qty: 50, max_qty: null },
  ];

  it('returns base tier for qty=1', () => {
    expect(selectQtyBreakPrice(items, 1)).toBe(100);
  });

  it('returns base tier for qty=9', () => {
    expect(selectQtyBreakPrice(items, 9)).toBe(100);
  });

  it('returns 10+ tier for qty=10', () => {
    expect(selectQtyBreakPrice(items, 10)).toBe(90);
  });

  it('returns 10+ tier for qty=12', () => {
    expect(selectQtyBreakPrice(items, 12)).toBe(90);
  });

  it('returns 50+ tier for qty=50', () => {
    expect(selectQtyBreakPrice(items, 50)).toBe(80);
  });

  it('returns 50+ tier for qty=100', () => {
    expect(selectQtyBreakPrice(items, 100)).toBe(80);
  });

  it('returns null for empty items', () => {
    expect(selectQtyBreakPrice([], 5)).toBeNull();
  });

  it('returns null when qty is less than the lowest min_qty', () => {
    const strictItems = [{ price: 200, min_qty: 5, max_qty: null }];
    expect(selectQtyBreakPrice(strictItems, 3)).toBeNull();
  });

  it('respects max_qty upper bound', () => {
    const boundedItems = [
      { price: 100, min_qty: 1, max_qty: 9 },
      { price: 90, min_qty: 10, max_qty: 49 },
      { price: 80, min_qty: 50, max_qty: null },
    ];
    // qty=5 falls within first tier (max_qty=9)
    expect(selectQtyBreakPrice(boundedItems, 5)).toBe(100);
    // qty=25 falls within second tier (max_qty=49)
    expect(selectQtyBreakPrice(boundedItems, 25)).toBe(90);
    // qty=60 falls within third tier (max_qty=null)
    expect(selectQtyBreakPrice(boundedItems, 60)).toBe(80);
  });
});
