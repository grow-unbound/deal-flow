import { NextRequest, NextResponse } from 'next/server';

import { assembleBuyerCatalogItemsForProductIds } from '@/lib/server/buyer-assemble-catalog-items';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { resolveBuyerAllowedTenantBrandIds } from '@/lib/server/buyer-brand-visibility';
import { supabaseAdmin } from '@/lib/supabase';
import type { BuyerCatalogItem } from '@/types/buyer';
import type { CartBundle, CartBundleSlot, CartBundlesResponse } from '@/types/buyer-reco';

export const dynamic = 'force-dynamic';

export type { CartBundle, CartBundleSlot, CartBundlesResponse };

const EMPTY: CartBundlesResponse = { bundles: [] };

export async function GET(request: NextRequest): Promise<NextResponse<CartBundlesResponse | { error: string }>> {
  const profile = await requireBuyerAccessProfile(request);
  if (!profile?.context.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const tenantId = profile.context.tenant_id!;
  const buyerId = profile.buyer?.id ?? null;

  try {
    // Fetch bundle definitions with top_product_id per slot from the pre-computed RPC
    const { data: rpcData, error: rpcErr } = await supabaseAdmin
      .schema('app')
      .rpc('reco_get_cart_bundles', { p_tenant_id: tenantId });

    if (rpcErr) throw new Error(rpcErr.message);

    const rawBundles = (rpcData as { bundles?: any[] } | null)?.bundles ?? [];
    if (rawBundles.length === 0) return NextResponse.json(EMPTY);

    // Collect all top_product_ids across all slots for a single enrichment round-trip
    const allProductIds = Array.from(
      new Set(
        rawBundles
          .flatMap((b: any) => b.slots ?? [])
          .map((s: any) => s.top_product_id)
          .filter(Boolean),
      ),
    );

    const allowedTenantBrandIds = buyerId
      ? await resolveBuyerAllowedTenantBrandIds(supabaseAdmin as any, tenantId, buyerId)
      : [];

    const enriched =
      allProductIds.length > 0
        ? await assembleBuyerCatalogItemsForProductIds(supabaseAdmin as any, {
            tenantId,
            buyerId,
            productIds: allProductIds,
            allowedTenantBrandIds,
            campaignId: null,
            campaignName: null,
            campaignValidUntil: null,
            priceOverrides: new Map(),
          })
        : new Map<string, BuyerCatalogItem>();

    const bundles: CartBundle[] = rawBundles.map((b: any) => ({
      id: b.id,
      name: b.name,
      slots: (b.slots ?? []).map((s: any) => ({
        tenant_category_id: s.tenant_category_id,
        slot_label: s.slot_label ?? null,
        is_required: s.is_required ?? true,
        display_order: s.display_order ?? 0,
        top_product: s.top_product_id ? (enriched.get(s.top_product_id) ?? null) : null,
      })),
    }));

    return NextResponse.json({ bundles });
  } catch (error) {
    console.error('[GET /api/buyer/reco/cart-bundles]', error);
    // Non-critical — return empty rather than 500
    return NextResponse.json(EMPTY);
  }
}
