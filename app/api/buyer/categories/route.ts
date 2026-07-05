import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { BUYER_CACHE_CATALOG } from '@/lib/server/buyer-cache-headers';
import { fetchBuyerCategories, resolveBuyerProductScopeContext } from '@/lib/server/buyer-product-data';
import type { BuyerCategoriesResponse } from '@/types/buyer';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const profile = await requireBuyerAccessProfile(req);
    if (!profile?.context.tenant_id || !supabaseAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const context = await resolveBuyerProductScopeContext(supabaseAdmin as any, req, profile);
    const requestedCampaignId = req.nextUrl.searchParams.get('campaign_id')?.trim() ?? '';
    const shareToken = req.nextUrl.searchParams.get('share_token')?.trim() ?? '';
    const categories = await fetchBuyerCategories({
      db: supabaseAdmin as any,
      tenantId: context.tenantId,
      allowedTenantBrandIds: context.allowedTenantBrandIds,
      requestedCampaignId,
      shareToken,
    });

    return NextResponse.json({ categories } satisfies BuyerCategoriesResponse, { headers: BUYER_CACHE_CATALOG });
  } catch (err) {
    console.error('[GET /api/buyer/categories]', err);
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
  }
}
