import type { SalesOrderDetail, SalesOrderLine } from '@/types/tenant-sales-orders';
import { SalesOrderDetailSchema } from '@/types/tenant-sales-orders';

import type { JWTClaims } from '@/lib/auth';
import { loadBuyerCreditSnapshot } from '@/lib/server/buyer-credit';
import { canAccessDocumentLocation } from '@/lib/server/seller-location-access';
import { loadInventoryAvailabilityMap } from '@/lib/server/warehouse-inventory';
import { firstStoredImageUrl } from '@/lib/r2-url';
import { computePlaceOfSupplyFromBuyer } from '@/lib/sales-orders/compute-place-of-supply';
import {
  buildActivityFromAudit,
  channelLabel,
  extractLifecycleIsoFromAudits,
  extractStepperTimestamps,
  mergeLifecycleColumns,
  pickInvoiceForOrder,
  productDisplayName,
  toSalesOrderUiStatus,
} from '@/lib/sales-orders/tenant-order-detail';

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

function defaultPaymentTermsLabel(days: number): string {
  return days > 0 ? `Net ${days}` : 'Due on receipt';
}

function coerceIsoTimestamp(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return new Date(value).toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapUiStatus(db: string): NonNullable<ReturnType<typeof toSalesOrderUiStatus>> {
  return toSalesOrderUiStatus(db) ?? 'received';
}

export async function loadTenantSalesOrderDetail(
  db: DbClient,
  tenantId: string,
  orderId: string,
  viewerRole: string | null,
  viewerClaims?: Pick<JWTClaims, 'role' | 'location_ids'> | null,
): Promise<'notfound' | 'forbidden' | SalesOrderDetail> {
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
        'source',
        'is_buyer_app_order',
        'campaign_id',
        'placed_at',
        'subtotal',
        'tax_amount',
        'total_amount',
        'currency',
        'notes',
        'estimate_id',
        'buyer_po_ref',
        'discount_flat',
        'freight',
        'round_off',
        'has_backorder',
        'expected_delivery',
        'received_at',
        'confirmed_at',
        'dispatched_at',
        'delivered_at',
        'cancelled_at',
        'carrier',
        'dispatch_notes',
        'cancel_reason',
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
  const locationRes = locationId
    ? await d.schema('app').from('locations').select('name').eq('tenant_id', tenantId).eq('id', locationId).is('deleted_at', null).maybeSingle()
    : { data: null, error: null };
  if (locationRes.error) return 'notfound';

  const [itemsRes, auditRes, catalogRes, estimateRes, tenantRes] = await Promise.all([
    d
      .schema('app')
      .from('order_items')
      .select('id, tenant_product_id, qty, unit_price, tax_rate, line_total, disc_pct, tax_pct, scheme_tag, on_hand_at_confirm')
      .eq('order_id', orderId)
      .is('deleted_at', null),
    d
      .schema('app')
      .from('audit_log')
      .select('id, ts, action, diff, actor_user_id')
      .eq('tenant_id', tenantId)
      .eq('entity_type', 'order')
      .eq('entity_id', orderId)
      .order('ts', { ascending: false })
      .limit(80),
    order.campaign_id
      ? d
          .schema('app')
          .from('campaigns')
          .select('name')
          .eq('id', order.campaign_id as string)
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    estimateId
      ? d.schema('app').from('estimates').select('id, estimate_number').eq('id', estimateId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    d.schema('app').from('tenants').select('id, primary_state').eq('id', tenantId).maybeSingle(),
  ]);

  if (itemsRes.error || auditRes.error) {
    console.error('[loadTenantSalesOrderDetail]', itemsRes.error || auditRes.error);
    return 'notfound';
  }

  const itemRows = (itemsRes.data ?? []) as Array<Record<string, unknown>>;
  const rawAudits = (auditRes.data ?? []) as Array<{ id: string | number; action: string; diff: unknown; ts: string | number; actor_user_id: string | null }>;
  const audits = rawAudits.map((row) => ({
    ...row,
    id: row.id,
    ts: coerceIsoTimestamp(row.ts) ?? '',
  }));

  const productIds = Array.from(
    new Set(itemRows.map((row) => row.tenant_product_id).filter((value): value is string => typeof value === 'string')),
  );

  const { data: tenantProducts } =
    productIds.length > 0
      ? await d
          .schema('app')
          .from('tenant_products')
          .select('id, internal_sku, name_override, master_product_id, tenant_brand_id, hsn_code, gst_rate, default_uom, pack_size, image_urls')
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

  const [masterProductsRes, tenantBrandsRes] = await Promise.all([
    masterProductIds.length > 0
      ? d.schema('catalog').from('products').select('id, name, master_sku, hsn_code, gst_rate, default_uom, pack_size').in('id', masterProductIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    brandIds.length > 0
      ? d.schema('app').from('tenant_brands').select('id, display_name_override, master_brand_id').in('id', brandIds).eq('tenant_id', tenantId)
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
      ? await d.schema('catalog').from('brands').select('id, name').in('id', masterBrandIds)
      : { data: [] as Array<Record<string, unknown>> };

  const masterProductMap = new Map(((masterProductsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => [row.id as string, row]));
  const tenantBrandMap = new Map(((tenantBrandsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => [row.id as string, row]));
  const masterBrandMap = new Map(((masterBrands ?? []) as Array<Record<string, unknown>>).map((row) => [row.id as string, row.name as string]));

  const lines: SalesOrderLine[] = itemRows.map((row, index) => {
    const product = productMap.get(row.tenant_product_id as string) as Record<string, unknown> | undefined;
    const master = product?.master_product_id ? masterProductMap.get(product.master_product_id as string) : undefined;
    const tenantBrand = product?.tenant_brand_id ? tenantBrandMap.get(product.tenant_brand_id as string) : undefined;
    const brandName =
      (tenantBrand?.display_name_override as string | null | undefined)?.trim()
      || (tenantBrand?.master_brand_id ? masterBrandMap.get(tenantBrand.master_brand_id as string) : undefined)
      || '—';
    const displayName = productDisplayName(
      (product?.name_override as string | null | undefined) ?? null,
      (master?.name as string | null | undefined) ?? null,
    );
    const sku = (product?.internal_sku as string | undefined) ?? (master?.master_sku as string | undefined) ?? '—';
    const hsn = (product?.hsn_code as string | null | undefined) ?? (master?.hsn_code as string | null | undefined) ?? null;
    const unit = (product?.default_uom as string | null | undefined) ?? (master?.default_uom as string | null | undefined) ?? null;
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
    return {
      id: String(row.id),
      tenant_product_id: String(row.tenant_product_id),
      name: displayName,
      brand: brandName,
      brand_initials: initials,
      brand_hue: hue,
      image_url: firstStoredImageUrl(product?.image_urls),
      sku,
      qty: Number(row.qty ?? 0),
      unit_price: Number(row.unit_price ?? 0),
      tax_rate: row.tax_rate != null ? Number(row.tax_rate) : null,
      tax_pct: taxPct,
      disc_pct: Number(row.disc_pct ?? 0),
      hsn_code: hsn,
      unit,
      line_total: Number(row.line_total ?? 0),
      on_hand: onHand,
      on_hand_at_confirm: row.on_hand_at_confirm != null ? Number(row.on_hand_at_confirm) : null,
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

  const creditLimit = Number(buyer?.credit_limit ?? 0);
  const creditSnapshot = buyerId
    ? await loadBuyerCreditSnapshot(d as any, { tenantId, buyerId, creditLimit })
    : null;
  const creditUsed = creditSnapshot?.credit_used ?? 0;
  const creditAvailable = creditSnapshot?.available_credit ?? creditLimit;

  const cohortRows = buyerId
    ? await d.schema('app').from('cohort_members_active').select('cohort_id').eq('buyer_id', buyerId)
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

  const geo = (buyer?.geography as Record<string, unknown> | null | undefined) ?? null;
  const placeOfSupply = computePlaceOfSupplyFromBuyer(geo, (buyer?.gstin as string | null | undefined) ?? null);

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
        sales_agent_name: null,
      }
    : null;

  const buyerSummary = {
    id: buyer ? String(buyer.id) : '—',
    name: buyer ? String(buyer.business_name ?? 'Buyer') : 'Unassigned buyer',
    city: (geo?.city as string | null | undefined) ?? '—',
    state: (geo?.state as string | null | undefined) ?? null,
    gstin: (buyer?.gstin as string | null | undefined) ?? null,
    credit_limit: creditLimit,
    payment_terms_days: Number(buyer?.payment_terms_days ?? 0),
    contact_name: (buyer?.contact_name as string | null | undefined) ?? null,
    phone: (buyer?.phone as string | null | undefined) ?? null,
    geography: geo,
  };

  let invoiceRows: Array<{
    id: string;
    invoice_number: string;
    invoice_date: string;
    status: string;
    subtotal: number | null;
    tax_amount: number | null;
    total_amount: number | null;
  }> = [];

  if (estimateId) {
    const { data: invData } = await d
      .schema('app')
      .from('invoices')
      .select('id, invoice_number, invoice_date, status, subtotal, tax_amount, total_amount')
      .eq('tenant_id', tenantId)
      .eq('estimate_id', estimateId)
      .is('deleted_at', null);
    invoiceRows = (invData ?? []) as typeof invoiceRows;
  }

  const pickedInvoice = pickInvoiceForOrder(invoiceRows);
  const paymentTermsDays = Number(buyer?.payment_terms_days ?? 0);
  const invoice = pickedInvoice
    ? {
        invoice_number: pickedInvoice.invoice_number,
        invoice_date: pickedInvoice.invoice_date,
        terms_label: defaultPaymentTermsLabel(paymentTermsDays),
        subtotal: Number(pickedInvoice.subtotal ?? 0),
        tax_amount: Number(pickedInvoice.tax_amount ?? 0),
        total_amount: Number(pickedInvoice.total_amount ?? 0),
        status: pickedInvoice.status,
      }
    : null;

  const estimateMeta = estimateRes.data as { id: string; estimate_number: string | null } | null;
  const estimate = estimateMeta
    ? { id: estimateMeta.id, estimate_number: estimateMeta.estimate_number }
    : null;

  const catalogName = (catalogRes.data as { name: string } | null | undefined)?.name ?? null;

  const placedAt = coerceIsoTimestamp(order.placed_at);
  const units = lines.reduce((s, l) => s + l.qty, 0);
  const activity = buildActivityFromAudit(
    String(order.id),
    String(order.order_number ?? order.id),
    placedAt,
    lines.length,
    units,
    catalogName,
    channelLabel((order.source as string | null) ?? null),
    audits,
  );

  const auditChrono = [...audits].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  const stepper = extractStepperTimestamps(placedAt, auditChrono);
  const lifecycleFromAudits = extractLifecycleIsoFromAudits(placedAt, auditChrono);
  const lifecycle = mergeLifecycleColumns(
    {
      received_at: coerceIsoTimestamp(order.received_at),
      confirmed_at: coerceIsoTimestamp(order.confirmed_at),
      dispatched_at: coerceIsoTimestamp(order.dispatched_at),
      delivered_at: coerceIsoTimestamp(order.delivered_at),
      cancelled_at: coerceIsoTimestamp(order.cancelled_at),
    },
    lifecycleFromAudits,
  );

  const dbStatus = String(order.status ?? 'received');
  const uiStatus = mapUiStatus(dbStatus);

  const expectedDelivery = order.expected_delivery
    ? String(order.expected_delivery).slice(0, 10)
    : null;

  const isBuyerApp = Boolean(order.is_buyer_app_order) || order.source === 'buyer_app';

  const raw: SalesOrderDetail = {
    id: String(order.id),
    order_number: String(order.order_number ?? order.id),
    location_id: locationId,
    location_name: (locationRes.data?.name as string | null | undefined) ?? null,
    db_status: dbStatus,
    ui_status: uiStatus,
    placed_at: placedAt,
    source: (order.source as string | null) ?? null,
    is_buyer_app: isBuyerApp,
    catalog_name: catalogName,
    subtotal: Number(order.subtotal ?? 0),
    tax_amount: Number(order.tax_amount ?? 0),
    total_amount: Number(order.total_amount ?? 0),
    currency: String(order.currency ?? 'INR'),
    notes: (order.notes as string | null | undefined) ?? null,
    cancel_reason: (order.cancel_reason as string | null | undefined) ?? null,
    viewer_role: viewerRole,
    buyer_context: buyerContext,
    discount_flat: Number(order.discount_flat ?? 0),
    freight: Number(order.freight ?? 0),
    round_off: Number(order.round_off ?? 0),
    has_backorder: Boolean(order.has_backorder ?? false),
    expected_delivery: expectedDelivery,
    buyer_po_ref: (order.buyer_po_ref as string | null | undefined) ?? null,
    place_of_supply: buyerContext?.place_of_supply ?? 'Unknown',
    seller_note: (order.notes as string | null | undefined) ?? null,
    received_at: lifecycle.received_at,
    confirmed_at: lifecycle.confirmed_at,
    dispatched_at: lifecycle.dispatched_at,
    delivered_at: lifecycle.delivered_at,
    cancelled_at: lifecycle.cancelled_at,
    carrier: (order.carrier as string | null | undefined) ?? null,
    dispatch_notes: (order.dispatch_notes as string | null | undefined) ?? null,
    buyer: buyerSummary,
    lines,
    invoice,
    estimate,
    activity,
    stepper_timestamps: stepper,
  };

  const parsed = SalesOrderDetailSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('[loadTenantSalesOrderDetail] schema', parsed.error.flatten());
    return 'notfound';
  }
  return parsed.data;
}
