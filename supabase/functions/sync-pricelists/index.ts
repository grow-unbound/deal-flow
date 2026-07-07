import {
  createAdminClient,
  loadTenantIntegration,
  loadIntegrationCredentials,
  assertZohoIntegration,
  updatePhaseJob,
  isSyncJobCancelled,
  jsonResponse,
  errorResponse,
  parseSyncRequest,
} from '../_shared/sync-utils.ts';
import { createZohoAdapter } from '../_shared/integrations-zoho.ts';
import { persistZohoEntityPage } from '../_shared/integrations-persist.ts';

// Pricelists are special: the list endpoint returns headers only;
// we must GET /pricebooks/{id} for each pricebook to get line items.
// fetchPricelists() + fetchPricebookDetail() handle this in the adapter,
// and persistZohoEntityPage('pricelists') upserts both price_lists and price_list_items.
//
// Because pricebooks are few (typically <100) and each detail fetch is a separate API call,
// we process all of them in a single invocation (no pagination loop needed).

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const input = await parseSyncRequest(req);
    const admin = createAdminClient();
    const integration = await loadTenantIntegration(admin, input.tenant_integration_id);
    const credentials = await loadIntegrationCredentials(admin, integration.id, integration.integration_type_id);
    const zohoTypeId = assertZohoIntegration(integration.integration_type_id);
    const adapter = createZohoAdapter(zohoTypeId, credentials);

    if (input.job_id) {
      if (await isSyncJobCancelled(admin, input.job_id)) {
        return jsonResponse({ ok: false, phase: 'pricelists', records_synced: 0, has_more: false, next_cursor: null, cancelled: true });
      }
      await updatePhaseJob(admin, input.job_id, {
        status: 'running',
        started_at: new Date().toISOString(),
      });
    }

    // Fetch all pricebook headers
    const pricebooks = await adapter.fetchPricelists();

    let totalSynced = 0;
    if (pricebooks.length > 0) {
      const result = await persistZohoEntityPage(
        admin,
        integration.tenant_id,
        null,
        integration.id,
        'pricelists',
        zohoTypeId,
        pricebooks,
        adapter,
      );
      totalSynced = result.created + result.updated;
    }

    if (input.job_id) {
      if (await isSyncJobCancelled(admin, input.job_id)) {
        return jsonResponse({ ok: false, phase: 'pricelists', records_synced: totalSynced, has_more: false, next_cursor: null, cancelled: true });
      }
      await updatePhaseJob(admin, input.job_id, {
        status: 'completed',
        records_synced: totalSynced,
        completed_at: new Date().toISOString(),
        progress: { pricebooks_fetched: pricebooks.length },
      });
    }

    return jsonResponse({
      ok: true,
      phase: 'pricelists',
      records_synced: totalSynced,
      has_more: false,
      next_cursor: null,
    });
  } catch (err) {
    console.error('[sync-pricelists]', err);
    return errorResponse(err instanceof Error ? err.message : 'Sync failed');
  }
});
