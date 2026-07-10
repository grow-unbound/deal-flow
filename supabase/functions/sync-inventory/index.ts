/**
 * sync-inventory — dedicated phase for per-product warehouse/stock levels.
 *
 * Split out of sync-products (see integrations-persist.ts's persistProducts
 * comment) because Zoho's /items list response doesn't embed warehouse data
 * for every tenant — fetching stock detail for every product one item-id at
 * a time inside the products page-persist step had no time budget, no
 * per-batch heartbeat, and no incremental persistence, so it could hang for
 * many minutes and get platform-killed before writing a single row.
 *
 * This phase paginates over already-synced LOCAL tenant_products (not
 * Zoho's list endpoint) and detail-fetches (GET /items/{id}) each page's
 * items via fetchAndPersistMissingItemLocations, which persists and
 * heartbeats after every batch and is paced to Zoho's documented limits
 * (10 concurrent calls, 100 requests/minute/org).
 */
import {
  createAdminClient,
  loadTenantIntegration,
  loadIntegrationCredentials,
  createDbTokenCache,
  resolveSyncImportActorId,
  isSyncJobCancelled,
  updatePhaseJob,
  jsonResponse,
  errorResponse,
  assertZohoIntegration,
} from '../_shared/sync-utils.ts';
import { createZohoAdapter } from '../_shared/integrations-zoho.ts';
import { fetchAndPersistMissingItemLocations } from '../_shared/integrations-persist.ts';
import { logCheckpoint, startTimer } from '../_shared/sync-log.ts';

type AdminClient = ReturnType<typeof createAdminClient>;

interface SyncInventoryRequest {
  tenant_integration_id: string;
  job_id?: string | null;
  page_from?: number | null;
  per_page?: number | null;
}

const PHASE = 'inventory';
// 10 batches of ITEM_LOC_CONCURRENCY(=10) per page, paced ~6s apart —
// comfortably inside TIME_BUDGET_MS even at worst-case per-batch latency.
const DEFAULT_PAGE_SIZE = 100;
// Mirrors runPhaseSync's TIME_BUDGET_MS (sync-utils.ts): stop before
// Supabase's ~150s hard limit and hand off a resume cursor.
const TIME_BUDGET_MS = 110_000;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

async function parseRequest(req: Request): Promise<SyncInventoryRequest> {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const tenantIntegrationId = typeof body.tenant_integration_id === 'string' ? body.tenant_integration_id : null;
  if (!tenantIntegrationId) throw new Error('tenant_integration_id is required');
  return {
    tenant_integration_id: tenantIntegrationId,
    job_id: typeof body.job_id === 'string' ? body.job_id : null,
    page_from: typeof body.page_from === 'number' ? body.page_from : null,
    per_page: typeof body.per_page === 'number' ? body.per_page : null,
  };
}

async function loadProductPage(
  admin: AdminClient,
  tenantId: string,
  page: number,
  pageSize: number,
): Promise<{ rows: { id: string; externalRef: string }[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const { data, error, count } = await admin
    .schema('app')
    .from('tenant_products')
    .select('id, external_ref', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .not('external_ref', 'is', null)
    .is('deleted_at', null)
    .order('id', { ascending: true })
    .range(offset, offset + pageSize - 1);

  if (error) throw new Error(`Unable to load tenant_products page: ${error.message}`);

  const rows = (data ?? [])
    .map((row) => ({
      id: String((row as { id: unknown }).id),
      externalRef: String((row as { external_ref: unknown }).external_ref ?? ''),
    }))
    .filter((row) => row.externalRef.length > 0);

  return { rows, total: count ?? 0 };
}

function buildProgress(opts: {
  page: number;
  pageSize: number;
  pagesFetched: number;
  processed: number;
  total: number;
  nextCursor?: Record<string, unknown> | null;
}): Record<string, unknown> {
  return {
    phase: PHASE,
    phase_label: 'Syncing inventory levels',
    phase_group: 'reference',
    phase_group_label: 'Reference Data',
    phases: [PHASE],
    pages_fetched: opts.pagesFetched,
    records_synced: opts.processed,
    items_processed: opts.processed,
    items_total: opts.total,
    counts: {
      [PHASE]: {
        entity_type: PHASE,
        processed: opts.processed,
        failed: 0,
        pages: opts.pagesFetched,
      },
    },
    cursor: opts.nextCursor ?? null,
    ...(opts.nextCursor ? { next_cursor: opts.nextCursor } : {}),
    meta: {
      page: opts.page,
      per_page: opts.pageSize,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const admin = createAdminClient();
  let jobId: string | null = null;

  try {
    const input = await parseRequest(req);
    jobId = input.job_id ?? null;

    const integration = await loadTenantIntegration(admin, input.tenant_integration_id);
    const zohoTypeId = assertZohoIntegration(integration.integration_type_id);
    const credentials = await loadIntegrationCredentials(admin, integration.id, integration.integration_type_id);
    const tokenCache = createDbTokenCache(admin, integration.id);

    // Fires on every completed Zoho call (see integrations-zoho.ts's
    // fetchZohoResponse) AND after every persisted batch below — this phase
    // is the direct replacement for the loop that used to go 5-27 minutes
    // with a single heartbeat write.
    const touchHeartbeat = () => {
      if (!jobId) return;
      admin.schema('app').from('integration_sync_jobs')
        .update({ heartbeat_at: nowIso() })
        .eq('id', jobId)
        .then(() => {}, () => {});
    };
    const adapter = createZohoAdapter(zohoTypeId, credentials, tokenCache, touchHeartbeat);

    if (jobId && await isSyncJobCancelled(admin, jobId)) {
      return jsonResponse({ ok: false, phase: PHASE, records_synced: 0, has_more: false, next_cursor: null, cancelled: true });
    }

    const page = normalizePositiveInt(input.page_from, 1);
    const pageSize = Math.min(normalizePositiveInt(input.per_page, DEFAULT_PAGE_SIZE), 200);
    const startedAt = nowIso();
    const deadlineMs = Date.now() + TIME_BUDGET_MS;

    if (jobId) {
      await updatePhaseJob(admin, jobId, {
        status: 'running',
        started_at: startedAt,
        progress: buildProgress({ page, pageSize, pagesFetched: Math.max(0, page - 1), processed: 0, total: 0 }),
      });
    }

    const importActorId = resolveSyncImportActorId(integration);

    const loadDone = startTimer(jobId, PHASE, 'loadProductPage');
    const { rows, total } = await loadProductPage(admin, integration.tenant_id, page, pageSize);
    loadDone({ rows: rows.length, total });

    const productIdMap = new Map(rows.map((r) => [r.externalRef, r.id] as const));
    const itemIds = rows.map((r) => r.externalRef);

    logCheckpoint(jobId, PHASE, 'detailFetchLoop:start', { items: itemIds.length });
    const fetchResult = await fetchAndPersistMissingItemLocations(
      admin,
      integration.tenant_id,
      importActorId,
      integration.id,
      itemIds,
      adapter,
      productIdMap,
      new Map(),
      {
        onBatchComplete: touchHeartbeat,
        deadlineMs,
      },
    );
    logCheckpoint(jobId, PHASE, 'detailFetchLoop:done', { persisted: fetchResult.persisted, incomplete: fetchResult.incomplete });

    const offset = (page - 1) * pageSize;
    // A batch-deadline break (fetchResult.incomplete) means this same page
    // still has un-attempted items — retry the same page next invocation
    // rather than a full-phase restart or a re-fetch of already-done pages.
    const pageComplete = !fetchResult.incomplete;
    const morePagesRemain = offset + rows.length < total;
    const hasMore = !pageComplete || morePagesRemain;
    const nextPage = pageComplete ? page + 1 : page;
    const pagesFetched = pageComplete ? page : Math.max(0, page - 1);

    const nextCursor = hasMore
      ? {
          phase: PHASE,
          entity_type: PHASE,
          page: nextPage,
          per_page: pageSize,
          has_more: true,
        }
      : null;

    const progress = buildProgress({
      page,
      pageSize,
      pagesFetched,
      processed: fetchResult.persisted,
      total,
      nextCursor,
    });

    if (hasMore) {
      if (jobId) {
        await updatePhaseJob(admin, jobId, {
          status: 'paused',
          records_synced: fetchResult.persisted,
          next_cursor: nextCursor,
          progress,
          summary: {
            page_from: page,
            next_page: nextPage,
            total_processed: fetchResult.persisted,
            note: pageComplete
              ? `Paused after page ${page} of ${Math.ceil(total / pageSize)}; continuing from page ${nextPage}.`
              : `Paused mid-page ${page} (time budget); resuming page ${page}.`,
            last_synced_at: nowIso(),
          },
        });
      }
      return jsonResponse({
        ok: true,
        phase: PHASE,
        records_synced: fetchResult.persisted,
        has_more: true,
        next_cursor: nextCursor,
      });
    }

    const completedAt = nowIso();
    if (jobId) {
      await updatePhaseJob(admin, jobId, {
        status: 'completed',
        records_synced: fetchResult.persisted,
        completed_at: completedAt,
        progress,
        summary: {
          phases_completed: [PHASE],
          total_processed: fetchResult.persisted,
          last_synced_at: completedAt,
          note: `Synced inventory for ${fetchResult.persisted} product/warehouse row${fetchResult.persisted === 1 ? '' : 's'}.`,
        },
      });
    }

    return jsonResponse({
      ok: true,
      phase: PHASE,
      records_synced: fetchResult.persisted,
      has_more: false,
      next_cursor: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Inventory sync failed';
    console.error('[sync-inventory]', err);

    if (jobId) {
      await updatePhaseJob(admin, jobId, {
        status: 'failed',
        completed_at: nowIso(),
        error_message: message,
      }).catch(() => {});
    }

    return errorResponse(message);
  }
});
