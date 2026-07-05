import {
  assertZohoIntegration,
  createAdminClient,
  createDbTokenCache,
  errorResponse,
  jsonResponse,
  loadIntegrationCredentials,
  loadTenantIntegration,
  updatePhaseJob,
} from '../_shared/sync-utils.ts';
import { createZohoAdapter } from '../_shared/integrations-zoho.ts';
import { persistZohoEntityPage } from '../_shared/integrations-persist.ts';

type AdminClient = ReturnType<typeof createAdminClient>;
type TransactionKind = 'estimates' | 'orders' | 'invoices';

interface SyncLineItemRequest {
  tenant_integration_id: string;
  job_id?: string | null;
  page_from?: number | null;
  batch_size?: number | null;
}

interface LocalTransactionRow {
  kind: TransactionKind;
  id: string;
  external_ref: string;
}

const PHASE = 'transaction_line_items';
const KIND_ORDER: TransactionKind[] = ['estimates', 'orders', 'invoices'];
const DEFAULT_BATCH_SIZE = 25;
const TIME_BUDGET_MS = 115_000;
const DEFAULT_PACE_MS = 150;

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
  };
}

async function createLineItemJob(
  admin: AdminClient,
  opts: { tenantId: string; tenantIntegrationId: string },
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
    })
    .select('id')
    .single();

  if (error) throw new Error(`Unable to create transaction line-item job: ${error.message}`);
  return data.id as string;
}

async function setIntegrationStatus(
  admin: AdminClient,
  integrationId: string,
  status: 'connected' | 'sync_failed' | 'syncing',
): Promise<void> {
  await admin
    .schema('app')
    .from('tenant_integrations')
    .update({ status, updated_at: nowIso() })
    .eq('id', integrationId);
}

async function countRows(admin: AdminClient, table: TransactionKind, tenantId: string): Promise<number> {
  const { count, error } = await admin
    .schema('app')
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .not('external_ref', 'is', null)
    .is('deleted_at', null);

  if (error) throw new Error(`Unable to count ${table}: ${error.message}`);
  return count ?? 0;
}

async function loadRowsForKind(
  admin: AdminClient,
  table: TransactionKind,
  tenantId: string,
  offset: number,
  limit: number,
): Promise<LocalTransactionRow[]> {
  if (limit <= 0) return [];

  const { data, error } = await admin
    .schema('app')
    .from(table)
    .select('id, external_ref')
    .eq('tenant_id', tenantId)
    .not('external_ref', 'is', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
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
): Promise<{ rows: LocalTransactionRow[]; total: number; counts: Record<TransactionKind, number> }> {
  const counts = {
    estimates: await countRows(admin, 'estimates', tenantId),
    orders: await countRows(admin, 'orders', tenantId),
    invoices: await countRows(admin, 'invoices', tenantId),
  };
  const total = counts.estimates + counts.orders + counts.invoices;
  let remainingOffset = (page - 1) * batchSize;
  let remainingLimit = batchSize;
  const rows: LocalTransactionRow[] = [];

  for (const kind of KIND_ORDER) {
    const count = counts[kind];
    if (remainingOffset >= count) {
      remainingOffset -= count;
      continue;
    }

    const kindRows = await loadRowsForKind(admin, kind, tenantId, remainingOffset, remainingLimit);
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
    const adapter = createZohoAdapter(zohoTypeId, credentials, tokenCache);

    jobId = input.job_id ?? await createLineItemJob(admin, {
      tenantId: integration.tenant_id,
      tenantIntegrationId: integration.id,
    });

    const page = normalizePositiveInt(input.page_from, 1);
    const batchSize = Math.min(normalizePositiveInt(input.batch_size, DEFAULT_BATCH_SIZE), 100);
    const paceMs = normalizePositiveInt(
      Number(Deno.env.get('ZOHO_TRANSACTION_LINE_ITEM_PACE_MS') ?? DEFAULT_PACE_MS),
      DEFAULT_PACE_MS,
    );
    const startedAt = nowIso();
    const startedMs = Date.now();

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
      }),
    });

    const batch = await loadTransactionBatch(admin, integration.tenant_id, page, batchSize);
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

    for (const [index, row] of batch.rows.entries()) {
      const detail = row.kind === 'estimates'
        ? await adapter.fetchEstimateById(row.external_ref)
        : row.kind === 'orders'
        ? await adapter.fetchSalesOrderById(row.external_ref)
        : await adapter.fetchInvoiceById(row.external_ref);

      if (detail) {
        recordsByKind[row.kind].push(detail);
        counts[row.kind].processed++;
      } else {
        counts[row.kind].failed++;
      }

      if (index < batch.rows.length - 1) await sleep(paceMs);
      if (Date.now() - startedMs > TIME_BUDGET_MS) break;
    }

    let persisted = 0;
    for (const kind of KIND_ORDER) {
      if (recordsByKind[kind].length === 0) continue;
      const result = await persistZohoEntityPage(
        admin,
        integration.tenant_id,
        null,
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
    });

    if (hasMore) {
      await updatePhaseJob(admin, jobId, {
        status: 'paused',
        records_synced: persisted,
        next_cursor: nextCursor,
        progress,
      });
      await setIntegrationStatus(admin, integration.id, 'connected');
      return jsonResponse({
        ok: true,
        phase: PHASE,
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
        since: null,
        phases_completed: [PHASE],
        counts: progress.counts as Record<string, unknown>,
        last_synced_at: completedAt,
        total_processed: processed,
        total_failed: failed,
        note: `Hydrated line items for ${processed} transaction${processed === 1 ? '' : 's'}${failed > 0 ? `; ${failed} missing details` : ''}.`,
        by_type: Object.fromEntries(KIND_ORDER.map((kind) => [labelForKind(kind), counts[kind]])),
      },
    });
    await setIntegrationStatus(admin, integration.id, 'connected');

    return jsonResponse({
      ok: true,
      phase: PHASE,
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
    const failedIntegrationId = loadedIntegrationId ?? tenantIntegrationId;
    if (failedIntegrationId) {
      await setIntegrationStatus(admin, failedIntegrationId, 'sync_failed').catch(() => {});
    }

    return errorResponse(message);
  }
});
