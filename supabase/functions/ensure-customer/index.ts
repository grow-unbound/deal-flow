/**
 * ensure-customer — fetch one Zoho contact by ID and upsert app.buyers (+ users,
 * price-list assignments). Uses refreshBuyerFromZoho (same path as webhook
 * ensureBuyerExists detail fetch). Intended for scripts/sync-contacts.sh
 * local-filter and incremental detail passes — NOT for full-catalog list sync
 * (use sync-customers).
 *
 *   curl -X POST "$SUPABASE_URL/functions/v1/ensure-customer" \
 *     -H "Content-Type: application/json" \
 *     -H "x-integrations-dispatch-secret: $INTEGRATIONS_DISPATCH_SECRET" \
 *     -d '{"tenant_integration_id":"<uuid>","contact_id":"<zoho_contact_id>"}'
 */
import {
  assertZohoIntegration,
  createAdminClient,
  createDbTokenCache,
  errorResponse,
  getDispatchSecret,
  isAuthorizedInternal,
  jsonResponse,
  loadIntegrationCredentials,
  loadTenantIntegration,
  resolveSyncImportActorId,
} from '../_shared/sync-utils.ts';
import { createZohoAdapter } from '../_shared/integrations-zoho.ts';
import { refreshBuyerFromZoho } from '../_shared/integrations-persist.ts';

interface EnsureCustomerRequest {
  tenant_integration_id: string;
  contact_id: string;
}

function parseRequest(req: Request): Promise<EnsureCustomerRequest> {
  return req.json().then((body: Record<string, unknown>) => {
    const tenantIntegrationId = typeof body.tenant_integration_id === 'string'
      ? body.tenant_integration_id.trim()
      : '';
    const contactId = typeof body.contact_id === 'string' ? body.contact_id.trim() : '';
    if (!tenantIntegrationId) throw new Error('tenant_integration_id is required');
    if (!contactId) throw new Error('contact_id is required');
    return { tenant_integration_id: tenantIntegrationId, contact_id: contactId };
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  if (getDispatchSecret() && !isAuthorizedInternal(req)) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const input = await parseRequest(req);
    const admin = createAdminClient();
    const integration = await loadTenantIntegration(admin, input.tenant_integration_id);
    const credentials = await loadIntegrationCredentials(admin, integration.id, integration.integration_type_id);
    const zohoTypeId = assertZohoIntegration(integration.integration_type_id);
    const tokenCache = createDbTokenCache(admin, integration.id);
    const adapter = createZohoAdapter(zohoTypeId, credentials, tokenCache);
    const importActorId = resolveSyncImportActorId(integration);

    const { buyerId, synced } = await refreshBuyerFromZoho(
      admin,
      integration.tenant_id,
      importActorId,
      integration.id,
      zohoTypeId,
      input.contact_id,
      adapter,
    );

    if (!buyerId) {
      return jsonResponse({
        ok: false,
        contact_id: input.contact_id,
        records_synced: 0,
        error: 'Contact not found in Zoho or persist failed',
      }, 404);
    }

    return jsonResponse({
      ok: true,
      contact_id: input.contact_id,
      buyer_id: buyerId,
      records_synced: synced,
    });
  } catch (err) {
    console.error('[ensure-customer]', err);
    return errorResponse(err instanceof Error ? err.message : 'Ensure customer failed');
  }
});
