import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import type { BuyerCatalogItem } from '@/types/buyer';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { recordCampaignView } from '@/lib/server/campaign-engagement';
import { enrichBuyerProducts } from '@/lib/server/buyer-product-data';
import { getSelectedBuyerDeliveryFromRequest } from '@/lib/server/buyer-location-selection';
import { resolveNearestBuyerLocation } from '@/lib/server/buyer-routing';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ share_token: string }> }
) {
  const { share_token } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const db = supabaseAdmin;
  const profile = await requireBuyerAccessProfile(request).catch(() => null);

  // Resolve catalog by share_token — must be published and not deleted
  const { data: catalog, error: catalogError } = await db
    .schema('app')
    .from('campaigns')
    .select('id, name, tenant_id, status, valid_to')
    .eq('share_token', share_token)
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle();

  if (catalogError) {
    console.error('[GET /api/buyer/catalog/:share_token] catalog lookup error:', catalogError);
    return NextResponse.json({ error: 'Failed to load catalog' }, { status: 500 });
  }

  if (!catalog) {
    return NextResponse.json({ error: 'Catalog not found or not active' }, { status: 404 });
  }

  // Check if catalog is still valid (not expired)
  if (catalog.valid_to && new Date(catalog.valid_to).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Catalog has expired' }, { status: 404 });
  }

  // Fetch catalog items
  const { data: catalogItems, error: itemsError } = await db
    .schema('app')
    .from('campaign_items')
    .select('tenant_product_id, price_override, display_order, is_featured')
    .eq('campaign_id', catalog.id)
    .is('deleted_at', null)
    .order('display_order', { ascending: true });

  if (itemsError) {
    console.error('[GET /api/buyer/catalog/:share_token] items error:', itemsError);
    return NextResponse.json({ error: 'Failed to load catalog items' }, { status: 500 });
  }

  const items = (catalogItems ?? []) as Array<{
    tenant_product_id: string;
    price_override: number | null;
    display_order: number | null;
    is_featured: boolean | null;
  }>;
  const tenantProductIds = items.map((item) => item.tenant_product_id);

  if (tenantProductIds.length === 0) {
    return NextResponse.json({
      campaign_id: catalog.id,
      name: catalog.name,
      products_count: 0,
      items: [],
    });
  }

  const selectedDelivery = getSelectedBuyerDeliveryFromRequest(request);
  const resolvedRouting = await resolveNearestBuyerLocation(
    db as any,
    catalog.tenant_id,
    selectedDelivery,
  );
  const inventoryWarehouseId = resolvedRouting?.warehouseId ?? null;
  const itemMap = await enrichBuyerProducts(db as any, {
    tenantId: catalog.tenant_id,
    buyerId: profile?.buyer?.id ?? null,
    tenantProductIds,
    inventoryWarehouseId,
    campaignByProductId: new Map(
      items.map((item) => [item.tenant_product_id, {
        campaign_id: catalog.id,
        campaign_name: catalog.name,
        campaign_valid_until: catalog.valid_to,
        campaign_price: item.price_override,
        is_featured: Boolean(item.is_featured),
      }]),
    ),
  });

  const guestItems = tenantProductIds
    .map((id) => itemMap.get(id))
    .filter((item): item is BuyerCatalogItem => Boolean(item));

  if (profile?.buyer?.id) {
    void recordCampaignView(db, {
      tenantId: catalog.tenant_id,
      buyerId: profile.buyer.id,
      campaignId: catalog.id,
      source: 'guest_link',
    });
  }

  return NextResponse.json({
    campaign_id: catalog.id,
    name: catalog.name,
    valid_until: catalog.valid_to,
    products_count: guestItems.length,
    items: guestItems,
  });
}
