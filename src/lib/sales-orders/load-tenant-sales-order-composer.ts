import type { SalesOrderComposerDocument, SalesOrderComposerLineInput } from '@/types/sales-order-composer';

import type { JWTClaims } from '@/lib/auth';
import { isoDateInTimeZone } from '@/lib/date-utils';
import {
  canAccessDocumentLocation,
  loadAccessibleSellerLocations,
  resolveDefaultSellerLocationId,
} from '@/lib/server/seller-location-access';
import { loadInventoryAvailabilityMap } from '@/lib/server/warehouse-inventory';
import { loadBuyerCreditSnapshot } from '@/lib/server/buyer-credit';
import { computePlaceOfSupplyFromBuyer } from '@/lib/sales-orders/compute-place-of-supply';
import { getAuthUserDisplayNameMap } from '@/lib/server/auth-user-directory';
import { computeLineTaxableAmount } from '@/lib/gst';
import { productDisplayName } from '@/lib/sales-orders/tenant-order-detail';

type DbClient = {
  schema: (name: string) => Record<string, (...args: unknown[]) => Promise<unknown>>;
};

function formatAddress(geography: Record<string, unknown> | null | undefined): string {
  const parts = [
    typeof geography?.city === 'string' ? geography.city : null,
    typeof geography?.state === 'string' ? geography.state : null,
    typeof geography?.pincode === 'string' ? geography.pincode : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Address not available';
}

/**
 * Load sales order as composer payload (includes `draft` rows; detail loader hides drafts).
 */
export async function loadTenantSalesOrderComposer(
  db: DbClient,
  tenantId: string,
  orderId: string,
  viewerClaims?: Pick<JWTClaims, 'role' | 'location_ids'> | null,
): Promise<'notfound' | 'forbidden' | SalesOrderComposerDocument> {
  const d = db as any;

  const { data: orderRow, error: orderError } = await d
    .schema('app')
    .from('orders')
    .select(
      [
        'id',
        'tenant_id',
        'location_id',
        'buyer_id',
        'order_number',
        'status',
        'order_date',
        'placed_at',
        'subtotal',
        'tax_amount',
        'total_amount',
        'currency',
        'notes',
        'estimate_id',
        'buyer_po_ref',
        'place_of_supply',
        'discount_flat',
        'freight',
        'round_off',
        'has_backorder',
        'expected_delivery',
        'created_by',
        'placed_by',
      ].join(', '),
    )
    .eq('id', orderId)
    .is('deleted_at', null)
    .maybeSingle();

  if (orderError || !orderRow) return 'notfound';
  const order = orderRow as Record<string, unknown>;
  if (order.tenant_id !== tenantId) return 'forbidden';
  if (viewerClaims && !canAccessDocumentLocation(viewerClaims, order.location_id)) return 'forbidden';

  const buyerId = typeof order.buyer_id === 'string' ? order.buyer_id : null;
  const estimateId = typeof order.estimate_id === 'string' ? order.estimate_id : null;
  const locationId = typeof order.location_id === 'string' ? order.location_id : null;
  const effectiveClaims = viewerClaims ?? { role: 'seller_admin', location_ids: null };
  const availableLocations = await loadAccessibleSellerLocations(d, tenantId, effectiveClaims);
  const defaultLocationId = resolveDefaultSellerLocationId(effectiveClaims, availableLocations);
  const locationRes = locationId
    ? await d.schema('app').from('locations').select('name').eq('tenant_id', tenantId).eq('id', locationId).is('deleted_at', null).maybeSingle()
    : { data: null, error: null };
  if (locationRes.error) throw locationRes.error;

  const { data: itemRowsRaw, error: itemsError } = await d
    .schema('app')
    .from('order_items')
    .select('id, tenant_product_id, qty, unit_price, tax_rate, line_total, disc_pct, tax_pct, item_order, scheme_tag, on_hand_at_confirm')
    .eq('order_id', orderId)
    .is('deleted_at', null);

  if (itemsError) {
    console.error('[loadTenantSalesOrderComposer] items', itemsError);
    return 'notfound';
  }

  const itemRows = (itemRowsRaw ?? []) as Array<Record<string, unknown>>;

  const productIds = Array.from(
    new Set(itemRows.map((row) => row.tenant_product_id).filter((value): value is string => typeof value === 'string')),
  );

  const { data: tenantProducts } =
    productIds.length > 0
      ? await d
          .schema('app')
          .from('tenant_products')
          .select('id, internal_sku, name_override, master_product_id, tenant_brand_id, hsn_code, gst_rate, default_uom, pack_size, base_selling_price, mrp')
          .in('id', productIds)
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
      : { data: [] as Array<Record<string, unknown>> };

  const productMap = new Map((tenantProducts ?? []).map((row: Record<string, unknown>) => [row.id as string, row]));
  const inventoryMap = await loadInventoryAvailabilityMap(d, productIds, locationId);

  const masterProductIds = Array.from(
    new Set(
      (tenantProducts ?? [])
        .map((row: Record<string, unknown>) => row.master_product_id)
        .filter((value: unknown): value is string => typeof value === 'string'),
    ),
  );
  const brandIds = Array.from(
    new Set(
      (tenantProducts ?? [])
        .map((row: Record<string, unknown>) => row.tenant_brand_id)
        .filter((value: unknown): value is string => typeof value === 'string'),
    ),
  );

  const [masterProductsRes, tenantBrandsRes, tenantRes] = await Promise.all([
    masterProductIds.length > 0
      ? d.schema('catalog').from('products').select('id, name, master_sku, hsn_code, gst_rate, default_uom, pack_size').in('id', masterProductIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    brandIds.length > 0
      ? d.schema('app').from('tenant_brands').select('id, display_name_override, master_brand_id').in('id', brandIds).eq('tenant_id', tenantId)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    d.schema('app').from('tenants').select('id, primary_state').eq('id', tenantId).maybeSingle(),
  ]);

  const masterBrandIds = Array.from(
    new Set(
      ((tenantBrandsRes.data ?? []) as Array<Record<string, unknown>>)
        .map((row) => row.master_brand_id)
        .filter((value): value is string => typeof value === 'string'),
    ),
  );
  const { data: masterBrands } =
    masterBrandIds.length > 0
      ? await d.schema('catalog').from('brands').select('id, name').in('id', masterBrandIds)
      : { data: [] as Array<Record<string, unknown>> };

  const masterProductMap = new Map(((masterProductsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => [row.id as string, row]));
  const tenantBrandMap = new Map(((tenantBrandsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => [row.id as string, row]));
  const masterBrandMap = new Map(((masterBrands ?? []) as Array<Record<string, unknown>>).map((row) => [row.id as string, row.name as string]));

  const items: SalesOrderComposerLineInput[] = itemRows.map((row, index) => {
    const product = productMap.get(row.tenant_product_id as string) as Record<string, unknown> | undefined;
    const master = product?.master_product_id ? masterProductMap.get(product.master_product_id as string) : undefined;
    const tenantBrand = product?.tenant_brand_id ? tenantBrandMap.get(product.tenant_brand_id as string) : undefined;
    const brandName =
      (tenantBrand?.display_name_override as string | null | undefined)?.trim()
      || (tenantBrand?.master_brand_id ? masterBrandMap.get(tenantBrand.master_brand_id as string) : undefined)
      || 'Brand';
    const displayName = productDisplayName(
      (product?.name_override as string | null | undefined) ?? null,
      (master?.name as string | null | undefined) ?? null,
    );
    const sku = (product?.internal_sku as string | undefined) ?? (master?.master_sku as string | undefined) ?? '—';
    const hsn = (product?.hsn_code as string | null | undefined) ?? (master?.hsn_code as string | null | undefined) ?? null;
    const taxPct = Number(row.tax_pct ?? row.tax_rate ?? product?.gst_rate ?? master?.gst_rate ?? 0);
    const onHand = inventoryMap.get(row.tenant_product_id as string) ?? 0;
    const initials =
      brandName
        .split(/\s+/)
        .filter(Boolean)
        .map((p) => p[0] ?? '')
        .join('')
        .slice(0, 2)
        .toUpperCase() || '—';
    const hue = (['teal', 'ember', 'cream'][index % 3] ?? 'teal') as 'teal' | 'ember' | 'cream';
    const lineTotal = computeLineTaxableAmount({
      qty: Number(row.qty ?? 0),
      unit_price: Number(row.unit_price ?? 0),
      disc_pct: Number(row.disc_pct ?? 0),
    });
    return {
      id: String(row.id),
      tenant_product_id: String(row.tenant_product_id),
      product_name: displayName,
      sku,
      brand_name: brandName,
      brand_initials: initials,
      brand_hue: hue,
      hsn_code: hsn,
      on_hand: onHand,
      qty: Number(row.qty ?? 0),
      unit_price: Number(row.unit_price ?? 0),
      mrp: Number(product?.mrp ?? 0),
      base_selling_price: Number(product?.base_selling_price ?? 0),
      disc_pct: Number(row.disc_pct ?? 0),
      tax_pct: taxPct,
      line_total: lineTotal,
      item_order: Number(row.item_order ?? index + 1),
      scheme_tag: (row.scheme_tag as string | null | undefined) ?? null,
    };
  });

  const buyerRes = buyerId
    ? await d
        .schema('app')
        .from('buyers')
        .select('id, business_name, contact_name, phone, email, gstin, geography, credit_limit, payment_terms_days')
        .eq('tenant_id', tenantId)
        .eq('id', buyerId)
        .is('deleted_at', null)
        .maybeSingle()
    : { data: null, error: null };

  const buyer = buyerRes.data as Record<string, unknown> | null;
  const geo = (buyer?.geography as Record<string, unknown> | null | undefined) ?? null;
  const placeOfSupply = computePlaceOfSupplyFromBuyer(geo, (buyer?.gstin as string | null | undefined) ?? null);

  const creditLimit = Number(buyer?.credit_limit ?? 0);
  const creditSnapshot = buyerId
    ? await loadBuyerCreditSnapshot(d as any, { tenantId, buyerId, creditLimit })
    : null;
  const creditUsed = creditSnapshot?.credit_used ?? 0;
  const creditAvailable = creditSnapshot?.available_credit ?? creditLimit;

  const cohortRows = buyerId
    ? await d.schema('app').from('cohort_members').select('cohort_id').eq('buyer_id', buyerId)
    : { data: [] as Array<Record<string, unknown>> };
  const cohortIds = ((cohortRows.data ?? []) as Array<Record<string, unknown>>).map((row) => row.cohort_id as string);
  const assignmentRows = buyerId
    ? await d
        .schema('app')
        .from('price_list_assignments')
        .select('price_list_id, target_type, target_id')
        .or(
          cohortIds.length > 0
            ? `and(target_type.eq.buyer,target_id.eq.${buyerId}),and(target_type.eq.cohort,target_id.in.(${cohortIds.join(',')})),target_type.eq.all_buyers`
            : `and(target_type.eq.buyer,target_id.eq.${buyerId}),target_type.eq.all_buyers`,
        )
        .is('deleted_at', null)
    : { data: [] as Array<Record<string, unknown>> };

  let activePricelist: { id: string; name: string } | null = null;
  const sortedAssignments = ((assignmentRows.data ?? []) as Array<Record<string, unknown>>).sort((a, b) => {
    const prio = ['buyer', 'cohort', 'all_buyers'];
    return prio.indexOf(String(a.target_type)) - prio.indexOf(String(b.target_type));
  });
  if (sortedAssignments[0]?.price_list_id) {
    const { data } = await d
      .schema('app')
      .from('price_lists')
      .select('id, name')
      .eq('id', sortedAssignments[0].price_list_id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (data) {
      activePricelist = { id: data.id as string, name: data.name as string };
    }
  }

  const authorId =
    (typeof order.created_by === 'string' && order.created_by)
      ? order.created_by
      : (typeof order.placed_by === 'string' ? order.placed_by : null);
  const salesAgentName = authorId
    ? ((await getAuthUserDisplayNameMap([authorId])).get(authorId) ?? null)
    : null;

  const buyerContext = buyer
    ? {
        id: String(buyer.id),
        business_name: String(buyer.business_name ?? ''),
        contact_name: (buyer.contact_name as string | null | undefined) ?? null,
        phone: (buyer.phone as string | null | undefined) ?? null,
        email: (buyer.email as string | null | undefined) ?? null,
        gstin: (buyer.gstin as string | null | undefined) ?? null,
        bill_address: formatAddress(geo),
        city: (geo?.city as string | null | undefined) ?? null,
        state: (geo?.state as string | null | undefined) ?? null,
        pincode: (geo?.pincode as string | null | undefined) ?? null,
        place_of_supply: placeOfSupply,
        seller_state: (tenantRes.data?.primary_state as string | null | undefined) ?? null,
        payment_terms_days: Number(buyer.payment_terms_days ?? 0),
        credit_limit: creditLimit,
        credit_used: creditUsed,
        credit_available: creditAvailable,
        active_pricelist: activePricelist,
        sales_agent_name: salesAgentName,
      }
    : null;

  let sourceEstimateNumber: string | null = null;
  if (estimateId) {
    const { data: est } = await d.schema('app').from('estimates').select('estimate_number').eq('id', estimateId).maybeSingle();
    sourceEstimateNumber = (est?.estimate_number as string | null | undefined) ?? null;
  }

  const storedOrderDate = (order.order_date as string | null | undefined) ?? null;
  const placedAt = (order.placed_at as string | null | undefined) ?? null;
  const orderDate = storedOrderDate?.slice(0, 10) ?? (placedAt ? placedAt.slice(0, 10) : isoDateInTimeZone(new Date()));
  const expectedDelivery = order.expected_delivery
    ? String(order.expected_delivery).slice(0, 10)
    : orderDate;

  const notesText = (order.notes as string | null | undefined) ?? '';

  return {
    id: String(order.id),
    order_number: String(order.order_number ?? order.id),
    status: String(order.status ?? 'draft'),
    buyer_id: buyerId,
    location_id: locationId ?? defaultLocationId,
    location_name: (locationRes.data?.name as string | null | undefined) ?? null,
    available_locations: availableLocations,
    order_date: orderDate,
    expected_delivery: expectedDelivery,
    buyer_po_ref: String(order.buyer_po_ref ?? ''),
    place_of_supply: String((order.place_of_supply as string | null | undefined) ?? buyerContext?.place_of_supply ?? ''),
    seller_note: notesText,
    freight: Number(order.freight ?? 0),
    discount_flat: Number(order.discount_flat ?? 0),
    round_off: Number(order.round_off ?? 0),
    has_backorder: Boolean(order.has_backorder ?? false),
    estimate_id: estimateId,
    source_estimate_number: sourceEstimateNumber,
    buyer_context: buyerContext,
    items,
  };
}
