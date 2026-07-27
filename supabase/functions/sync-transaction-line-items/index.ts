/**
 * sync-transaction-line-items — hydrates estimates/orders/invoices with
 * their Zoho line-item detail. Automatically orchestrated ONLY as part of
 * the daily incremental sync (see resolvePhasesForPolicy in
 * sync-orchestration.ts) — never reachable through any manual sync trigger
 * (full sync, phase-group expansion, or an explicit phase request), and
 * hidden from the frontend phase grid entirely. It's the highest-volume
 * phase (line items across every estimate/order/invoice, one Zoho GET per
 * document), so controlled manual backfills are expected to call this
 * function DIRECTLY, bypassing the orchestrator, so the caller controls
 * pacing against Zoho's rate limit page-by-page.
 *
 * Manual invocation contract:
 *   - Omit `job_id` on the first call — a standalone job row is created
 *     with no master_job_id (never touched by the reaper/coordinator/cancel
 *     RPC), and its `id` comes back in the response.
 *   - `since`/`until` (both optional, inclusive, `YYYY-MM-DD`) bound the
 *     local estimate/order/invoice date window fetched. `since` persists on
 *     the job row across pages; `until` does NOT (no column for it) — pass
 *     it explicitly on every call when resuming a bounded range.
 *   - Pass the response's `job_id` + `next_cursor.page` as `page_from` on
 *     the next call to resume; `records_synced` accumulates correctly
 *     across calls. Stop when `has_more` is false.
 *
 *   curl -X POST "$SUPABASE_URL/functions/v1/sync-transaction-line-items" \
 *     -H "Content-Type: application/json" \
 *     -H "x-integrations-dispatch-secret: $INTEGRATIONS_DISPATCH_SECRET" \
 *     -d '{"tenant_integration_id":"<uuid>","since":"2026-06-01","until":"2026-06-30","batch_size":50}'
 *
 *   -- or from SQL (psql / SQL editor):
 *   select net.http_post(
 *     url := app.get_functions_base_url() || '/sync-transaction-line-items',
 *     headers := jsonb_build_object(
 *       'Content-Type', 'application/json',
 *       'x-integrations-dispatch-secret', current_setting('app.integrations_dispatch_secret', true)
 *     ),
 *     body := jsonb_build_object('tenant_integration_id', '<uuid>', 'since', '2026-06-01', 'until', '2026-06-30', 'batch_size', 50)
 *   );
 *   -- check progress:
 *   select id, status, records_synced, progress->'next_cursor'
 *   from app.integration_sync_jobs
 *   where phase = 'transaction_line_items' order by created_at desc limit 1;
 */
import {
  assertZohoIntegration,
  createAdminClient,
  createDbTokenCache,
  errorResponse,
  jsonResponse,
  loadIntegrationCredentials,
  loadTenantIntegration,
  resolveSyncImportActorId,
  updatePhaseJob,
  isSyncJobCancelled,
} from '../_shared/sync-utils.ts';
import { createZohoAdapter, ZOHO_DETAIL_FETCH_CONCURRENCY, ZOHO_DETAIL_FETCH_BATCH_PACE_MS } from '../_shared/integrations-zoho.ts';
import { persistZohoEntityPage } from '../_shared/integrations-persist.ts';
import { logCheckpoint, startTimer } from '../_shared/sync-log.ts';

type AdminClient = ReturnType<typeof createAdminClient>;
type TransactionKind = 'estimates' | 'orders' | 'invoices';

interface SyncLineItemRequest {
  tenant_integration_id: string;
  job_id?: string | null;
  page_from?: number | null;
  batch_size?: number | null;
  since?: string | null;
  until?: string | null;
}

interface LocalTransactionRow {
  kind: TransactionKind;
  id: string;
  external_ref: string;
}

const PHASE = 'transaction_line_items';
const KIND_ORDER: TransactionKind[] = ['estimates', 'orders', 'invoices'];
const DEFAULT_BATCH_SIZE = 50;
const TIME_BUDGET_MS = 115_000;

function nowIso(): string {
  return new Date().toISOString();
}

function labelForKind(kind: TransactionKind): string {
  if (kind === 'orders') return 'Sales orders';
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseRequest(req: Request): Promise<SyncLineItemRequest> {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const tenantIntegrationId = typeof body.tenant_integration_id === 'string'
    ? body.tenant_integration_id
    : null;
  if (!tenantIntegrationId) throw new Error('tenant_integration_id is required');

  return {
    tenant_integration_id: tenantIntegrationId,
    job_id: typeof body.job_id === 'string' ? body.job_id : null,
    page_from: typeof body.page_from === 'number' ? body.page_from : null,
    batch_size: typeof body.batch_size === 'number' ? body.batch_size : null,
    since: typeof body.since === 'string' ? body.since : null,
    until: typeof body.until === 'string' ? body.until : null,
  };
}

async function createLineItemJob(
  admin: AdminClient,
  opts: { tenantId: string; tenantIntegrationId: string; sinceDate?: string | null },
): Promise<string> {
  const { data, error } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .insert({
      tenant_id: opts.tenantId,
      tenant_integration_id: opts.tenantIntegrationId,
      job_type: 'initial_transactional',
      phase: PHASE,
      status: 'pending',
      progress: {},
      since_date: opts.sinceDate ?? null,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Unable to create transaction line-item job: ${error.message}`);
  return data.id as string;
}

async function loadLineItemJob(
  admin: AdminClient,
  jobId: string,
): Promise<{ id: string; since_date: string | null; records_synced: number | null; progress: Record<string, unknown> | null }> {
  const { data, error } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .select('id, since_date, records_synced, progress')
    .eq('id', jobId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(`Unable to load transaction line-item job: ${error.message}`);
  if (!data) throw new Error('Transaction line-item job not found');

  return {
    id: String(data.id),
    since_date: typeof data.since_date === 'string' ? data.since_date : null,
    records_synced: typeof data.records_synced === 'number' ? data.records_synced : null,
    progress: (data.progress && typeof data.progress === 'object') ? data.progress as Record<string, unknown> : null,
  };
}

type CountSnapshot = Record<TransactionKind, number> & { total: number };

// Frozen once per job, not re-queried per page. Previously each page call
// re-ran 3 COUNT(*) queries (estimates+orders+invoices) and used the fresh
// result as `total` for hasMore/offset math. Since the date filter is on
// document date (not created_at), any row landing inside the since/until
// window *while the backfill is running* (webhooks, the daily incremental
// job) silently grew `total` mid-run — the backfill chased a moving target
// instead of converging, running far more pages than the window's actual
// row count implied and eventually exceeding the caller's timeout.
function extractCountSnapshot(progress: Record<string, unknown> | null): CountSnapshot | null {
  const raw = progress?.count_snapshot;
  if (!raw || typeof raw !== 'object') return null;
  const snap = raw as Record<string, unknown>;
  const estimates = snap.estimates;
  const orders = snap.orders;
  const invoices = snap.invoices;
  const total = snap.total;
  if (
    typeof estimates !== 'number' || typeof orders !== 'number' ||
    typeof invoices !== 'number' || typeof total !== 'number'
  ) return null;
  return { estimates, orders, invoices, total };
}

async function computeCountSnapshot(
  admin: AdminClient,
  tenantId: string,
  sinceDate: string | null,
  untilDate: string | null,
): Promise<CountSnapshot> {
  const [estimates, orders, invoices] = await Promise.all([
    countRows(admin, 'estimates', tenantId, sinceDate, untilDate),
    countRows(admin, 'orders', tenantId, sinceDate, untilDate),
    countRows(admin, 'invoices', tenantId, sinceDate, untilDate),
  ]);
  return { estimates, orders, invoices, total: estimates + orders + invoices };
}

async function countRows(
  admin: AdminClient,
  table: TransactionKind,
  tenantId: string,
  sinceDate: string | null,
  untilDate: string | null,
): Promise<number> {
  const dateColumn = getDocumentDateColumn(table);
  const query = admin
    .schema('app')
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .not('external_ref', 'is', null)
    .is('deleted_at', null);

  if (sinceDate) {
    query.gte(dateColumn, sinceDate);
  }
  if (untilDate) {
    query.lte(dateColumn, untilDate);
  }

  const { count, error } = await query;

  if (error) throw new Error(`Unable to count ${table}: ${error.message}`);
  return count ?? 0;
}

function getDocumentDateColumn(kind: TransactionKind): string {
  switch (kind) {
    case 'estimates':
      return 'estimate_date';
    case 'orders':
      return 'order_date';
    case 'invoices':
      return 'invoice_date';
  }
}

async function loadRowsForKind(
  admin: AdminClient,
  table: TransactionKind,
  tenantId: string,
  offset: number,
  limit: number,
  sinceDate: string | null,
  untilDate: string | null,
): Promise<LocalTransactionRow[]> {
  if (limit <= 0) return [];

  const dateColumn = getDocumentDateColumn(table);
  const query = admin
    .schema('app')
    .from(table)
    .select('id, external_ref')
    .eq('tenant_id', tenantId)
    .not('external_ref', 'is', null)
    .is('deleted_at', null);

  if (sinceDate) {
    query.gte(dateColumn, sinceDate);
  }
  if (untilDate) {
    query.lte(dateColumn, untilDate);
  }

  const { data, error } = await query
    .order(dateColumn, { ascending: true })
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`Unable to load ${table}: ${error.message}`);

  return (data ?? [])
    .map((row) => ({
      kind: table,
      id: String((row as { id: unknown }).id),
      external_ref: String((row as { external_ref: unknown }).external_ref ?? ''),
    }))
    .filter((row) => row.external_ref.length > 0);
}

async function loadTransactionBatch(
  admin: AdminClient,
  tenantId: string,
  page: number,
  batchSize: number,
  sinceDate: string | null,
  untilDate: string | null,
  snapshot: CountSnapshot,
): Promise<{ rows: LocalTransactionRow[]; total: number; counts: Record<TransactionKind, number> }> {
  const counts = {
    estimates: snapshot.estimates,
    orders: snapshot.orders,
    invoices: snapshot.invoices,
  };
  const total = snapshot.total;
  let remainingOffset = (page - 1) * batchSize;
  let remainingLimit = batchSize;
  const rows: LocalTransactionRow[] = [];

  for (const kind of KIND_ORDER) {
    const count = counts[kind];
    if (remainingOffset >= count) {
      remainingOffset -= count;
      continue;
    }

    const kindRows = await loadRowsForKind(admin, kind, tenantId, remainingOffset, remainingLimit, sinceDate, untilDate);
    rows.push(...kindRows);
    remainingLimit -= kindRows.length;
    remainingOffset = 0;

    if (remainingLimit <= 0) break;
  }

  return { rows, total, counts };
}

function buildProgress(opts: {
  page: number;
  batchSize: number;
  pagesFetched: number;
  processed: number;
  failed: number;
  total: number;
  counts: Record<TransactionKind, { processed: number; failed: number }>;
  nextCursor?: Record<string, unknown> | null;
  countSnapshot?: CountSnapshot | null;
}): Record<string, unknown> {
  const countEntries = Object.fromEntries(
    KIND_ORDER.map((kind) => [
      kind,
      {
        entity_type: kind,
        processed: opts.counts[kind].processed,
        failed: opts.counts[kind].failed,
        pages: opts.pagesFetched,
      },
    ]),
  );

  return {
    phase: PHASE,
    phase_label: 'Hydrating transaction line items',
    phase_group: 'transactional',
    phase_group_label: 'Transactions',
    phases: [PHASE],
    pages_fetched: opts.pagesFetched,
    records_synced: opts.processed,
    items_processed: opts.processed + opts.failed,
    items_failed: opts.failed,
    items_total: opts.total,
    counts: countEntries,
    cursor: opts.nextCursor ?? null,
    ...(opts.nextCursor ? { next_cursor: opts.nextCursor } : {}),
    // Round-trips through the job row's progress column so the next
    // page-continuation call can reuse it instead of re-counting.
    ...(opts.countSnapshot ? { count_snapshot: opts.countSnapshot } : {}),
    meta: {
      page: opts.page,
      per_page: opts.batchSize,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const admin = createAdminClient();
  let jobId: string | null = null;
  let tenantIntegrationId: string | null = null;
  let loadedIntegrationId: string | null = null;

  try {
    const input = await parseRequest(req);
    tenantIntegrationId = input.tenant_integration_id;
    const integration = await loadTenantIntegration(admin, input.tenant_integration_id);
    loadedIntegrationId = integration.id;
    const zohoTypeId = assertZohoIntegration(integration.integration_type_id);
    const credentials = await loadIntegrationCredentials(admin, integration.id, integration.integration_type_id);
    const tokenCache = createDbTokenCache(admin, integration.id);
    // jobId isn't known yet at adapter-creation time (it's assigned right
    // below) — capture it by closure so the heartbeat touch reads the
    // current value once Zoho calls actually start happening. Without this,
    // this bespoke sync path (it doesn't go through runPhaseSync) had zero
    // heartbeat coverage at all, not even on retries — the highest-volume
    // phase (line items across every estimate/order/invoice) was the least
    // protected against looking falsely stale/dead to the reaper.
    const touchHeartbeat = () => {
      if (!jobId) return;
      admin.schema('app').from('integration_sync_jobs')
        .update({ heartbeat_at: new Date().toISOString() })
        .eq('id', jobId)
        .then(() => {}, () => {});
    };
    const adapter = createZohoAdapter(zohoTypeId, credentials, tokenCache, touchHeartbeat);

    jobId = input.job_id ?? await createLineItemJob(admin, {
      tenantId: integration.tenant_id,
      tenantIntegrationId: integration.id,
      sinceDate: input.since ?? null,
    });
    const job = await loadLineItemJob(admin, jobId);
    const sinceDate = input.since ?? job.since_date;
    // Unlike since_date, there's no until column on the job row — a
    // manual/standalone caller resuming a range fetch across multiple pages
    // must pass `until` on every call (see this function's manual-trigger
    // docs). Orchestrated incremental dispatch never sends `until`.
    const untilDate = input.until ?? null;

    // Compute once per job and freeze — see extractCountSnapshot's comment.
    // Reused from the job row's stored progress on every resume call so a
    // multi-page backfill counts estimates+orders+invoices exactly once,
    // not 3 queries x every page, and never chases a total that grows out
    // from under it mid-run.
    const countSnapshot = extractCountSnapshot(job.progress)
      ?? await computeCountSnapshot(admin, integration.tenant_id, sinceDate, untilDate);

    const page = normalizePositiveInt(input.page_from, 1);
    const batchSize = Math.min(normalizePositiveInt(input.batch_size, DEFAULT_BATCH_SIZE), 100);
    const startedAt = nowIso();
    const startedMs = Date.now();

    if (await isSyncJobCancelled(admin, jobId)) {
      return jsonResponse({ ok: false, phase: PHASE, records_synced: 0, has_more: false, next_cursor: null, cancelled: true });
    }

    await updatePhaseJob(admin, jobId, {
      status: 'running',
      started_at: startedAt,
      progress: buildProgress({
        page,
        batchSize,
        pagesFetched: Math.max(0, page - 1),
        processed: 0,
        failed: 0,
        total: 0,
        counts: {
          estimates: { processed: 0, failed: 0 },
          orders: { processed: 0, failed: 0 },
          invoices: { processed: 0, failed: 0 },
        },
        countSnapshot,
      }),
    });

    const loadBatchDone = startTimer(jobId, PHASE, 'loadTransactionBatch');
    const batch = await loadTransactionBatch(admin, integration.tenant_id, page, batchSize, sinceDate, untilDate, countSnapshot);
    loadBatchDone({ rows: batch.rows.length, total: batch.total });
    const recordsByKind: Record<TransactionKind, Record<string, unknown>[]> = {
      estimates: [],
      orders: [],
      invoices: [],
    };
    const counts: Record<TransactionKind, { processed: number; failed: number }> = {
      estimates: { processed: 0, failed: 0 },
      orders: { processed: 0, failed: 0 },
      invoices: { processed: 0, failed: 0 },
    };

    // Concurrent batches of ZOHO_DETAIL_FETCH_CONCURRENCY, paced
    // ZOHO_DETAIL_FETCH_BATCH_PACE_MS apart — same model as
    // fetchAndPersistMissingItemLocations (integrations-persist.ts), sized to
    // Zoho's documented 10-concurrent/100-per-minute limits. Replaces the
    // previous one-item-at-a-time loop, which was the primary suspect
    // whenever this phase (highest volume: 20k+ line items) hung.
    logCheckpoint(jobId, PHASE, 'detailFetchLoop:start', { rows: batch.rows.length });
    for (let i = 0; i < batch.rows.length; i += ZOHO_DETAIL_FETCH_CONCURRENCY) {
      if (await isSyncJobCancelled(admin, jobId)) {
        return jsonResponse({ ok: false, phase: PHASE, job_id: jobId, records_synced: 0, has_more: false, next_cursor: null, cancelled: true });
      }

      const batchStart = Date.now();
      const rowBatch = batch.rows.slice(i, i + ZOHO_DETAIL_FETCH_CONCURRENCY);
      const batchDone = startTimer(jobId, PHASE, `detailFetchBatch${Math.floor(i / ZOHO_DETAIL_FETCH_CONCURRENCY) + 1}`);
      const outcomes = await Promise.allSettled(rowBatch.map((row) =>
        row.kind === 'estimates'
          ? adapter.fetchEstimateById(row.external_ref)
          : row.kind === 'orders'
          ? adapter.fetchSalesOrderById(row.external_ref)
          : adapter.fetchInvoiceById(row.external_ref)
      ));
      batchDone({ items: rowBatch.length });

      for (let j = 0; j < outcomes.length; j++) {
        const row = rowBatch[j];
        const outcome = outcomes[j];
        if (outcome.status === 'rejected') {
          console.warn(`sync-transaction-line-items: fetch failed for ${row.kind}:${row.external_ref}:`, outcome.reason);
          counts[row.kind].failed++;
          continue;
        }
        if (outcome.value) {
          recordsByKind[row.kind].push(outcome.value);
          counts[row.kind].processed++;
        } else {
          counts[row.kind].failed++;
        }
      }

      const isLastBatch = i + ZOHO_DETAIL_FETCH_CONCURRENCY >= batch.rows.length;
      if (!isLastBatch) {
        const elapsed = Date.now() - batchStart;
        if (elapsed < ZOHO_DETAIL_FETCH_BATCH_PACE_MS) await sleep(ZOHO_DETAIL_FETCH_BATCH_PACE_MS - elapsed);
      }

      if (Date.now() - startedMs > TIME_BUDGET_MS) break;
    }
    logCheckpoint(jobId, PHASE, 'detailFetchLoop:done', { counts });

    // The coordinator reuses this same jobId across every page (dispatch_next_page
    // re-invokes with page_from advanced) — seed from the row's already persisted
    // records_synced on resume, or each page's write overwrites the running total.
    let persisted = page > 1 ? (job.records_synced ?? 0) : 0;
    const importActorId = resolveSyncImportActorId(integration);
    for (const kind of KIND_ORDER) {
      if (recordsByKind[kind].length === 0) continue;
      const result = await persistZohoEntityPage(
        admin,
        integration.tenant_id,
        importActorId,
        integration.id,
        kind,
        zohoTypeId,
        recordsByKind[kind],
        adapter,
      );
      persisted += result.created + result.updated;
    }

    const processed = KIND_ORDER.reduce((sum, kind) => sum + counts[kind].processed, 0);
    const failed = KIND_ORDER.reduce((sum, kind) => sum + counts[kind].failed, 0);
    const completedFullBatch = processed + failed >= batch.rows.length;
    const hasMore = ((page - 1) * batchSize) + batch.rows.length < batch.total || !completedFullBatch;
    const nextPage = completedFullBatch ? page + 1 : page;
    const nextCursor = hasMore
      ? {
          phase: PHASE,
          entity_type: PHASE,
          page: nextPage,
          per_page: batchSize,
          has_more: true,
          since: null,
        }
      : null;
    const pagesFetched = completedFullBatch ? page : Math.max(0, page - 1);
    const progress = buildProgress({
      page,
      batchSize,
      pagesFetched,
      processed,
      failed,
      total: batch.total,
      counts,
      nextCursor,
      countSnapshot,
    });

    if (hasMore) {
      await updatePhaseJob(admin, jobId, {
        status: 'paused',
        records_synced: persisted,
        next_cursor: nextCursor,
        progress,
        summary: {
          since: sinceDate,
          page_from: page,
          next_page: nextPage,
          total_processed: processed,
          total_failed: failed,
          note: `Paused after page ${page} of ${Math.ceil(batch.total / batchSize)}; continuing from page ${nextPage}.`,
          last_synced_at: nowIso(),
        },
      });
      return jsonResponse({
        ok: true,
        phase: PHASE,
        job_id: jobId,
        records_synced: persisted,
        has_more: true,
        next_cursor: nextCursor,
      });
    }

    const completedAt = nowIso();
    await updatePhaseJob(admin, jobId, {
      status: 'completed',
      records_synced: persisted,
      completed_at: completedAt,
      progress,
      summary: {
        since: sinceDate,
        phases_completed: [PHASE],
        counts: progress.counts as Record<string, unknown>,
        last_synced_at: completedAt,
        total_processed: processed,
        total_failed: failed,
        note: `Hydrated line items for ${processed} transaction${processed === 1 ? '' : 's'}${failed > 0 ? `; ${failed} missing details` : ''}.`,
        by_type: Object.fromEntries(KIND_ORDER.map((kind) => [labelForKind(kind), counts[kind]])),
      },
    });

    return jsonResponse({
      ok: true,
      phase: PHASE,
      job_id: jobId,
      records_synced: persisted,
      has_more: false,
      next_cursor: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transaction line-item sync failed';
    console.error('[sync-transaction-line-items]', err);

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
