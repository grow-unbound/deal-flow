/**
 * push-buyer-to-zoho — creates/updates the Zoho contact for a buyer whose access request was approved
 * in the seller Inbox, with custom field cf_online_catalogue_access = true.
 *
 * Invoked by app.dispatch_buyer_zoho_pushes() (pg_net; right after approval and every 5 min by pg_cron
 * for pending/failed entries) with { entry_id, tenant_id } and header x-push-secret.
 *
 * State machine lives in the DB (app.claim_buyer_zoho_push / app.record_buyer_zoho_push_result):
 *  - claim = attempt counter + 10 min lease, so overlapping invocations never double-push;
 *  - success -> entries.external_sync_status = 'synced'; failure -> 'failed' + error + backoff retry.
 *
 * Idempotency (never a duplicate Zoho contact):
 *  1. buyers.external_ref already set  -> only PUT the catalogue flag on that contact.
 *  2. else look the party up in Zoho by GSTIN / email / phone; a verified hit is adopted (PUT flag).
 *  3. else POST a new contact; a "duplicate name" rejection falls back to a name lookup and adopts it.
 *  The contact id is written to buyers.external_ref (unique per tenant) only when it is still NULL.
 *
 * Loop safety: this function only writes buyers.external_ref (no trigger pushes buyers to Zoho; the
 * update triggers were dropped in 20260720143720). The inbound contact sync upserts by
 * (tenant_id, external_ref), so it lands on this same buyer, and cf_online_catalogue_access=true
 * maps back to buyer_app_enabled=true (already true).
 *
 * Does NOT touch app.orders / app.estimates push paths.
 */

import { createAdminClient } from '../_shared/sync-utils.ts';
import {
  lookupTenantZohoIntegration,
  buildZohoAdapter,
  verifyPushSecret,
  ok,
} from '../_shared/push-zoho-utils.ts';
import {
  buildZohoContactCreatePayload,
  buildZohoContactUpdatePayload,
  isDuplicateContactError,
  isPricebookError,
  matchExistingContact,
  normalizePhone10,
  type BuyerForZoho,
  type ZohoContactSummary,
} from '../_shared/push-buyer-utils.ts';

const FN = '[push-buyer-to-zoho]';

type Admin = ReturnType<typeof createAdminClient>;
type Adapter = ReturnType<typeof buildZohoAdapter>;

async function searchContacts(adapter: Adapter, query: Record<string, string>): Promise<ZohoContactSummary[]> {
  const res = await adapter.request<Record<string, unknown>>({ method: 'GET', path: '/contacts', query });
  return ((res.contacts as ZohoContactSummary[] | undefined) ?? []).filter((c) => c.contact_id);
}

async function findExistingZohoContact(adapter: Adapter, buyer: BuyerForZoho): Promise<string | null> {
  const attempts: Array<Record<string, string>> = [];
  if (buyer.gstin?.trim()) attempts.push({ search_text: buyer.gstin.trim() });
  if (buyer.email?.trim()) attempts.push({ email: buyer.email.trim() });
  const phone = normalizePhone10(buyer.phone);
  if (phone) attempts.push({ phone });

  for (const query of attempts) {
    const hits = await searchContacts(adapter, query);
    for (const hit of hits) {
      if (matchExistingContact(buyer, hit)) return hit.contact_id as string;
    }
  }
  return null;
}

async function findContactByExactName(adapter: Adapter, name: string): Promise<string | null> {
  const hits = await searchContacts(adapter, { contact_name: name });
  const exact = hits.find((c) => c.contact_name?.trim().toLowerCase() === name.trim().toLowerCase());
  return exact?.contact_id ?? null;
}

async function putCatalogueFlag(adapter: Adapter, contactId: string, pricebookId: string | null): Promise<string | null> {
  const detail = await adapter.request<Record<string, unknown>>({ method: 'GET', path: `/contacts/${contactId}` });
  const contact = detail.contact as Record<string, unknown> | undefined;
  const name = (contact?.contact_name as string | undefined) ?? '';
  if (!name) throw new Error(`Zoho contact ${contactId} not found or has no name`);

  try {
    await adapter.request({ method: 'PUT', path: `/contacts/${contactId}`, body: buildZohoContactUpdatePayload(name, { pricebookId }) });
    return pricebookId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (pricebookId && isPricebookError(msg)) {
      // Pricebook is best-effort: never let it block catalogue access.
      await adapter.request({ method: 'PUT', path: `/contacts/${contactId}`, body: buildZohoContactUpdatePayload(name) });
      return null;
    }
    throw err;
  }
}

async function createContact(adapter: Adapter, buyer: BuyerForZoho, pricebookId: string | null): Promise<string> {
  const post = async (withPricebook: boolean) => {
    const res = await adapter.request<Record<string, unknown>>({
      method: 'POST',
      path: '/contacts',
      body: buildZohoContactCreatePayload(buyer, { pricebookId: withPricebook ? pricebookId : null }),
    });
    const id = (res.contact as Record<string, unknown> | undefined)?.contact_id as string | undefined;
    if (!id) throw new Error(`Zoho did not return contact_id. Response: ${JSON.stringify(res).slice(0, 500)}`);
    return id;
  };

  try {
    return await post(true);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (pricebookId && isPricebookError(msg)) return await post(false);
    if (isDuplicateContactError(msg)) {
      // A previous attempt (or a manual entry) already created a contact with this name: adopt, don't duplicate.
      const existing = await findContactByExactName(adapter, buyer.business_name);
      if (existing) {
        await putCatalogueFlag(adapter, existing, pricebookId).catch(() => null);
        return existing;
      }
    }
    throw err;
  }
}

async function loadBuyer(admin: Admin, tenantId: string, buyerId: string) {
  const { data, error } = await admin
    .schema('app')
    .from('buyers')
    .select('id, tenant_id, business_name, contact_name, email, phone, gstin, gst_treatment, billing_address, custom_fields, external_ref')
    .eq('id', buyerId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(`Failed to load buyer: ${error.message}`);
  return data as (BuyerForZoho & { external_ref: string | null }) | null;
}

async function recordResult(admin: Admin, entryId: string, status: 'synced' | 'failed' | 'not_required', error?: string, contactId?: string) {
  const { error: rpcError } = await admin.schema('app').rpc('record_buyer_zoho_push_result', {
    p_entry_id: entryId,
    p_status: status,
    p_error: error ?? null,
    p_contact_id: contactId ?? null,
  });
  if (rpcError) console.error(`${FN} failed to record result for ${entryId}:`, rpcError.message);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!verifyPushSecret(req)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return ok({ note: 'empty body' });
  }
  const entryId = typeof body.entry_id === 'string' ? body.entry_id : '';
  if (!entryId) return ok({ note: 'missing entry_id' });

  const admin = createAdminClient();

  const { data: claim, error: claimError } = await admin.schema('app').rpc('claim_buyer_zoho_push', { p_entry_id: entryId });
  if (claimError) {
    console.error(`${FN} claim failed for ${entryId}:`, claimError.message);
    return ok({ error: 'claim_failed' });
  }
  if (!claim?.claimed) return ok({ skipped: 'not_claimable' });

  const tenantId = claim.tenant_id as string;
  const buyerId = claim.buyer_id as string;
  const assignment = (claim.approval_assignment ?? {}) as Record<string, unknown>;
  const pricebookId = (assignment.price_list_external_ref as string | null | undefined) ?? null;

  try {
    const integration = await lookupTenantZohoIntegration(admin, tenantId);
    if (!integration) {
      // Tenant disconnected Zoho after approval: nothing to push.
      await recordResult(admin, entryId, 'not_required');
      return ok({ skipped: 'no_integration' });
    }

    const buyer = await loadBuyer(admin, tenantId, buyerId);
    if (!buyer) throw new Error('Buyer not found or deleted');

    const adapter = buildZohoAdapter(integration, admin);

    let contactId: string | null = buyer.external_ref;
    if (contactId) {
      await putCatalogueFlag(adapter, contactId, pricebookId);
    } else {
      contactId = await findExistingZohoContact(adapter, buyer);
      if (contactId) {
        await putCatalogueFlag(adapter, contactId, pricebookId);
      } else {
        contactId = await createContact(adapter, buyer, pricebookId);
      }

      // Never link one Zoho contact to two Yukti buyers (unique per tenant+external_ref).
      const { data: clash } = await admin
        .schema('app')
        .from('buyers')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('external_ref', contactId)
        .neq('id', buyerId)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      if (clash) {
        throw new Error(`Zoho contact ${contactId} is already linked to another customer (${clash.id}). Merge the duplicate customers manually, then retry.`);
      }

      const { error: linkError } = await admin
        .schema('app')
        .from('buyers')
        .update({ external_ref: contactId, updated_at: new Date().toISOString() })
        .eq('id', buyerId)
        .eq('tenant_id', tenantId)
        .is('external_ref', null);
      if (linkError) throw new Error(`Created Zoho contact ${contactId} but could not save external_ref: ${linkError.message}`);
    }

    await admin
      .schema('app')
      .from('integration_entity_map')
      .upsert(
        {
          tenant_id: tenantId,
          tenant_integration_id: integration.integrationId,
          entity_type: 'customers',
          external_id: contactId,
          internal_id: buyerId,
          sync_status: 'synced',
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,tenant_integration_id,entity_type,external_id' },
      );

    await recordResult(admin, entryId, 'synced', undefined, contactId);
    console.log(`${FN} buyer ${buyerId} -> Zoho contact ${contactId}`);
    return ok({ zoho_contact_id: contactId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${FN} push failed for entry ${entryId}:`, msg);
    await recordResult(admin, entryId, 'failed', msg);
    return ok({ error: 'zoho_push_failed' });
  }
});
