import { computePlaceOfSupplyFromBuyer } from '@/lib/sales-orders/compute-place-of-supply';
import type { JWTClaims } from '@/lib/auth';
import {
  canAccessDocumentLocation,
  loadAccessibleSellerLocations,
  resolveDefaultSellerLocationId,
} from '@/lib/server/seller-location-access';
import { loadBuyerCreditSnapshot } from '@/lib/server/buyer-credit';
import { getAuthUserDisplayNameMap } from '@/lib/server/auth-user-directory';
import type { EstimateComposerBuyerContext } from '@/types/estimate-composer';
import type { InvoiceComposerDocument, InvoiceComposerLineInput } from '@/types/invoice-composer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

export type LoadInvoiceResult = {
  composerPayload: InvoiceComposerDocument;
};

function isoDateValue(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  return value.slice(0, 10);
}

export async function loadInvoiceDocument(
  db: DbClient,
  tenantId: string,
  id: string,
  _viewerRole: string | null,
  viewerClaims?: Pick<JWTClaims, 'role' | 'location_ids'> | null,
): Promise<null | 'forbidden' | LoadInvoiceResult> {
  const invoiceRes = await db
    .schema('app')
    .from('invoices')
    .select(
      'id, tenant_id, location_id, buyer_id, order_id, estimate_id, invoice_number, status, invoice_date, due_date, sent_at, sent_channel, subtotal, tax_amount, total_amount, discount_flat, freight, round_off, buyer_po_ref, notes, created_at, created_by, place_of_supply',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (invoiceRes.error) throw invoiceRes.error;
  if (!invoiceRes.data) return null;
  const inv = invoiceRes.data as Record<string, unknown>;
  if (inv.tenant_id !== tenantId) return 'forbidden';
  if (viewerClaims && !canAccessDocumentLocation(viewerClaims, inv.location_id)) return 'forbidden';

  const buyerId = typeof inv.buyer_id === 'string' ? inv.buyer_id : null;
  const effectiveClaims = viewerClaims ?? { role: 'seller_admin', location_ids: null };
  const availableLocations = await loadAccessibleSellerLocations(db, tenantId, effectiveClaims);
  const defaultLocationId = resolveDefaultSellerLocationId(effectiveClaims, availableLocations);

  const [buyerRes, itemsRes, tenantRes] = await Promise.all([
    buyerId
      ? db
          .schema('app')
          .from('buyers')
          .select('id, business_name, contact_name, phone, email, gstin, geography, credit_limit, payment_terms_days')
          .eq('tenant_id', tenantId)
          .eq('id', buyerId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db
      .schema('app')
      .from('invoice_items')
      .select('id, tenant_product_id, sku, qty, unit_price, disc_pct, tax_pct, line_total, scheme_tag')
      .eq('invoice_id', id)
      .is('deleted_at', null),
    db.schema('app').from('tenants').select('id, primary_state').eq('id', tenantId).maybeSingle(),
  ]);

  if (buyerRes.error || itemsRes.error || tenantRes.error) {
    throw buyerRes.error || itemsRes.error || tenantRes.error;
  }

  const buyer = buyerRes.data as Record<string, unknown> | null;
  const itemRows = (itemsRes.data ?? []) as Array<Record<string, unknown>>;

  const productIds = Array.from(
    new Set(
      itemRows
        .map((row) => row.tenant_product_id)
        .filter((value): value is string => typeof value === 'string'),
    ),
  );

  const { data: tenantProducts } =
    productIds.length > 0
      ? await db
          .schema('app')
          .from('tenant_products')
          .select('id, internal_sku, name_override, master_product_id, tenant_brand_id, hsn_code, gst_rate, default_uom, pack_size, base_selling_price, mrp')
          .in('id', productIds)
          .eq('tenant_id', tenantId)
      : { data: [] as Array<Record<string, unknown>> };

  const inventoryRows =
    productIds.length > 0
      ? await db
          .schema('app')
          .from('tenant_inventory')
          .select('tenant_product_id, qty_available')
          .in('tenant_product_id', productIds)
      : { data: [] as Array<Record<string, unknown>> };

  const productMap = new Map(
    ((tenantProducts ?? []) as Array<Record<string, unknown>>).map((row) => [row.id as string, row]),
  );
  const inventoryMap = new Map<string, number>();
  for (const row of (inventoryRows.data ?? []) as Array<Record<string, unknown>>) {
    inventoryMap.set(
      row.tenant_product_id as string,
      (inventoryMap.get(row.tenant_product_id as string) ?? 0) + Number(row.qty_available ?? 0),
    );
  }

  const masterProductIds = Array.from(
    new Set(
      ((tenantProducts ?? []) as Array<Record<string, unknown>>)
        .map((row) => row.master_product_id)
        .filter((value): value is string => typeof value === 'string'),
    ),
  );
  const brandIds = Array.from(
    new Set(
      ((tenantProducts ?? []) as Array<Record<string, unknown>>)
        .map((row) => row.tenant_brand_id)
        .filter((value): value is string => typeof value === 'string'),
    ),
  );

  const [masterProductsRes, tenantBrandsRes] = await Promise.all([
    masterProductIds.length > 0
      ? db.schema('catalog').from('products').select('id, name, master_sku, hsn_code, gst_rate, default_uom, pack_size').in('id', masterProductIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    brandIds.length > 0
      ? db.schema('app').from('tenant_brands').select('id, display_name_override, master_brand_id').in('id', brandIds).eq('tenant_id', tenantId)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
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
      ? await db.schema('catalog').from('brands').select('id, name').in('id', masterBrandIds)
      : { data: [] as Array<Record<string, unknown>> };

  const masterProductMap = new Map(
    ((masterProductsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => [row.id as string, row]),
  );
  const tenantBrandMap = new Map(
    ((tenantBrandsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => [row.id as string, row]),
  );
  const masterBrandMap = new Map(
    ((masterBrands ?? []) as Array<Record<string, unknown>>).map((row) => [row.id as string, row.name as string]),
  );

  const composerItems: InvoiceComposerLineInput[] = itemRows.map((row, index) => {
    const product = productMap.get(row.tenant_product_id as string) as Record<string, unknown> | undefined;
    const master = product?.master_product_id ? masterProductMap.get(product.master_product_id as string) : undefined;
    const tenantBrand = product?.tenant_brand_id ? tenantBrandMap.get(product.tenant_brand_id as string) : undefined;
    const brandName =
      (tenantBrand?.display_name_override as string | null | undefined)?.trim()
      || (tenantBrand?.master_brand_id ? masterBrandMap.get(tenantBrand.master_brand_id as string) : undefined)
      || 'Brand';
    return {
      id: row.id as string,
      tenant_product_id: row.tenant_product_id as string,
      product_name:
        (product?.name_override as string | null | undefined)?.trim()
        || (master?.name as string | undefined)
        || (product?.internal_sku as string | undefined)
        || 'Product',
      sku: (product?.internal_sku as string) ?? ((master?.master_sku as string | undefined) ?? '—'),
      brand_name: brandName,
      brand_initials: brandName.split(' ').map((part) => part[0] ?? '').join('').slice(0, 2).toUpperCase(),
      brand_hue: (['teal', 'ember', 'cream'][index % 3] ?? 'teal') as 'teal' | 'ember' | 'cream',
      hsn_code: (product?.hsn_code as string | null | undefined) ?? ((master?.hsn_code as string | null | undefined) ?? null),
      on_hand: inventoryMap.get(row.tenant_product_id as string) ?? 0,
      qty: Number(row.qty ?? 0),
      unit_price: Number(row.unit_price ?? 0),
      mrp: Number(product?.mrp ?? 0),
      base_selling_price: Number(product?.base_selling_price ?? 0),
      disc_pct: Number(row.disc_pct ?? 0),
      tax_pct: Number(row.tax_pct ?? product?.gst_rate ?? master?.gst_rate ?? 0),
      line_total: Number(row.line_total ?? 0),
      scheme_tag: (row.scheme_tag as string | null | undefined) ?? null,
    };
  });

  const creditLimit = Number(buyer?.credit_limit ?? 0);
  const creditSnapshot = buyerId
    ? await loadBuyerCreditSnapshot(db as any, { tenantId, buyerId, creditLimit })
    : null;
  const creditUsed = creditSnapshot?.credit_used ?? 0;
  const creditAvailable = creditSnapshot?.available_credit ?? creditLimit;

  const cohortRows = buyerId
    ? await db.schema('app').from('cohort_members').select('cohort_id').eq('buyer_id', buyerId)
    : { data: [] as Array<Record<string, unknown>> };
  const cohortIds = ((cohortRows.data ?? []) as Array<Record<string, unknown>>).map((row) => row.cohort_id as string);

  const assignmentRows = buyerId
    ? await db
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
    const order = ['buyer', 'cohort', 'all_buyers'];
    return order.indexOf(String(a.target_type)) - order.indexOf(String(b.target_type));
  });
  if (sortedAssignments[0]?.price_list_id) {
    const { data: plRow } = await db
      .schema('app')
      .from('price_lists')
      .select('id, name')
      .eq('id', sortedAssignments[0].price_list_id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (plRow) activePricelist = { id: plRow.id as string, name: plRow.name as string };
  }

  let linkedOrderNumber: string | null = null;
  if (inv.order_id) {
    const { data: ord } = await db.schema('app').from('orders').select('order_number').eq('id', inv.order_id).maybeSingle();
    linkedOrderNumber = (ord?.order_number as string | null | undefined) ?? null;
  }
  let linkedEstimateNumber: string | null = null;
  if (inv.estimate_id) {
    const { data: est } = await db.schema('app').from('estimates').select('estimate_number').eq('id', inv.estimate_id).maybeSingle();
    linkedEstimateNumber = (est?.estimate_number as string | null | undefined) ?? null;
  }

  const createdById = typeof inv.created_by === 'string' ? inv.created_by : null;
  const salesAgentName = createdById
    ? ((await getAuthUserDisplayNameMap([createdById])).get(createdById) ?? null)
    : null;

  const geo = (buyer?.geography as Record<string, unknown> | null | undefined) ?? null;
  const buyerContext: EstimateComposerBuyerContext | null = buyer
    ? {
        id: String(buyer.id),
        business_name: String(buyer.business_name ?? ''),
        contact_name: (buyer.contact_name as string | null | undefined) ?? null,
        phone: (buyer.phone as string | null | undefined) ?? null,
        email: (buyer.email as string | null | undefined) ?? null,
        gstin: (buyer.gstin as string | null | undefined) ?? null,
        bill_address: [geo?.city, geo?.state, geo?.pincode].filter(Boolean).join(', ') || '—',
        city: (geo?.city as string | null | undefined) ?? null,
        state: (geo?.state as string | null | undefined) ?? null,
        pincode: (geo?.pincode as string | null | undefined) ?? null,
        place_of_supply: computePlaceOfSupplyFromBuyer(geo, (buyer.gstin as string | null | undefined) ?? null),
        seller_state: (tenantRes.data?.primary_state as string | null | undefined) ?? null,
        payment_terms_days: Number(buyer.payment_terms_days ?? 0),
        credit_limit: creditLimit,
        credit_used: creditUsed,
        credit_available: creditAvailable,
        active_pricelist: activePricelist,
        sales_agent_name: salesAgentName,
      }
    : null;

  const fallbackDate = String(inv.created_at).slice(0, 10);
  const composerPayload: InvoiceComposerDocument = {
    id: String(inv.id),
    invoice_number: String(inv.invoice_number ?? '—'),
    status: String(inv.status ?? 'draft'),
    buyer_id: buyerId,
    location_id: (inv.location_id as string | null | undefined) ?? defaultLocationId,
    available_locations: availableLocations,
    invoice_date: isoDateValue(inv.invoice_date as string | null | undefined, fallbackDate),
    due_date: isoDateValue(inv.due_date as string | null | undefined, null as unknown as string) || null,
    buyer_po_ref: String(inv.buyer_po_ref ?? ''),
    place_of_supply: String(inv.place_of_supply ?? ''),
    seller_note: String(inv.notes ?? ''),
    freight: Number(inv.freight ?? 0),
    discount_flat: Number(inv.discount_flat ?? 0),
    round_off: Number(inv.round_off ?? 0),
    sent_at: (inv.sent_at as string | null | undefined) ?? null,
    sent_channel: (inv.sent_channel as string | null | undefined) ?? null,
    items: composerItems,
    buyer_context: buyerContext,
    order_id: (inv.order_id as string | null | undefined) ?? null,
    estimate_id: (inv.estimate_id as string | null | undefined) ?? null,
    linked_order_number: linkedOrderNumber,
    linked_estimate_number: linkedEstimateNumber,
  };

  return { composerPayload };
}
