import type { BuyerHomePromotionsResponse } from '@/lib/buyer-home-types';
import { getVisibleBuyerCatalogs } from '@/lib/server/buyer-access';
import type { SupabaseClient } from '@supabase/supabase-js';

const PROMOTIONS_PREVIEW_LIMIT = 5;

export async function loadBuyerHomePromotions(
  db: SupabaseClient,
  tenantId: string,
  buyerId: string,
): Promise<BuyerHomePromotionsResponse> {
  const visibleCatalogs = await getVisibleBuyerCatalogs(tenantId, buyerId);
  const catalogIds = visibleCatalogs.map((catalog) => catalog.id);
  const countByCatalog = new Map<string, number>();

  if (catalogIds.length > 0) {
    const itemsRes = await db
      .schema('app')
      .from('campaign_items')
      .select('campaign_id, campaigns!inner(tenant_id)')
      .eq('campaigns.tenant_id', tenantId)
      .in('campaign_id', catalogIds)
      .is('deleted_at', null);

    if (itemsRes.error) {
      throw new Error(itemsRes.error.message);
    }

    for (const row of (itemsRes.data ?? []) as Array<{ campaign_id: string }>) {
      countByCatalog.set(row.campaign_id, (countByCatalog.get(row.campaign_id) ?? 0) + 1);
    }
  }

  return {
    latest_promotions_preview: visibleCatalogs
      .slice(0, PROMOTIONS_PREVIEW_LIMIT)
      .map((catalog) => ({
        id: catalog.id,
        name: catalog.name,
        product_count: countByCatalog.get(catalog.id) ?? 0,
        share_token: catalog.share_token,
        valid_until: catalog.valid_to,
        hero_image_url: catalog.hero_image_url ?? null,
      })),
  };
}
