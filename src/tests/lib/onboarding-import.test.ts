import { describe, expect, it } from 'vitest';
import { runOnboardingImportChunk } from '@/lib/server/onboarding-import';
import type { OnboardingImportRow } from '@/lib/onboarding/types';

type UpsertCall = { payload: Record<string, unknown>; onConflict?: string };

function makeDb(opts: { existingSkus?: string[]; upsertCalls: UpsertCall[] }) {
  const existing = (opts.existingSkus ?? []).map((sku) => ({ internal_sku: sku }));
  const brands: Array<{ id: string; slug: string; display_name_override: string }> = [];
  const categories: Array<{ id: string; slug: string; name: string }> = [];

  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.eq = self;
    chain.is = self;
    chain.limit = async () => {
      if (table === 'tenant_brands') return { data: brands, error: null };
      if (table === 'tenant_categories') return { data: categories, error: null };
      if (table === 'tenant_products') return { data: existing, error: null };
      return { data: [], error: null };
    };
    chain.insert = (row: Record<string, unknown>) => {
      const id = `${table}-${Math.random().toString(16).slice(2)}`;
      if (table === 'tenant_brands') {
        brands.push({
          id,
          slug: String(row.slug),
          display_name_override: String(row.display_name_override),
        });
      }
      if (table === 'tenant_categories') {
        categories.push({ id, slug: String(row.slug), name: String(row.name) });
      }
      return {
        select: () => ({
          single: async () => ({ data: { id }, error: null }),
        }),
      };
    };
    chain.upsert = (payload: Record<string, unknown>, extra?: { onConflict?: string }) => {
      opts.upsertCalls.push({ payload, onConflict: extra?.onConflict });
      const sku = String(payload.internal_sku);
      if (!existing.some((r) => r.internal_sku === sku)) existing.push({ internal_sku: sku });
      return {
        select: () => ({
          single: async () => ({ data: { id: `prod-${sku}` }, error: null }),
        }),
      };
    };
    return chain;
  };

  return {
    schema: () => ({ from }),
  };
}

describe('runOnboardingImportChunk', () => {
  it('upserts on tenant_id,internal_sku and updates an existing SKU instead of skipping', async () => {
    const upsertCalls: UpsertCall[] = [];
    const db = makeDb({ existingSkus: ['A1'], upsertCalls });
    const row: OnboardingImportRow = {
      internal_sku: 'A1',
      name: 'Dome cam v2',
      brand: 'CP Plus',
      base_selling_price: 1200,
      gst_rate: 18,
    };

    const first = await runOnboardingImportChunk(db as never, 'tenant-1', 'user-1', [row], true);
    expect(first.updated).toBe(1);
    expect(first.imported).toBe(0);
    expect(upsertCalls[0]?.onConflict).toBe('tenant_id,internal_sku');
    expect(upsertCalls[0]?.payload.name_override).toBe('Dome cam v2');
    expect(upsertCalls[0]?.payload.tenant_brand_id).toBeTruthy();
  });

  it('creates the Unbranded brand when brand is blank', async () => {
    const upsertCalls: UpsertCall[] = [];
    const db = makeDb({ upsertCalls });

    const result = await runOnboardingImportChunk(
      db as never,
      'tenant-1',
      'user-1',
      [{ internal_sku: 'B1', name: 'Generic' }],
      true,
    );

    expect(result.imported).toBe(1);
    expect(upsertCalls[0]?.payload.tenant_brand_id).toBeTruthy();
  });
});
