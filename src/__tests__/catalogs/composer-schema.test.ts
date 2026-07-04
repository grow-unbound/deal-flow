import { describe, expect, it } from 'vitest';
import { CatalogComposerPayloadSchema } from '@/lib/zod';

const buyerId = '11111111-1111-4111-8111-111111111111';
const productId = '22222222-2222-4222-8222-222222222222';
const priceListId = '33333333-3333-4333-8333-333333333333';

describe('CatalogComposerPayloadSchema', () => {
  it('accepts campaign-local buyers, price list metadata, buyer note, and item price overrides', () => {
    const parsed = CatalogComposerPayloadSchema.safeParse({
      name: 'July campaign',
      scope_type: 'buyer',
      buyer_ids: [buyerId],
      valid_from: '2026-07-01T00:00:00.000Z',
      valid_to: '2026-07-31T23:59:59.000Z',
      message: 'Fresh prices for July',
      price_source: 'price_list',
      price_list_id: priceListId,
      filters: { brand_names: [], category_names: [], availability: 'show_everything' },
      tag_overrides: { [productId]: 'none' },
      items: [{ tenant_product_id: productId, display_order: 0, price_override: 725 }],
      save_mode: 'publish',
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.scope_type).toBe('buyer');
    expect(parsed.data.buyer_ids).toEqual([buyerId]);
    expect(parsed.data.price_list_id).toBe(priceListId);
    expect(parsed.data.items[0]?.price_override).toBe(725);
  });

  it('requires selected buyers for buyer-scoped campaigns and caps buyer note length', () => {
    const parsed = CatalogComposerPayloadSchema.safeParse({
      name: 'July campaign',
      scope_type: 'buyer',
      buyer_ids: [],
      valid_from: '2026-07-01T00:00:00.000Z',
      message: 'x'.repeat(51),
      price_source: 'manual',
      filters: { brand_names: [], category_names: [], availability: 'show_everything' },
      items: [{ tenant_product_id: productId, display_order: 0, price_override: 725 }],
      save_mode: 'draft',
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.map((issue) => issue.path.join('.'))).toEqual(
      expect.arrayContaining(['buyer_ids', 'message']),
    );
  });
});
