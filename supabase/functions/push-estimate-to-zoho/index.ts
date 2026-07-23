/**
 * push-estimate-to-zoho — DB webhook on app.estimates INSERT.
 * Pushes newly created estimates into Zoho Books/Inventory as Estimates.
 *
 * Supabase Dashboard → Database → Webhooks → New:
 *   Schema: app, Table: estimates, Event: INSERT
 *   URL: {SUPABASE_URL}/functions/v1/push-estimate-to-zoho
 *   Headers: x-push-secret: <INTEGRATIONS_PUSH_SECRET>
 */

import { createAdminClient } from '../_shared/sync-utils.ts';
import {
  lookupTenantZohoIntegration,
  buildZohoAdapter,
  resolveBuyerZohoContactId,
  resolveProductZohoItemIds,
  resolveBuyerGstInfo,
  formatIstDate,
  recordPushSuccess,
  createEchoGuard,
  recordPushFailure,
  verifyPushSecret,
  parseWebhookRecord,
  ok,
} from '../_shared/push-zoho-utils.ts';
import { sendTransactionalAcknowledgement } from '../_shared/transactional-whatsapp.ts';

const FN = '[push-estimate-to-zoho]';

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

  if (!id || !tenantId) return ok({ note: 'missing id or tenant_id' });

  // Skip: came from Zoho → don't echo back
  if (source === 'zoho_import') {
    console.log(`${FN} skipped estimate ${id}: source=zoho_import`);
    return ok({ skipped: 'zoho_import' });
  }

  // Skip: already linked to Zoho
  if (externalRef) {
    console.log(`${FN} skipped estimate ${id}: already has external_ref`);
    return ok({ skipped: 'already_linked' });
  }

  const admin = createAdminClient();

  // Look up active Zoho integration for this tenant
  const integration = await lookupTenantZohoIntegration(admin, tenantId);
  if (!integration) {
    console.log(`${FN} skipped estimate ${id}: no active Zoho integration for tenant ${tenantId}`);
    return ok({ skipped: 'no_integration' });
  }

  // Fetch full estimate row (webhook record may be partial)
  const { data: estimate, error: estErr } = await admin
    .schema('app')
    .from('estimates')
    .select('id, tenant_id, buyer_id, estimate_number, source, external_ref, notes, status, total_amount, subtotal, tax_amount, currency, expires_at, place_of_supply, is_buyer_app_estimate')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (estErr || !estimate) {
    console.error(`${FN} failed to load estimate ${id}:`, estErr?.message);
    return ok({ error: 'estimate_not_found' });
  }

  // Double-check skip conditions on the authoritative DB row
  if (estimate.source === 'zoho_import' || estimate.external_ref) {
    return ok({ skipped: 'already_linked_or_import' });
  }

  // Fetch line items
  const { data: items, error: itemsErr } = await admin
    .schema('app')
    .from('estimate_items')
    .select('id, tenant_product_id, qty, unit_price, tax_rate, line_total')
    .eq('estimate_id', id)
    .is('deleted_at', null);

  if (itemsErr || !items || items.length === 0) {
    console.warn(`${FN} estimate ${id} has no line items — skipping push`);
    return ok({ skipped: 'no_line_items' });
  }

  // Resolve buyer Zoho contact_id
  const buyerId = estimate.buyer_id as string;
  const zohoContactId = await resolveBuyerZohoContactId(admin, buyerId);
  if (!zohoContactId) {
    const reason = `buyer ${buyerId} has no external_ref (not yet synced from Zoho)`;
    console.warn(`${FN} ${reason}`);
    await recordPushFailure(admin, {
      tenantId,
      integrationId: integration.integrationId,
      entityType: 'estimates',
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
      entityType: 'estimates',
      internalId: id,
      errorReason: reason,
    });
    return ok({ pending: 'missing_product_zoho_ids' });
  }

  // Resolve buyer GST info
  const gstInfo = await resolveBuyerGstInfo(admin, buyerId);

  // Build Zoho estimate payload (matches wineyard pattern exactly)
  const now = new Date();
  const today = formatIstDate(now);
  const expiry = formatIstDate(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000));
  const notesText = ['All prices inclusive of GST', estimate.notes as string | null]
    .filter(Boolean)
    .join('\n');

  const zohoBody: Record<string, unknown> = {
    customer_id: zohoContactId,
    date: today,
    expiry_date: expiry,
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

  if (estimate.is_buyer_app_estimate === true) {
    zohoBody.cf_catalog_estimate = true;
  }

  if (gstInfo.gstin && gstInfo.gst_treatment) {
    zohoBody.gst_treatment = gstInfo.gst_treatment;
    zohoBody.gst_no = gstInfo.gstin;
  }

  // Push to Zoho
  const adapter = buildZohoAdapter(integration, admin);
  let zohoEstimateId: string;
  let zohoEstimateNumber: string;
  let zohoEstimateUrl: string | null = null;

  try {
    const response = await adapter.request<Record<string, unknown>>({
      method: 'POST',
      path: '/estimates',
      body: zohoBody,
    });

    const est = response.estimate as Record<string, unknown> | undefined;
    zohoEstimateId = (est?.estimate_id as string | undefined) ?? '';
    zohoEstimateNumber = (est?.estimate_number as string | undefined) ?? '';

    if (!zohoEstimateId) {
      throw new Error(`Zoho did not return estimate_id. Response: ${JSON.stringify(response).slice(0, 1000)}`);
    }

    // Also try to grab the public URL from the response (some modules include it)
    zohoEstimateUrl = (est?.estimate_url as string | undefined) ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${FN} Zoho POST /estimates failed for estimate ${id}:`, msg);
    await recordPushFailure(admin, {
      tenantId,
      integrationId: integration.integrationId,
      entityType: 'estimates',
      internalId: id,
      errorReason: msg,
    });
    void sendTransactionalAcknowledgement(admin, {
      kind: 'estimate',
      outcome: 'pending',
      entityId: id,
      tenantId,
      buyerId,
    });
    return ok({ error: 'zoho_push_failed' });
  }

  // If URL not in create response, fetch it separately
  if (!zohoEstimateUrl) {
    try {
      const detail = await adapter.request<Record<string, unknown>>({
        method: 'GET',
        path: `/estimates/${zohoEstimateId}`,
      });
      const detailEst = detail.estimate as Record<string, unknown> | undefined;
      zohoEstimateUrl = (detailEst?.estimate_url as string | undefined) ?? null;
    } catch {
      // Non-fatal — URL is best-effort
      console.warn(`${FN} could not fetch estimate_url for ${zohoEstimateId}`);
    }
  }

  // Mark estimate as sent in Zoho (best-effort)
  try {
    await adapter.request({
      method: 'POST',
      path: `/estimates/${zohoEstimateId}/status/sent`,
    });
  } catch (err) {
    console.warn(`${FN} mark-sent failed for ${zohoEstimateId}:`, err instanceof Error ? err.message : err);
  }

  // Overwrite Yukti DB with Zoho's canonical values
  await recordPushSuccess(admin, {
    tenantId,
    integrationId: integration.integrationId,
    entityTable: 'estimates',
    entityType: 'estimates',
    internalId: id,
    externalZohoId: zohoEstimateId,
    extraFields: {
      estimate_number: zohoEstimateNumber,
      estimate_url: zohoEstimateUrl,
      status: 'sent',
      notes: notesText,
    },
  });

  if (zohoEstimateNumber) {
    void sendTransactionalAcknowledgement(admin, {
      kind: 'estimate',
      outcome: 'success',
      entityId: id,
      tenantId,
      buyerId,
      documentNumber: zohoEstimateNumber,
    });
  }

  // Echo guard — 30 min TTL prevents forward sync from reimporting this estimate
  await createEchoGuard(admin, {
    tenantId,
    integrationId: integration.integrationId,
    entityType: 'estimates',
    internalId: id,
    externalZohoId: zohoEstimateId,
    protectedFields: ['estimate_number', 'estimate_url', 'external_ref', 'status'],
  });

  console.log(`${FN} pushed estimate ${id} → Zoho ${zohoEstimateId} (${zohoEstimateNumber})`);
  return ok({ zoho_estimate_id: zohoEstimateId, estimate_number: zohoEstimateNumber });
});
