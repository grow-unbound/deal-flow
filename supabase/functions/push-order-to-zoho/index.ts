/**
 * push-order-to-zoho — DB webhook on app.orders INSERT.
 * Pushes newly created orders (status=received) into Zoho as Sales Orders.
 *
 * Supabase Dashboard → Database → Webhooks → New:
 *   Schema: app, Table: orders, Event: INSERT
 *   URL: {SUPABASE_URL}/functions/v1/push-order-to-zoho
 *   Headers: x-push-secret: <INTEGRATIONS_PUSH_SECRET>
 */

import { createAdminClient } from '../_shared/sync-utils.ts';
import {
  lookupTenantZohoIntegration,
  buildZohoAdapter,
  resolveBuyerZohoContactId,
  resolveProductZohoItemIds,
  resolveBuyerGstInfo,
  resolveZohoLocationId,
  formatIstDate,
  recordPushSuccess,
  createEchoGuard,
  recordPushFailure,
  verifyPushSecret,
  parseWebhookRecord,
  ok,
} from '../_shared/push-zoho-utils.ts';
import { sendTransactionalAcknowledgement } from '../_shared/transactional-whatsapp.ts';

const FN = '[push-order-to-zoho]';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!verifyPushSecret(req)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return ok({ note: 'empty body' });
  }

  const record = parseWebhookRecord(body);
  if (!record) return ok({ note: 'no record' });

  const id = record.id as string | undefined;
  const tenantId = record.tenant_id as string | undefined;
  const source = record.source as string | null | undefined;
  const externalRef = record.external_ref as string | null | undefined;
  const status = record.status as string | undefined;

  if (!id || !tenantId) return ok({ note: 'missing id or tenant_id' });

  // Skip drafts — only push when order is received
  if (status === 'draft') {
    return ok({ skipped: 'draft_order' });
  }

  // Skip: came from Zoho → don't echo back
  if (source === 'zoho_import') {
    console.log(`${FN} skipped order ${id}: source=zoho_import`);
    return ok({ skipped: 'zoho_import' });
  }

  // Skip: already linked to Zoho
  if (externalRef) {
    console.log(`${FN} skipped order ${id}: already has external_ref`);
    return ok({ skipped: 'already_linked' });
  }

  const admin = createAdminClient();

  // Look up active Zoho integration for this tenant
  const integration = await lookupTenantZohoIntegration(admin, tenantId);
  if (!integration) {
    console.log(`${FN} skipped order ${id}: no active Zoho integration for tenant ${tenantId}`);
    return ok({ skipped: 'no_integration' });
  }

  // Fetch full order row
  const { data: order, error: orderErr } = await admin
    .schema('app')
    .from('orders')
    .select('id, tenant_id, location_id, buyer_id, order_number, status, source, external_ref, notes, placed_at, subtotal, tax_amount, total_amount, currency, place_of_supply, is_buyer_app_order')
    .eq('id', id)
    .maybeSingle();

  if (orderErr || !order) {
    console.error(`${FN} failed to load order ${id}:`, orderErr?.message);
    return ok({ error: 'order_not_found' });
  }

  // Double-check skip conditions on the authoritative DB row
  if (order.status === 'draft' || order.source === 'zoho_import' || order.external_ref) {
    return ok({ skipped: 'skip_conditions_on_db_row' });
  }

  // Fetch line items
  const { data: items, error: itemsErr } = await admin
    .schema('app')
    .from('order_items')
    .select('id, tenant_product_id, qty, unit_price, tax_rate, line_total')
    .eq('order_id', id);

  if (itemsErr || !items || items.length === 0) {
    console.warn(`${FN} order ${id} has no line items — skipping push`);
    return ok({ skipped: 'no_line_items' });
  }

  // Resolve buyer Zoho contact_id
  const buyerId = order.buyer_id as string;
  const zohoContactId = await resolveBuyerZohoContactId(admin, buyerId);
  if (!zohoContactId) {
    const reason = `buyer ${buyerId} has no external_ref (not yet synced from Zoho)`;
    console.warn(`${FN} ${reason}`);
    await recordPushFailure(admin, {
      tenantId,
      integrationId: integration.integrationId,
      entityType: 'orders',
      internalId: id,
      errorReason: reason,
    });
    return ok({ pending: 'missing_buyer_zoho_id' });
  }

  // Resolve product Zoho item_ids
  const productIds = items.map((i) => i.tenant_product_id as string);
  const productMap = await resolveProductZohoItemIds(admin, productIds);

  const missingProducts = productIds.filter((pid) => !productMap.has(pid));
  if (missingProducts.length > 0) {
    const reason = `products missing external_ref (not synced from Zoho): ${missingProducts.join(', ')}`;
    console.warn(`${FN} ${reason}`);
    await recordPushFailure(admin, {
      tenantId,
      integrationId: integration.integrationId,
      entityType: 'orders',
      internalId: id,
      errorReason: reason,
    });
    return ok({ pending: 'missing_product_zoho_ids' });
  }

  // Resolve buyer GST info
  const gstInfo = await resolveBuyerGstInfo(admin, buyerId);
  const zohoLocationId = await resolveZohoLocationId(
    admin,
    tenantId,
    (order.location_id as string | null | undefined) ?? null,
  );

  // Build Zoho Sales Order payload
  const placedAt = order.placed_at ? new Date(order.placed_at as string) : new Date();
  const orderDate = formatIstDate(placedAt);
  const notesText = ['All prices inclusive of GST', order.notes as string | null]
    .filter(Boolean)
    .join('\n');

  const zohoBody: Record<string, unknown> = {
    customer_id: zohoContactId,
    date: orderDate,
    // Pass Yukti's order_number as Zoho reference; Zoho auto-generates its own salesorder_number
    reference_number: order.order_number as string,
    is_inclusive_tax: true,
    line_items: items.map((item) => {
      const prod = productMap.get(item.tenant_product_id as string)!;
      return {
        item_id: prod.itemId,
        name: prod.name,
        description: prod.sku ? `${prod.name} (${prod.sku})` : prod.name,
        quantity: Number(item.qty),
        rate: Number(item.unit_price),
      };
    }),
    notes: notesText,
  };

  if (zohoLocationId) {
    zohoBody.location_id = zohoLocationId;
  }

  if (order.is_buyer_app_order === true) {
    zohoBody.custom_fields = [{ api_name: 'cf_catalog_order', value: true }];
  }

  if (gstInfo.gst_treatment) {
    zohoBody.gst_treatment = gstInfo.gst_treatment;
  }
  if (gstInfo.gstin) {
    zohoBody.gst_no = gstInfo.gstin;
  }

  // Push to Zoho
  const adapter = buildZohoAdapter(integration, admin);
  let zohoSalesOrderId: string;
  let zohoSalesOrderNumber: string;
  let zohoSalesOrderUrl: string | null = null;

  try {
    const response = await adapter.request<Record<string, unknown>>({
      method: 'POST',
      path: '/salesorders',
      body: zohoBody,
    });

    const so = response.salesorder as Record<string, unknown> | undefined;
    zohoSalesOrderId = (so?.salesorder_id as string | undefined) ?? '';
    zohoSalesOrderNumber = (so?.salesorder_number as string | undefined) ?? '';

    if (!zohoSalesOrderId) {
      throw new Error(`Zoho did not return salesorder_id. Response: ${JSON.stringify(response).slice(0, 1000)}`);
    }

    const soUrl = (so?.salesorder_url as string | undefined)
      ?? (so?.order_url as string | undefined)
      ?? (so?.portal_url as string | undefined)
      ?? null;
    zohoSalesOrderUrl = soUrl;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${FN} Zoho POST /salesorders failed for order ${id}:`, msg);
    await recordPushFailure(admin, {
      tenantId,
      integrationId: integration.integrationId,
      entityType: 'orders',
      internalId: id,
      errorReason: msg,
    });
    void sendTransactionalAcknowledgement(admin, {
      kind: 'order',
      outcome: 'pending',
      entityId: id,
      tenantId,
      buyerId,
    });
    return ok({ error: 'zoho_push_failed' });
  }

  if (!zohoSalesOrderUrl) {
    try {
      const detail = await adapter.request<Record<string, unknown>>({
        method: 'GET',
        path: `/salesorders/${zohoSalesOrderId}`,
      });
      const detailSo = detail.salesorder as Record<string, unknown> | undefined;
      zohoSalesOrderUrl = (detailSo?.salesorder_url as string | undefined)
        ?? (detailSo?.order_url as string | undefined)
        ?? (detailSo?.portal_url as string | undefined)
        ?? null;
    } catch {
      console.warn(`${FN} could not fetch salesorder_url for ${zohoSalesOrderId}`);
    }
  }

  // Overwrite Yukti DB with Zoho's canonical order_number
  await recordPushSuccess(admin, {
    tenantId,
    integrationId: integration.integrationId,
    entityTable: 'orders',
    entityType: 'orders',
    internalId: id,
    externalZohoId: zohoSalesOrderId,
    extraFields: {
      // Zoho's auto-generated SO number overrides Yukti's provisional number
      order_number: zohoSalesOrderNumber,
      order_url: zohoSalesOrderUrl,
      notes: notesText,
    },
  });

  if (zohoSalesOrderNumber) {
    void sendTransactionalAcknowledgement(admin, {
      kind: 'order',
      outcome: 'success',
      entityId: id,
      tenantId,
      buyerId,
      documentNumber: zohoSalesOrderNumber,
    });
  }

  // Echo guard — 30 min TTL prevents forward sync from reimporting this order
  await createEchoGuard(admin, {
    tenantId,
    integrationId: integration.integrationId,
    entityType: 'orders',
    internalId: id,
    externalZohoId: zohoSalesOrderId,
    protectedFields: ['order_number', 'order_url', 'external_ref'],
  });

  console.log(`${FN} pushed order ${id} → Zoho ${zohoSalesOrderId} (${zohoSalesOrderNumber})`);
  return ok({ zoho_salesorder_id: zohoSalesOrderId, order_number: zohoSalesOrderNumber });
});
