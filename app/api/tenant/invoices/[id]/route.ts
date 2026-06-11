import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { FEATURE_FLAGS, ROLES } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { buildInvoiceGstRows } from '@/lib/invoice-detail-gst-rows';
import { effectiveInvoiceStatus } from '@/lib/invoice-status';
import { loadInvoiceDocument } from '@/lib/invoices/load-tenant-invoice-composer';
import { computePlaceOfSupplyFromBuyer } from '@/lib/sales-orders/compute-place-of-supply';
import { productDisplayName } from '@/lib/sales-orders/tenant-order-detail';
import { supabaseAdmin } from '@/lib/supabase';

type DbClient = any;
import type {
  InvoiceDetailBuyerDto,
  InvoiceDetailItemDto,
  InvoiceDetailResponse,
  InvoiceDetailTotalsDto,
  InvoiceDetailViewerRole,
  InvoicePaymentRecordDto,
  InvoiceStatusValue,
} from '@/types/tenant-invoices';

export const dynamic = 'force-dynamic';

const PatchBodySchema = z.object({
  action: z.string(),
}).passthrough();

const ComposerSaveSchema = z.object({
  invoice_number: z.string().min(1).optional(),
  buyer_id: z.string().uuid().nullable().optional(),
  invoice_date: z.string().optional(),
  due_date: z.string().nullable().optional(),
  buyer_po_ref: z.string().max(255).optional(),
  place_of_supply: z.string().max(120).optional(),
  seller_note: z.string().max(8000).optional(),
  freight: z.number().min(0).optional(),
  discount_flat: z.number().min(0).optional(),
  round_off: z.number().optional(),
  items: z.array(
    z.object({
      id: z.string().optional(),
      tenant_product_id: z.string().uuid(),
      qty: z.number().positive(),
      unit_price: z.number().min(0),
      disc_pct: z.number().min(0).max(100),
      tax_pct: z.number().min(0).max(100),
      scheme_tag: z.string().nullable().optional(),
    }),
  ).optional(),
});

function formatAddress(geography: Record<string, unknown> | null | undefined): string {
  if (!geography) return '—';
  const line1 = typeof geography.line1 === 'string' ? geography.line1 : '';
  const city = typeof geography.city === 'string' ? geography.city : '';
  const state = typeof geography.state === 'string' ? geography.state : '';
  const parts = [line1, city, state].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : '—';
}

function gstinStateCode(gstin: string | null | undefined): string | null {
  const g = (gstin ?? '').trim();
  return g.length >= 2 ? g.slice(0, 2).toUpperCase() : null;
}

async function assertInvoiceFlags(tenantId: string): Promise<boolean> {
  const om = await getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, tenantId);
  const inv = await getFlag(FEATURE_FLAGS.INVOICES, tenantId);
  return om && inv;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!(await assertInvoiceFlags(claims.tenant_id))) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const { searchParams } = new URL(request.url);
  if (searchParams.get('view') === 'composer') {
    const result = await loadInvoiceDocument(supabaseAdmin as DbClient, claims.tenant_id, id, claims.role ?? null);
    if (!result) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    if (result === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ data: result.composerPayload });
  }

  const db = supabaseAdmin;
  const { data: invoiceRow, error } = await db
    .schema('app')
    .from('invoices')
    .select(
      [
        'id',
        'tenant_id',
        'buyer_id',
        'order_id',
        'estimate_id',
        'invoice_number',
        'version',
        'status',
        'invoice_date',
        'due_date',
        'sent_at',
        'paid_at',
        'payment_reference',
        'payment_method',
        'subtotal',
        'tax_amount',
        'total_amount',
        'outstanding_balance',
        'amount_paid',
        'discount_flat',
        'freight',
        'round_off',
        'buyer_po_ref',
        'gstin_locked',
        'hsn_locked',
        'voided_at',
        'viewed_at',
        'viewed_by_name',
        'last_reminder_at',
        'intra_state_tax',
        'notes',
        'sent_channel',
        'created_at',
        'updated_at',
      ].join(', '),
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !invoiceRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const inv = invoiceRow as unknown as Record<string, unknown>;
  if (inv.tenant_id !== claims.tenant_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const buyerId = inv.buyer_id as string | null;
  const { data: buyer } = buyerId
    ? await db
      .schema('app')
      .from('buyers')
      .select('id, business_name, contact_name, gstin, geography, credit_limit, payment_terms_days, phone, email')
      .eq('id', buyerId)
      .is('deleted_at', null)
      .maybeSingle()
    : { data: null };

  const { data: tenant } = await db
    .schema('app')
    .from('tenants')
    .select('business_name, gstin, primary_state, settings')
    .eq('id', claims.tenant_id)
    .maybeSingle();

  const { data: lineRowsRaw, error: linesErr } = await db
    .schema('app')
    .from('invoice_items')
    .select('id, tenant_product_id, sku, hsn_code, qty, unit_price, disc_pct, tax_pct, line_total, scheme_tag')
    .eq('invoice_id', id)
    .is('deleted_at', null);

  if (linesErr) {
    console.error('[GET /api/tenant/invoices/[id]] lines', linesErr);
    return NextResponse.json({ error: 'Failed to load invoice' }, { status: 500 });
  }

  const lineRows = (lineRowsRaw ?? []) as Array<Record<string, unknown>>;
  const productIds = Array.from(
    new Set(lineRows.map((row) => row.tenant_product_id).filter((value): value is string => typeof value === 'string')),
  );

  const { data: tenantProducts } =
    productIds.length > 0
      ? await db
          .schema('app')
          .from('tenant_products')
          .select('id, internal_sku, name_override, master_product_id, tenant_brand_id, hsn_code, gst_rate, default_uom, mrp')
          .in('id', productIds)
          .eq('tenant_id', claims.tenant_id)
          .is('deleted_at', null)
      : { data: [] as Array<Record<string, unknown>> };

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
      ? db.schema('catalog').from('products').select('id, name, master_sku, hsn_code, gst_rate').in('id', masterProductIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    brandIds.length > 0
      ? db
          .schema('app')
          .from('tenant_brands')
          .select('id, display_name_override, master_brand_id')
          .in('id', brandIds)
          .eq('tenant_id', claims.tenant_id)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);

  const masterBrandIds = Array.from(
    new Set(
      ((tenantBrandsRes.data ?? []) as Array<Record<string, unknown>>)
        .map((row) => row.master_brand_id)
        .filter((value: unknown): value is string => typeof value === 'string'),
    ),
  );
  const { data: masterBrands } =
    masterBrandIds.length > 0
      ? await db.schema('catalog').from('brands').select('id, name').in('id', masterBrandIds)
      : { data: [] as Array<Record<string, unknown>> };

  const productMap = new Map((tenantProducts ?? []).map((row: Record<string, unknown>) => [row.id as string, row]));
  const masterProductMap = new Map(((masterProductsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => [row.id as string, row]));
  const tenantBrandMap = new Map(((tenantBrandsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => [row.id as string, row]));
  const masterBrandMap = new Map(((masterBrands ?? []) as Array<Record<string, unknown>>).map((row) => [row.id as string, row.name as string]));

  const items: InvoiceDetailItemDto[] = lineRows.map((row, index) => {
    const product = productMap.get(row.tenant_product_id as string) as Record<string, unknown> | undefined;
    const master = product?.master_product_id ? masterProductMap.get(product.master_product_id as string) : undefined;
    const tenantBrand = product?.tenant_brand_id ? tenantBrandMap.get(product.tenant_brand_id as string) : undefined;
    const brandName =
      (tenantBrand?.display_name_override as string | null | undefined)?.trim()
      || (tenantBrand?.master_brand_id ? masterBrandMap.get(tenantBrand.master_brand_id as string) : undefined)
      || 'Brand';
    const brandInitials =
      brandName
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0] ?? '')
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'BR';
    const brandHue = (['teal', 'ember', 'cream'][index % 3] ?? 'teal') as InvoiceDetailItemDto['brand_hue'];
    const displayName = productDisplayName(
      (product?.name_override as string | null | undefined) ?? null,
      (master?.name as string | null | undefined) ?? null,
    );
    const sku = (product?.internal_sku as string | undefined) ?? (master?.master_sku as string | undefined) ?? (row.sku as string | undefined) ?? '—';
    const hsn =
      (row.hsn_code as string | null | undefined)
      ?? (product?.hsn_code as string | null | undefined)
      ?? (master?.hsn_code as string | null | undefined)
      ?? null;
    const unit = (product?.default_uom as string | null | undefined)?.trim() || '—';
    return {
      tenant_product_id: String(row.tenant_product_id ?? product?.id ?? ''),
      product_name: displayName || String(row.sku ?? 'Line item'),
      sku,
      brand_name: brandName,
      brand_initials: brandInitials,
      brand_hue: brandHue,
      hsn,
      qty: Number(row.qty ?? 0),
      unit,
      rate: Number(row.unit_price ?? 0),
      mrp: Number(product?.mrp ?? 0),
      discount_pct: Number(row.disc_pct ?? 0),
      line_total: Number(row.line_total ?? 0),
      tax_pct: row.tax_pct != null ? Number(row.tax_pct) : null,
    };
  });

  const outstandingInvoices = buyerId
    ? await db
        .schema('app')
        .from('invoices')
        .select('outstanding_balance')
        .eq('tenant_id', claims.tenant_id)
        .eq('buyer_id', buyerId)
        .is('deleted_at', null)
    : { data: [] as Array<Record<string, unknown>> };

  const creditUsed = ((outstandingInvoices.data ?? []) as Array<Record<string, unknown>>).reduce(
    (sum, row) => sum + Number(row.outstanding_balance ?? 0),
    0,
  );
  const creditLimit = Number(buyer?.credit_limit ?? 0);

  const geo = (buyer?.geography as Record<string, unknown> | null | undefined) ?? null;
  const sellerState = (tenant?.primary_state as string | null | undefined) ?? null;
  const placeOfSupply = computePlaceOfSupplyFromBuyer(geo, (buyer?.gstin as string | null | undefined) ?? null);

  const buyerDto: InvoiceDetailBuyerDto = {
    id: String(buyer?.id ?? buyerId ?? ''),
    name: String(buyer?.business_name ?? '—'),
    gstin: (buyer?.gstin as string | null | undefined) ?? null,
    gstin_state_code: gstinStateCode(buyer?.gstin as string | null | undefined),
    city: (geo?.city as string | null | undefined) ?? null,
    credit_limit: creditLimit,
    credit_used: creditUsed,
    payment_terms_days: Number(buyer?.payment_terms_days ?? 0),
    contact_name: (buyer?.contact_name as string | null | undefined) ?? null,
    phone: (buyer?.phone as string | null | undefined) ?? null,
    email: (buyer?.email as string | null | undefined) ?? null,
    bill_address: formatAddress(geo),
    state: (geo?.state as string | null | undefined) ?? null,
    pincode: (geo?.pincode as string | null | undefined) ?? null,
    place_of_supply: placeOfSupply,
    seller_state: sellerState,
    active_pricelist: null,
    sales_agent_name: null,
  };

  const subtotal = Number(inv.subtotal ?? 0);
  const discountFlat = Number(inv.discount_flat ?? 0);
  const freight = Number(inv.freight ?? 0);
  const roundOff = Number(inv.round_off ?? 0);
  const taxAmount = Number(inv.tax_amount ?? 0);
  const grandTotal = Number(inv.total_amount ?? 0);
  const taxable = Math.max(subtotal - discountFlat, 0);
  const intraState = Boolean(inv.intra_state_tax ?? true);
  const gstLocked = Boolean(inv.gstin_locked);

  const gstRows = gstLocked ? buildInvoiceGstRows(intraState, taxable, taxAmount) : [];

  const totals: InvoiceDetailTotalsDto = {
    subtotal,
    discount_amt: discountFlat,
    taxable,
    tax_amount: taxAmount,
    freight,
    round_off: roundOff,
    grand_total: grandTotal,
    gst_rows: gstRows,
  };

  let linkedOrderNumber: string | null = null;
  if (inv.order_id) {
    const { data: ord } = await db
      .schema('app')
      .from('orders')
      .select('order_number')
      .eq('id', inv.order_id)
      .maybeSingle();
    linkedOrderNumber = (ord?.order_number as string | null | undefined) ?? null;
  }

  let linkedEstimateNumber: string | null = null;
  if (inv.estimate_id) {
    const { data: est } = await db
      .schema('app')
      .from('estimates')
      .select('estimate_number')
      .eq('id', inv.estimate_id)
      .maybeSingle();
    linkedEstimateNumber = (est?.estimate_number as string | null | undefined) ?? null;
  }

  const dbStatus = String(inv.status ?? 'draft');
  const eff = effectiveInvoiceStatus({ status: dbStatus, due_date: (inv.due_date as string | null) ?? null }) as InvoiceStatusValue;

  const viewerRole: InvoiceDetailViewerRole = claims.role === ROLES.SELLER_ADMIN ? 'seller_admin' : 'seller_assistant';

  const { data: paymentRows } = await db
    .schema('app')
    .from('payments')
    .select('id, amount, paid_at, mode, external_ref')
    .eq('tenant_id', claims.tenant_id)
    .eq('invoice_id', id)
    .is('deleted_at', null)
    .order('paid_at', { ascending: true });

  const payments: InvoicePaymentRecordDto[] = (paymentRows ?? []).map((row) => ({
    id: String(row.id),
    amount: Math.round(Number(row.amount ?? 0) * 100) / 100,
    paid_at: String(row.paid_at ?? ''),
    payment_method: (row.mode as string | null | undefined) ?? null,
    payment_reference: (row.external_ref as string | null | undefined) ?? null,
  }));

  const payload: InvoiceDetailResponse = {
    id: String(inv.id),
    doc_number: String(inv.invoice_number ?? '—'),
    db_status: dbStatus,
    status: eff,
    version: Number(inv.version ?? 1),
    invoice_date: String(inv.invoice_date ?? '').slice(0, 10),
    due_date: inv.due_date ? String(inv.due_date).slice(0, 10) : null,
    sent_at: (inv.sent_at as string | null | undefined) ?? null,
    viewed_at: (inv.viewed_at as string | null | undefined) ?? null,
    viewed_by_name: (inv.viewed_by_name as string | null | undefined) ?? null,
    paid_at: (inv.paid_at as string | null | undefined) ?? null,
    payment_method: (inv.payment_method as string | null | undefined) ?? null,
    payment_reference: (inv.payment_reference as string | null | undefined) ?? null,
    amount_outstanding: Math.round(Number(inv.outstanding_balance ?? 0) * 100) / 100,
    amount_paid: Math.round(Number(inv.amount_paid ?? 0) * 100) / 100,
    voided_at: (inv.voided_at as string | null | undefined) ?? null,
    last_reminder_at: (inv.last_reminder_at as string | null | undefined) ?? null,
    gstin_locked: Boolean(inv.gstin_locked),
    hsn_locked: Boolean(inv.hsn_locked),
    place_of_supply: placeOfSupply,
    buyer_po_ref: (inv.buyer_po_ref as string | null | undefined) ?? null,
    intra_state_tax: intraState,
    buyer_id: buyerId,
    buyer: buyerDto,
    items,
    totals,
    order_id: (inv.order_id as string | null | undefined) ?? null,
    estimate_id: (inv.estimate_id as string | null | undefined) ?? null,
    linked_order_number: linkedOrderNumber,
    linked_estimate_number: linkedEstimateNumber,
    viewer_role: viewerRole,
    seller_note: String(inv.notes ?? ''),
    payments,
  };

  return NextResponse.json(payload);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!(await assertInvoiceFlags(claims.tenant_id))) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const parsed = PatchBodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }

  const db = supabaseAdmin as DbClient;

  if (parsed.data.action === 'save') {
    const savePayload = ComposerSaveSchema.safeParse(parsed.data);
    if (!savePayload.success) {
      return NextResponse.json({ error: savePayload.error.issues[0]?.message ?? 'Invalid payload' }, { status: 400 });
    }

    const existing = await loadInvoiceDocument(db, claims.tenant_id, id, claims.role ?? null);
    if (!existing) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    if (existing === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const p = savePayload.data;
    const items = p.items ?? existing.composerPayload.items;
    const subtotal = items.reduce((sum, row) => {
      return sum + row.qty * row.unit_price * (1 - row.disc_pct / 100);
    }, 0);
    const taxAmount = items.reduce((sum, row) => {
      const taxable = row.qty * row.unit_price * (1 - row.disc_pct / 100);
      return sum + taxable * (row.tax_pct / 100);
    }, 0);
    const discountFlat = p.discount_flat ?? existing.composerPayload.discount_flat;
    const freight = p.freight ?? existing.composerPayload.freight;
    const roundOff = p.round_off ?? existing.composerPayload.round_off;
    const grandTotal = Math.max(subtotal - discountFlat, 0) + taxAmount + freight + roundOff;

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: claims.sub,
      subtotal,
      tax_amount: taxAmount,
      total_amount: grandTotal,
      outstanding_balance: grandTotal,
    };
    if (p.invoice_number !== undefined) updatePayload.invoice_number = p.invoice_number;
    if (p.buyer_id !== undefined) updatePayload.buyer_id = p.buyer_id;
    if (p.invoice_date !== undefined) updatePayload.invoice_date = p.invoice_date;
    if (p.due_date !== undefined) updatePayload.due_date = p.due_date;
    if (p.buyer_po_ref !== undefined) updatePayload.buyer_po_ref = p.buyer_po_ref || null;
    if (p.seller_note !== undefined) updatePayload.notes = p.seller_note || null;
    if (p.discount_flat !== undefined) updatePayload.discount_flat = p.discount_flat;
    if (p.freight !== undefined) updatePayload.freight = p.freight;
    if (p.round_off !== undefined) updatePayload.round_off = p.round_off;
    if (p.place_of_supply !== undefined) {
      updatePayload.intra_state_tax = p.place_of_supply === (existing.composerPayload.buyer_context?.seller_state ?? '');
    }

    const { error: updateErr } = await db
      .schema('app')
      .from('invoices')
      .update(updatePayload)
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id);
    if (updateErr) {
      console.error('[PATCH invoice save] update error', updateErr);
      return NextResponse.json({ error: 'Failed to save invoice' }, { status: 500 });
    }

    if (p.items) {
      const existingItemIds = new Set(existing.composerPayload.items.map((row) => row.id));
      const nextIds = new Set(p.items.map((row) => row.id).filter((v): v is string => Boolean(v)));

      for (const staleId of existingItemIds) {
        if (!nextIds.has(staleId)) {
          await db
            .schema('app')
            .from('invoice_items')
            .update({ deleted_at: new Date().toISOString(), updated_by: claims.sub, updated_at: new Date().toISOString() })
            .eq('id', staleId)
            .eq('invoice_id', id);
        }
      }

      for (const item of p.items) {
        const discounted = item.qty * item.unit_price * (1 - item.disc_pct / 100);
        const patch = {
          invoice_id: id,
          tenant_id: claims.tenant_id,
          tenant_product_id: item.tenant_product_id,
          sku: null,
          qty: item.qty,
          unit_price: item.unit_price,
          disc_pct: item.disc_pct,
          tax_pct: item.tax_pct,
          line_total: discounted + discounted * (item.tax_pct / 100),
          scheme_tag: item.scheme_tag ?? null,
          updated_at: new Date().toISOString(),
          updated_by: claims.sub,
          deleted_at: null,
        };

        if (item.id && existingItemIds.has(item.id)) {
          await db.schema('app').from('invoice_items').update(patch).eq('id', item.id).eq('invoice_id', id);
        } else {
          await db.schema('app').from('invoice_items').insert({ ...patch, created_by: claims.sub });
        }
      }
    }

    const next = await loadInvoiceDocument(db, claims.tenant_id, id, claims.role ?? null);
    if (!next || next === 'forbidden') {
      return NextResponse.json({ error: 'Failed to reload invoice' }, { status: 500 });
    }
    return NextResponse.json({ data: next.composerPayload });
  }

  if (parsed.data.action === 'send') {
    const { data: row } = await db
      .schema('app')
      .from('invoices')
      .select('tenant_id')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!row || row.tenant_id !== claims.tenant_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: tenant } = await db
      .schema('app')
      .from('tenants')
      .select('settings')
      .eq('id', claims.tenant_id)
      .maybeSingle();
    const settings = (tenant?.settings ?? {}) as { inventory_hold_point?: string };
    if (settings.inventory_hold_point === 'invoice') {
      const { error: rpcError } = await db.schema('app').rpc('reserve_inventory_for_invoice', { p_invoice_id: id });
      if (rpcError) {
        console.error('[PATCH invoice send] rpc', rpcError);
        return NextResponse.json({ error: 'Failed to reserve inventory' }, { status: 500 });
      }
    }

    const { error: upErr } = await db
      .schema('app')
      .from('invoices')
      .update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id);
    if (upErr) {
      return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}
