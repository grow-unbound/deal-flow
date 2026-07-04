import { computePlaceOfSupplyFromBuyer } from '@/lib/sales-orders/compute-place-of-supply';
import type { JWTClaims } from '@/lib/auth';
import { isoDateInTimeZone } from '@/lib/date-utils';
import {
  canAccessDocumentLocation,
  loadAccessibleSellerLocations,
  resolveDefaultSellerLocationId,
} from '@/lib/server/seller-location-access';
import { loadInventoryAvailabilityMap } from '@/lib/server/warehouse-inventory';
import { loadBuyerCreditSnapshot } from '@/lib/server/buyer-credit';
import { getAuthUserDisplayNameMap } from '@/lib/server/auth-user-directory';
import type { EstimateComposerDocument } from '@/types/estimate-composer';
import type { EstimateDetailActivity, EstimateDetailLineItem, EstimateDetailPayload } from '@/types/tenant-estimate-detail';
import type { EstimateDbStatus, EstimateStatusTone } from '@/types/tenant-estimates';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

function normalizeEstimateStatus(raw: string): Exclude<EstimateDbStatus, 'pending'> {
  const allowed: Array<Exclude<EstimateDbStatus, 'pending'>> = [
    'draft', 'sent', 'accepted', 'declined', 'expired', 'invoiced', 'converted', 'void',
  ];
  return allowed.includes(raw as Exclude<EstimateDbStatus, 'pending'>)
    ? (raw as Exclude<EstimateDbStatus, 'pending'>)
    : 'draft';
}

function statusPresentation(status: Exclude<EstimateDbStatus, 'pending'>): { label: string; tone: EstimateStatusTone } {
  const map: Record<Exclude<EstimateDbStatus, 'pending'>, { label: string; tone: EstimateStatusTone }> = {
    draft: { label: 'Draft', tone: 'neutral' },
    sent: { label: 'Sent', tone: 'warning' },
    accepted: { label: 'Accepted', tone: 'success' },
    declined: { label: 'Declined', tone: 'danger' },
    expired: { label: 'Expired', tone: 'neutral' },
    converted: { label: 'Converted', tone: 'success' },
    invoiced: { label: 'Invoiced', tone: 'success' },
    void: { label: 'Void', tone: 'neutral' },
  };
  return map[status];
}

function formatAuditSummary(action: string, diff: unknown): string {
  if (diff && typeof diff === 'object' && diff !== null && 'to' in diff) {
    const to = (diff as { to?: string }).to;
    if (to) return `Status → ${to}`;
  }
  return action;
}

function formatAddress(geography: Record<string, unknown> | null | undefined) {
  const parts = [
    typeof geography?.city === 'string' ? geography.city : null,
    typeof geography?.state === 'string' ? geography.state : null,
    typeof geography?.pincode === 'string' ? geography.pincode : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Address not available';
}

function isoDateValue(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  return value.slice(0, 10);
}

export type LoadEstimateResult = {
  detailPayload: EstimateDetailPayload;
  composerPayload: EstimateComposerDocument;
};

export async function loadEstimateDocument(
  db: DbClient,
  tenantId: string,
  id: string,
  viewerRole: string | null,
  viewerClaims?: Pick<JWTClaims, 'role' | 'location_ids'> | null,
): Promise<null | 'forbidden' | LoadEstimateResult> {
  const d = db as any;

  const estimateRes = await d
    .schema('app')
    .from('estimates')
    .select(
    'id, tenant_id, location_id, buyer_id, estimate_number, status, subtotal, tax_amount, total_amount, currency, notes, expires_at, created_at, sent_at, accepted_at, converted_to_order_id, converted_to_invoice_id, estimate_date, valid_until, buyer_po_ref, discount_flat, freight, round_off, sent_channel, viewed_at, viewed_by_name, voided_at, estimate_version, place_of_supply, created_by',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (estimateRes.error) throw estimateRes.error;
  if (!estimateRes.data) return null;
  if (estimateRes.data.tenant_id !== tenantId) return 'forbidden';
  if (viewerClaims && !canAccessDocumentLocation(viewerClaims, estimateRes.data.location_id)) return 'forbidden';

  const estimate = estimateRes.data as Record<string, unknown>;
  const buyerId = typeof estimate.buyer_id === 'string' ? estimate.buyer_id : null;
  const locationId = typeof estimate.location_id === 'string' ? estimate.location_id : null;
  const effectiveClaims = viewerClaims ?? { role: 'seller_admin', location_ids: null };
  const availableLocations = await loadAccessibleSellerLocations(d, tenantId, effectiveClaims);
  const defaultLocationId = resolveDefaultSellerLocationId(effectiveClaims, availableLocations);
  const locationRes = locationId
    ? await d.schema('app').from('locations').select('name').eq('tenant_id', tenantId).eq('id', locationId).is('deleted_at', null).maybeSingle()
    : { data: null, error: null };
  if (locationRes.error) throw locationRes.error;

  const [buyerRes, itemsRes, auditRes, tenantRes] = await Promise.all([
    buyerId
      ? d.schema('app').from('buyers')
          .select('id, business_name, contact_name, phone, email, gstin, geography, credit_limit, payment_terms_days')
          .eq('tenant_id', tenantId).eq('id', buyerId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    d.schema('app').from('estimate_items')
      .select('id, tenant_product_id, qty, unit_price, tax_rate, line_total, discount_pct, disc_pct, tax_pct, item_order, scheme_tag')
      .eq('estimate_id', id).is('deleted_at', null),
    d.schema('app').from('audit_log')
      .select('id, ts, action, diff')
      .eq('tenant_id', tenantId).eq('entity_type', 'estimate').eq('entity_id', id)
      .order('ts', { ascending: false }).limit(50),
    d.schema('app').from('tenants').select('id, primary_state').eq('id', tenantId).maybeSingle(),
  ]);

  if (buyerRes.error || itemsRes.error || auditRes.error || tenantRes.error) {
    throw buyerRes.error || itemsRes.error || auditRes.error || tenantRes.error;
  }

  const buyer = buyerRes.data as Record<string, unknown> | null;
  const itemRows = (itemsRes.data ?? []) as Array<Record<string, unknown>>;

  const productIds = Array.from(
    new Set(itemRows.map((row) => row.tenant_product_id).filter((v): v is string => typeof v === 'string')),
  );

  const { data: tenantProducts } = productIds.length > 0
    ? await d.schema('app').from('tenant_products')
        .select('id, internal_sku, name_override, master_product_id, tenant_brand_id, hsn_code, gst_rate, default_uom, pack_size, base_selling_price, mrp')
        .in('id', productIds).eq('tenant_id', tenantId)
    : { data: [] as Array<Record<string, unknown>> };

  const productMap = new Map((tenantProducts ?? []).map((row: Record<string, unknown>) => [row.id as string, row]));
  const inventoryMap = await loadInventoryAvailabilityMap(d, productIds, locationId);

  const masterProductIds = Array.from(new Set(
    (tenantProducts ?? []).map((row: Record<string, unknown>) => row.master_product_id).filter((v: unknown): v is string => typeof v === 'string'),
  ));
  const brandIds = Array.from(new Set(
    (tenantProducts ?? []).map((row: Record<string, unknown>) => row.tenant_brand_id).filter((v: unknown): v is string => typeof v === 'string'),
  ));

  const [masterProductsRes, tenantBrandsRes] = await Promise.all([
    masterProductIds.length > 0
      ? d.schema('catalog').from('products').select('id, name, master_sku, hsn_code, gst_rate, default_uom, pack_size').in('id', masterProductIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    brandIds.length > 0
      ? d.schema('app').from('tenant_brands').select('id, display_name_override, master_brand_id').in('id', brandIds).eq('tenant_id', tenantId)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);

  const masterBrandIds = Array.from(new Set(
    ((tenantBrandsRes.data ?? []) as Array<Record<string, unknown>>)
      .map((row) => row.master_brand_id).filter((v): v is string => typeof v === 'string'),
  ));
  const { data: masterBrands } = masterBrandIds.length > 0
    ? await d.schema('catalog').from('brands').select('id, name').in('id', masterBrandIds)
    : { data: [] as Array<Record<string, unknown>> };

  const masterProductMap = new Map(((masterProductsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => [row.id as string, row]));
  const tenantBrandMap = new Map(((tenantBrandsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => [row.id as string, row]));
  const masterBrandMap = new Map(((masterBrands ?? []) as Array<Record<string, unknown>>).map((row) => [row.id as string, row.name as string]));

  function resolveBrandName(product: Record<string, unknown> | undefined): string {
    const tenantBrand = product?.tenant_brand_id ? tenantBrandMap.get(product.tenant_brand_id as string) : undefined;
    return (tenantBrand?.display_name_override as string | null | undefined)?.trim()
      || (tenantBrand?.master_brand_id ? masterBrandMap.get(tenantBrand.master_brand_id as string) : undefined)
      || '—';
  }

  const detailItems: EstimateDetailLineItem[] = itemRows.map((row) => {
    const product = productMap.get(row.tenant_product_id as string) as Record<string, unknown> | undefined;
    const master = product?.master_product_id ? masterProductMap.get(product.master_product_id as string) : undefined;
    return {
      id: row.id as string,
      tenant_product_id: row.tenant_product_id as string,
      product_name: (product?.name_override as string | null | undefined)?.trim() || (master?.name as string | undefined) || (product?.internal_sku as string | undefined) || 'Product',
      sku: (product?.internal_sku as string) ?? '—',
      brand_name: resolveBrandName(product),
      qty: Number(row.qty ?? 0),
      unit_price: Number(row.unit_price ?? 0),
      discount_pct: Number(row.disc_pct ?? row.discount_pct ?? 0),
      line_total: Number(row.line_total ?? 0),
    };
  });

  const composerItems = itemRows.map((row, index) => {
    const product = productMap.get(row.tenant_product_id as string) as Record<string, unknown> | undefined;
    const master = product?.master_product_id ? masterProductMap.get(product.master_product_id as string) : undefined;
    const brandName = resolveBrandName(product) === '—' ? 'Brand' : resolveBrandName(product);
    return {
      id: row.id as string,
      tenant_product_id: row.tenant_product_id as string,
      product_name: (product?.name_override as string | null | undefined)?.trim() || (master?.name as string | undefined) || (product?.internal_sku as string | undefined) || 'Product',
      sku: (product?.internal_sku as string) ?? ((master?.master_sku as string | undefined) ?? '—'),
      brand_name: brandName,
      brand_initials: brandName.split(' ').map((part) => part[0] ?? '').join('').slice(0, 2).toUpperCase(),
      brand_hue: (['teal', 'ember', 'cream'][index % 3] ?? 'teal') as 'teal' | 'ember' | 'cream',
      hsn_code: (product?.hsn_code as string | null | undefined) ?? (master?.hsn_code as string | null | undefined) ?? null,
      on_hand: inventoryMap.get(row.tenant_product_id as string) ?? 0,
      qty: Number(row.qty ?? 0),
      unit_price: Number(row.unit_price ?? 0),
      mrp: Number(product?.mrp ?? 0),
      base_selling_price: Number(product?.base_selling_price ?? 0),
      disc_pct: Number(row.disc_pct ?? row.discount_pct ?? 0),
      tax_pct: Number(row.tax_pct ?? row.tax_rate ?? (product as any)?.gst_rate ?? (master as any)?.gst_rate ?? 0),
      line_total: Number(row.line_total ?? 0),
      item_order: Number(row.item_order ?? index + 1),
      scheme_tag: (row.scheme_tag as string | null | undefined) ?? null,
    };
  });

  let linkedOrderNumber: string | null = null;
  if (estimate.converted_to_order_id) {
    const { data } = await d.schema('app').from('orders').select('order_number').eq('id', estimate.converted_to_order_id).maybeSingle();
    linkedOrderNumber = (data?.order_number as string | null | undefined) ?? null;
  }

  let linkedInvoiceNumber: string | null = null;
  if (estimate.converted_to_invoice_id) {
    const { data } = await d.schema('app').from('invoices').select('invoice_number').eq('id', estimate.converted_to_invoice_id).maybeSingle();
    linkedInvoiceNumber = (data?.invoice_number as string | null | undefined) ?? null;
  }

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
    ? await d.schema('app').from('price_list_assignments').select('price_list_id, target_type, target_id')
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
    const { data } = await d.schema('app').from('price_lists').select('id, name')
      .eq('id', sortedAssignments[0].price_list_id).eq('tenant_id', tenantId).maybeSingle();
    if (data) activePricelist = { id: data.id as string, name: data.name as string };
  }

  const createdById = typeof estimate.created_by === 'string' ? estimate.created_by : null;
  const salesAgentName = createdById
    ? ((await getAuthUserDisplayNameMap([createdById])).get(createdById) ?? null)
    : null;

  const status = normalizeEstimateStatus(String(estimate.status ?? 'draft'));
  const statusMeta = statusPresentation(status);
  const activity: EstimateDetailActivity[] = ((auditRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    at: String(row.ts),
    action: String(row.action),
    summary: formatAuditSummary(String(row.action), row.diff),
    diff: (row.diff as Record<string, unknown> | null | undefined) ?? null,
  }));

  const detailPayload: EstimateDetailPayload = {
    id: String(estimate.id),
    estimate_number: String(estimate.estimate_number ?? '—'),
    status,
    status_label: statusMeta.label,
    status_tone: statusMeta.tone,
    buyer: {
      id: String(buyer?.id ?? ''),
      name: String(buyer?.business_name ?? 'Unassigned buyer'),
      payment_terms_days: Number(buyer?.payment_terms_days ?? 0),
      credit_limit: creditLimit,
    },
    subtotal: Number(estimate.subtotal ?? 0),
    tax_amount: Number(estimate.tax_amount ?? 0),
    total_amount: Number(estimate.total_amount ?? 0),
    currency: String(estimate.currency ?? 'INR'),
    notes: (estimate.notes as string | null | undefined) ?? null,
    seller_note: (estimate.notes as string | null | undefined) ?? null,
    expires_at: (estimate.expires_at as string | null | undefined) ?? null,
    created_at: String(estimate.created_at),
    sent_at: (estimate.sent_at as string | null | undefined) ?? null,
    accepted_at: (estimate.accepted_at as string | null | undefined) ?? null,
    viewed_at: (estimate.viewed_at as string | null | undefined) ?? null,
    viewed_by_name: (estimate.viewed_by_name as string | null | undefined) ?? null,
    voided_at: (estimate.voided_at as string | null | undefined) ?? null,
    estimate_version: Number(estimate.estimate_version ?? 1),
    converted_to_order_id: (estimate.converted_to_order_id as string | null | undefined) ?? null,
    converted_to_invoice_id: (estimate.converted_to_invoice_id as string | null | undefined) ?? null,
    linked_order_number: linkedOrderNumber,
    linked_invoice_number: linkedInvoiceNumber,
    items: detailItems,
    credit_used: creditUsed,
    credit_available: creditAvailable,
    activity,
    viewer_role: viewerRole,
  };

  const geo = (buyer?.geography as Record<string, unknown> | null | undefined) ?? null;
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

  const composerPayload: EstimateComposerDocument = {
    id: String(estimate.id),
    estimate_number: String(estimate.estimate_number ?? '—'),
    status,
    buyer_id: buyerId,
    location_id: locationId ?? defaultLocationId,
    location_name: (locationRes.data?.name as string | null | undefined) ?? null,
    available_locations: availableLocations,
    estimate_date: isoDateValue(estimate.estimate_date as string | null | undefined, isoDateInTimeZone(new Date())),
    valid_until: isoDateValue(estimate.valid_until as string | null | undefined, isoDateInTimeZone(new Date())),
    buyer_po_ref: String(estimate.buyer_po_ref ?? ''),
    place_of_supply: String(estimate.place_of_supply ?? ''),
    seller_note: String(estimate.notes ?? ''),
    freight: Number(estimate.freight ?? 0),
    discount_flat: Number(estimate.discount_flat ?? 0),
    round_off: Number(estimate.round_off ?? 0),
    sent_at: (estimate.sent_at as string | null | undefined) ?? null,
    sent_channel: ((estimate.sent_channel as string | null | undefined) ?? null) as EstimateComposerDocument['sent_channel'],
    items: composerItems,
    buyer_context: buyerContext,
    estimate_version: Number(estimate.estimate_version ?? 1),
    viewed_at: (estimate.viewed_at as string | null | undefined) ?? null,
    viewed_by_name: (estimate.viewed_by_name as string | null | undefined) ?? null,
    voided_at: (estimate.voided_at as string | null | undefined) ?? null,
    converted_to_order_id: (estimate.converted_to_order_id as string | null | undefined) ?? null,
    linked_order_number: linkedOrderNumber,
  };

  return { detailPayload, composerPayload };
}
