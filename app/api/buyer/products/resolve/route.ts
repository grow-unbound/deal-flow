import { NextRequest, NextResponse } from 'next/server';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { enrichBuyerProducts, resolveBuyerProductScopeContext } from '@/lib/server/buyer-product-data';
import { supabaseAdmin } from '@/lib/supabase';
import type { BuyerResolvedProductsResponse } from '@/types/buyer';

type ResolveBody = {
  items?: Array<{
    tenant_product_id: string;
    qty?: number;
  }>;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const profile = await requireBuyerAccessProfile(request);
    if (!profile?.context.tenant_id || !supabaseAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as ResolveBody;
    const rows = (body.items ?? []).filter((row) => row?.tenant_product_id?.trim());
    if (rows.length === 0) {
      return NextResponse.json({ items: [], missing_ids: [] } satisfies BuyerResolvedProductsResponse);
    }

    const context = await resolveBuyerProductScopeContext(supabaseAdmin as any, request, profile);
    const orderedIds = rows.map((row) => row.tenant_product_id);
    const qtyByProductId = new Map(
      rows.map((row) => [row.tenant_product_id, Math.max(1, Number(row.qty ?? 1))]),
    );

    const itemMap = await enrichBuyerProducts(supabaseAdmin as any, {
      tenantId: context.tenantId,
      buyerId: context.buyerId,
      tenantProductIds: orderedIds,
      allowedTenantBrandIds: context.allowedTenantBrandIds,
      inventoryWarehouseId: context.inventoryWarehouseId,
      qtyByProductId,
    });

    const items = orderedIds
      .map((id) => itemMap.get(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const missingIds = orderedIds.filter((id) => !itemMap.has(id));

    return NextResponse.json({
      items,
      missing_ids: missingIds,
    } satisfies BuyerResolvedProductsResponse);
  } catch (error) {
    console.error('[POST /api/buyer/products/resolve]', error);
    return NextResponse.json({ error: 'Failed to resolve buyer products' }, { status: 500 });
  }
}
