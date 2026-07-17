/**
 * sync-utils.ts
 * Shared utilities for sequential per-entity sync-* Edge Functions.
 * Each sync-{entity} function imports from here instead of the monolithic runtime.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import type { ZohoIntegrationTypeId } from '../../../src/lib/integrations/contracts.ts';
import { ZOHO_INTEGRATION_TYPE_IDS } from '../../../src/lib/integrations/contracts.ts';
import type { IntegrationSyncPhaseDefinition, ZohoTokenCacheProvider } from './integrations-zoho.ts';
import { createZohoAdapter } from './integrations-zoho.ts';
import type { PersistResult, PersistOptions } from './integrations-persist.ts';
import {
  persistZohoEntityPage,
  rebuildBuyerSearchVectors,
  rebuildBuyerUserSearchVectors,
  buildPersistOptions,
} from './integrations-persist.ts';
import { getMasterJobIdFromProgress } from '../../../src/lib/integrations/sync-orchestration.ts';
import { logCheckpoint, startTimer } from './sync-log.ts';

// ── Types ───────────────────────────────────────────────────────────────────

export interface SyncResult {
  ok: boolean;
  phase: string;
  records_synced: number;
  has_more: boolean;
  next_cursor: Record<string, unknown> | null;
}

export interface SyncRequest {
  tenant_integration_id: string;
  job_id?: string | null;
  page_from?: number | null;
  per_page?: number | null;
  since?: string | null;
  step?: string | null;
}

// ── Environment ─────────────────────────────────────────────────────────────

export function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) throw new Error('Missing required env var: SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_KEY');
  if (!key) throw new Error('Missing required env var: SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function getFunctionsBaseUrl(): string {
  const configured = Deno.env.get('INTEGRATIONS_FUNCTIONS_BASE_URL');
  const base = configured ?? `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1`;
  return base.replace(/\/+$/, '');
}

export function getDispatchSecret(): string | null {
  return Deno.env.get('INTEGRATIONS_DISPATCH_SECRET') ?? null;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export function isAuthorizedInternal(req: Request): boolean {
  const secret = getDispatchSecret();
  if (!secret) return false;
  return req.headers.get('x-integrations-dispatch-secret') === secret;
}

// ── Integration loading ───────────────────────────────────────────────────────

export interface TenantIntegrationRow {
  id: string;
  tenant_id: string;
  integration_type_id: string;
  vault_secret_id: string | null;
  status: string;
  connected_by: string | null;
}

export function resolveSyncImportActorId(
  integration: Pick<TenantIntegrationRow, 'connected_by'>,
  explicitActorId?: string | null,
): string | null {
  return explicitActorId ?? integration.connected_by ?? null;
}

export async function loadTenantIntegration(
  admin: ReturnType<typeof createAdminClient>,
  tenantIntegrationId: string,
): Promise<TenantIntegrationRow> {
  const { data, error } = await admin
    .schema('app')
    .from('tenant_integrations')
    .select('id, tenant_id, integration_type_id, vault_secret_id, status, connected_by')
    .eq('id', tenantIntegrationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(`Unable to load tenant integration: ${error.message}`);
  if (!data) throw new Error('Tenant integration not found');
  return data as TenantIntegrationRow;
}

export async function loadIntegrationCredentials(
  admin: ReturnType<typeof createAdminClient>,
  tenantIntegrationId: string,
  integrationTypeId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await admin
    .schema('app')
    .rpc('get_tenant_integration_runtime_secret', {
      p_tenant_integration_id: tenantIntegrationId,
      p_expected_integration_type_id: integrationTypeId,
    });

  if (error) throw new Error(`Unable to load integration secret: ${error.message}`);
  if (!data || typeof data !== 'object') throw new Error('No integration secret configured');
  return data as Record<string, unknown>;
}

export function assertZohoIntegration(integrationTypeId: string): ZohoIntegrationTypeId {
  if (!(ZOHO_INTEGRATION_TYPE_IDS as readonly string[]).includes(integrationTypeId)) {
    throw new Error(`Unsupported integration type: ${integrationTypeId}`);
  }
  return integrationTypeId as ZohoIntegrationTypeId;
}

// ── Job tracking ──────────────────────────────────────────────────────────────

type JobStatus = 'pending' | 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export async function isSyncJobCancelled(
  admin: ReturnType<typeof createAdminClient>,
  jobId: string,
): Promise<boolean> {
  const { data } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .select('status, progress')
    .eq('id', jobId)
    .maybeSingle();

  if (!data) return false;
  if (data.status === 'cancelled') return true;

  const progress = (data.progress ?? {}) as Record<string, unknown>;
  const masterJobId = getMasterJobIdFromProgress(progress);
  if (!masterJobId) return false;

  const { data: master } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .select('status, progress')
    .eq('id', masterJobId)
    .maybeSingle();

  if (!master) return false;
  if (master.status === 'cancelled') return true;

  const masterProgress = (master.progress ?? {}) as Record<string, unknown>;
  const meta = masterProgress.meta;
  if (meta && typeof meta === 'object' && (meta as Record<string, unknown>).run_cancelled === true) {
    return true;
  }
  return false;
}

export async function resolvePersistOptionsForJob(
  admin: ReturnType<typeof createAdminClient>,
  jobId: string | null | undefined,
  entityType: string,
): Promise<{ jobType: string | null; persistOptions: PersistOptions }> {
  if (!jobId) {
    return {
      jobType: null,
      persistOptions: buildPersistOptions({ entityType }),
    };
  }

  const { data: slave } = await admin
    .schema('app')
    .from('integration_sync_jobs')
    .select('job_type')
    .eq('id', jobId)
    .maybeSingle();

  const jobType = typeof slave?.job_type === 'string' ? slave.job_type : null;
  return {
    jobType,
    persistOptions: buildPersistOptions({ jobType, entityType }),
  };
}

export async function updatePhaseJob(
  admin: ReturnType<typeof createAdminClient>,
  jobId: string,
  patch: {
    status: JobStatus;
    records_synced?: number;
    next_cursor?: Record<string, unknown> | null;
    error_message?: string | null;
    started_at?: string | null;
    completed_at?: string | null;
    progress?: Record<string, unknown>;
    summary?: Record<string, unknown>;
  },
): Promise<void> {
  if (patch.status !== 'cancelled' && await isSyncJobCancelled(admin, jobId)) {
    return;
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    status: patch.status,
    updated_at: now,
    // Proves the worker is alive as of this write. Staleness detection reads
    // this, not updated_at, since a single Zoho page fetch can legitimately
    // stall for ~150s mid-retry with no progress write in between.
    heartbeat_at: now,
  };

  if (patch.records_synced !== undefined) update.records_synced = patch.records_synced;
  if (patch.started_at !== undefined) update.started_at = patch.started_at;
  if (patch.completed_at !== undefined) update.completed_at = patch.completed_at;
  if (patch.summary !== undefined) update.summary = patch.summary;

  if (patch.progress !== undefined) update.progress = patch.progress;

  if (patch.next_cursor !== undefined) {
    update.progress = { ...(patch.progress ?? {}), next_cursor: patch.next_cursor };
  }

  if (update.progress !== undefined && !(update.progress as Record<string, unknown>).meta) {
    // buildProgress() (sync-utils.ts) builds a fresh object with no `meta`
    // key — writing it as-is wipes progress.meta.sync_run_id/master_job_id
    // that createSlaveJob set at row creation. The trigger on completed sync
    // phase rows relies on that metadata to recognize orchestrated slave rows
    // correctly while marking Metrics V2 dirty domains.
    const { data: existing } = await admin
      .schema('app')
      .from('integration_sync_jobs')
      .select('progress')
      .eq('id', jobId)
      .maybeSingle();
    const existingMeta = (existing?.progress as Record<string, unknown> | null)?.meta;
    if (existingMeta) {
      update.progress = { ...(update.progress as Record<string, unknown>), meta: existingMeta };
    }
  }

  if (patch.error_message) {
    update.error_log = { message: patch.error_message, timestamp: new Date().toISOString() };
  }

  const { error } = await admin.schema('app').from('integration_sync_jobs').update(update).eq('id', jobId);
  if (error) throw new Error(`updatePhaseJob(${jobId}, ${patch.status}) failed: ${error.message}`);
}

// ── Tenant integration status ─────────────────────────────────────────────────

export async function setIntegrationSyncing(
  admin: ReturnType<typeof createAdminClient>,
  integrationId: string,
): Promise<void> {
  await admin
    .schema('app')
    .from('tenant_integrations')
    .update({ status: 'syncing', updated_at: new Date().toISOString() })
    .eq('id', integrationId);
}

export async function setIntegrationConnected(
  admin: ReturnType<typeof createAdminClient>,
  integrationId: string,
): Promise<void> {
  await admin
    .schema('app')
    .from('tenant_integrations')
    .update({ status: 'connected', updated_at: new Date().toISOString() })
    .eq('id', integrationId);
}

/** Sync failures are recorded on app.integration_sync_jobs — OAuth stays connected. */
export async function setIntegrationSyncFailed(
  admin: ReturnType<typeof createAdminClient>,
  integrationId: string,
): Promise<void> {
  await setIntegrationConnected(admin, integrationId);
}

// ── DB-backed Zoho token cache ─────────────────────────────────────────────────

export function createDbTokenCache(
  admin: ReturnType<typeof createAdminClient>,
  tenantIntegrationId: string,
): ZohoTokenCacheProvider {
  return {
    async read(): Promise<string | null> {
      const { data } = await admin
        .schema('app')
        .from('zoho_token_cache')
        .select('access_token, expires_at')
        .eq('tenant_integration_id', tenantIntegrationId)
        .maybeSingle();
      if (!data?.access_token) return null;
      // Require at least 60s of remaining validity
      const expiresAt = new Date(data.expires_at as string).getTime();
      if (Date.now() > expiresAt - 60_000) return null;
      return data.access_token as string;
    },
    async write(token: string, expiresAt: Date): Promise<void> {
      await admin
        .schema('app')
        .from('zoho_token_cache')
        .upsert(
          {
            tenant_integration_id: tenantIntegrationId,
            access_token: token,
            expires_at: expiresAt.toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_integration_id' },
        );
    },
  };
}

// ── Core sync loop ────────────────────────────────────────────────────────────

// Each sync-* Edge Function invocation runs for up to 110s before returning a
// resume cursor. Supabase hard limit is ~150s. The 40s gap (150 − 110) is the
// handover window: status writes, summary writes, and next-slave creation all
// happen in that gap before the platform kills the function. The budget check
// fires at the TOP of the while loop (before fetchPhasePage), so a slow Zoho
// page can push past the soft limit — the 40s window absorbs that overshoot.
const TIME_BUDGET_MS = 110_000;
const DEFAULT_PER_PAGE = 200;

// Converts snake_case entity type to Title Case label
function labelizeEntity(value: string): string {
  if (value === 'orders') return 'Sales Orders';
  return value.split('_').filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

// Maps entity type to its phase group for the 3-phase UI model
function getPhaseGroup(entityType: string): { group: string; groupLabel: string } {
  if (['locations', 'products', 'inventory', 'pricelists', 'customers', 'contact_persons'].includes(entityType)) {
    return { group: 'reference', groupLabel: 'Reference Data' };
  }
  if (['estimates', 'orders', 'invoices', 'transaction_line_items'].includes(entityType)) {
    return { group: 'transactional', groupLabel: 'Transactions' };
  }
  return { group: 'analysis', groupLabel: 'Analysis' };
}

export async function runPhaseSync(
  admin: ReturnType<typeof createAdminClient>,
  integration: TenantIntegrationRow,
  credentials: Record<string, unknown>,
  phase: IntegrationSyncPhaseDefinition,
  opts: {
    jobId?: string | null;
    pageFrom?: number | null;
    perPage?: number | null;
    since?: string | null;
    jobType?: string | null;
  } = {},
): Promise<SyncResult> {
  const zohoTypeId = assertZohoIntegration(integration.integration_type_id);
  const tokenCache = createDbTokenCache(admin, integration.id);
  const jobIdForHeartbeat = opts.jobId;
  const touchHeartbeat = jobIdForHeartbeat
    ? () => {
      // Fire-and-forget: a retry-loop keepalive must not block or fail the
      // Zoho request it's proving liveness for.
      admin.schema('app').from('integration_sync_jobs')
        .update({ heartbeat_at: new Date().toISOString() })
        .eq('id', jobIdForHeartbeat)
        .then(() => {}, () => {});
    }
    : undefined;
  const adapter = createZohoAdapter(zohoTypeId, credentials, tokenCache, touchHeartbeat);
  logCheckpoint(opts.jobId, phase.entityType, 'runPhaseSync:entered');

  const startedAt = new Date().toISOString();
  const budgetStart = Date.now();
  const { group: phaseGroup, groupLabel: phaseGroupLabel } = getPhaseGroup(phase.entityType);
  const resolveOptionsDone = startTimer(opts.jobId, phase.entityType, 'resolvePersistOptionsForJob');
  const { jobType: resolvedJobType, persistOptions } = await resolvePersistOptionsForJob(
    admin,
    opts.jobId,
    phase.entityType,
  );
  resolveOptionsDone();
  const effectiveJobType = opts.jobType ?? resolvedJobType ?? undefined;

  if (opts.jobId && await isSyncJobCancelled(admin, opts.jobId)) {
    return { ok: false, phase: phase.id, records_synced: 0, has_more: false, next_cursor: null };
  }

  if (opts.jobId) {
    await updatePhaseJob(admin, opts.jobId, { status: 'running', started_at: startedAt });
  }

  let cursor = opts.pageFrom && opts.pageFrom > 1
    ? {
        phase: phase.id,
        entity_type: phase.entityType,
        page: opts.pageFrom,
        per_page: opts.perPage ?? DEFAULT_PER_PAGE,
        has_more: true,
        since: opts.since ?? null,
      }
    : null;

  // The coordinator reuses the same slave row across every page of a phase
  // (dispatch_next_page re-invokes runPhaseSync with the same jobId and an
  // advanced pageFrom) — totalSynced must seed from that row's already
  // persisted records_synced on resume, or each page's write overwrites the
  // running total with only that page's count.
  let totalSynced = 0;
  if (opts.jobId && opts.pageFrom && opts.pageFrom > 1) {
    const { data: resumingJob } = await admin
      .schema('app')
      .from('integration_sync_jobs')
      .select('records_synced')
      .eq('id', opts.jobId)
      .maybeSingle();
    totalSynced = resumingJob?.records_synced ?? 0;
  }
  let totalFailed = 0;
  let pagesFetched = 0;

  // Accumulated across pages — rebuilt once at invocation end instead of after every page
  const allBuyerIds: string[] = [];
  const allBuyerUserIds: string[] = [];
  const allProductIds: string[] = [];
  const allBrandIds: string[] = [];
  const allCategoryIds: string[] = [];
  const allLocationIds: string[] = [];
  const allWarehouseIds: string[] = [];
  const allPriceListIds: string[] = [];

  // Build the progress object written after every page
  function buildProgress(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      phase: phase.entityType,
      phase_label: labelizeEntity(phase.entityType),
      phase_group: phaseGroup,
      phase_group_label: phaseGroupLabel,
      phases: [phase.entityType],
      pages_fetched: pagesFetched,
      records_synced: totalSynced,
      items_processed: totalSynced + totalFailed,
      counts: {
        [phase.entityType]: {
          entity_type: phase.entityType,
          processed: totalSynced,
          failed: totalFailed,
          pages: pagesFetched,
        },
      },
      ...extra,
    };
  }

  while (true) {
    if (opts.jobId && await isSyncJobCancelled(admin, opts.jobId)) {
      return { ok: false, phase: phase.id, records_synced: totalSynced, has_more: false, next_cursor: null };
    }

    // Time-budget check: stop before Supabase's 150s hard limit
    if (Date.now() - budgetStart > TIME_BUDGET_MS) break;

    const fetchDone = startTimer(opts.jobId, phase.entityType, `fetch:page${pagesFetched + 1}`);
    const page = await adapter.fetchPhasePage(phase, cursor, opts.since ?? null, effectiveJobType);
    fetchDone({ records: page.records.length, hasMore: page.hasMore });

    if (page.records.length > 0) {
      const importActorId = resolveSyncImportActorId(integration);
      const persistDone = startTimer(opts.jobId, phase.entityType, `persist:page${pagesFetched + 1}`);
      const result: PersistResult = await persistZohoEntityPage(
        admin,
        integration.tenant_id,
        importActorId,
        integration.id,
        phase.entityType,
        zohoTypeId,
        page.records,
        adapter,
        persistOptions,
      );
      persistDone({ created: result.created, updated: result.updated, skipped: result.skipped });
      const pageSynced = result.created + result.updated;
      totalSynced += pageSynced;
      // Records not created/updated/skipped are treat as failed
      totalFailed += Math.max(0, page.records.length - pageSynced - result.skipped);

      if (result.pendingSearchVectorBuyerIds.length > 0) {
        allBuyerIds.push(...result.pendingSearchVectorBuyerIds);
      }
      if (result.pendingSearchVectorBuyerUserIds.length > 0) {
        allBuyerUserIds.push(...result.pendingSearchVectorBuyerUserIds);
      }
      if (result.pendingSearchVectorProductIds.length > 0) {
        allProductIds.push(...result.pendingSearchVectorProductIds);
      }
      if (result.pendingSearchVectorBrandIds.length > 0) {
        allBrandIds.push(...result.pendingSearchVectorBrandIds);
      }
      if (result.pendingSearchVectorCategoryIds.length > 0) {
        allCategoryIds.push(...result.pendingSearchVectorCategoryIds);
      }
      if (result.pendingSearchVectorLocationIds.length > 0) {
        allLocationIds.push(...result.pendingSearchVectorLocationIds);
      }
      if (result.pendingSearchVectorWarehouseIds.length > 0) {
        allWarehouseIds.push(...result.pendingSearchVectorWarehouseIds);
      }
      if (result.pendingSearchVectorPriceListIds.length > 0) {
        allPriceListIds.push(...result.pendingSearchVectorPriceListIds);
      }
    }

    pagesFetched++;

    // Write progress after every page so UI updates within ~1s (via Realtime)
    if (opts.jobId) {
      await updatePhaseJob(admin, opts.jobId, {
        status: 'running',
        records_synced: totalSynced,
        progress: buildProgress(),
      });
    }

    if (!page.hasMore || !page.nextCursor) {
      const completedAt = new Date().toISOString();
      if (opts.jobId) {
        const durationMs = Date.now() - new Date(startedAt).getTime();
        const slavePageFrom = opts.pageFrom ?? 1;
        const slavePageTo = slavePageFrom + pagesFetched - 1;
        await updatePhaseJob(admin, opts.jobId, {
          status: 'completed',
          records_synced: totalSynced,
          completed_at: completedAt,
          progress: buildProgress(),
          summary: {
            since: opts.since ?? null,
            page_from: slavePageFrom,
            page_to: slavePageTo,
            pages_fetched: pagesFetched,
            phases_completed: [phase.entityType],
            counts: {
              [phase.entityType]: {
                entity_type: phase.entityType,
                processed: totalSynced,
                failed: totalFailed,
                pages: pagesFetched,
              },
            },
            last_synced_at: completedAt,
            note: `${labelizeEntity(phase.entityType)}: pages ${slavePageFrom}–${slavePageTo}, ${totalSynced} synced${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`,
            duration_ms: durationMs,
            total_processed: totalSynced,
            total_failed: totalFailed,
          },
        });
      }
      flushSearchVectorsInBackground(admin, integration.tenant_id, {
        buyerIds: allBuyerIds,
        buyerUserIds: allBuyerUserIds,
        productIds: allProductIds,
        brandIds: allBrandIds,
        categoryIds: allCategoryIds,
        locationIds: allLocationIds,
        warehouseIds: allWarehouseIds,
        priceListIds: allPriceListIds,
      });
      return { ok: true, phase: phase.id, records_synced: totalSynced, has_more: false, next_cursor: null };
    }

    cursor = page.nextCursor;
  }

  // Time budget exceeded — write full summary before chaining to next slave.
  // The 40s handover window (150s hard kill − 110s budget) absorbs these writes.
  const nextCursorRecord = cursor as Record<string, unknown> | null;
  if (opts.jobId) {
    const durationMs = Date.now() - new Date(startedAt).getTime();
    const slavePageFrom = opts.pageFrom ?? 1;
    const slavePageTo = slavePageFrom + pagesFetched - 1;
    const nextPage = (nextCursorRecord as { page?: number } | null)?.page ?? (slavePageTo + 1);
    await updatePhaseJob(admin, opts.jobId, {
      status: 'paused',
      records_synced: totalSynced,
      next_cursor: nextCursorRecord,
      progress: buildProgress({ next_cursor: nextCursorRecord }),
      summary: {
        since: opts.since ?? null,
        page_from: slavePageFrom,
        page_to: slavePageTo,
        pages_fetched: pagesFetched,
        next_page: nextPage,
        note: `${labelizeEntity(phase.entityType)}: pages ${slavePageFrom}–${slavePageTo} processed (${totalSynced} synced), continuing from page ${nextPage}`,
        total_processed: totalSynced,
        total_failed: totalFailed,
        duration_ms: durationMs,
        last_synced_at: new Date().toISOString(),
      },
    });
  }
  flushSearchVectorsInBackground(admin, integration.tenant_id, {
    buyerIds: allBuyerIds,
    buyerUserIds: allBuyerUserIds,
    productIds: allProductIds,
    brandIds: allBrandIds,
    categoryIds: allCategoryIds,
    locationIds: allLocationIds,
    warehouseIds: allWarehouseIds,
    priceListIds: allPriceListIds,
  });
  return { ok: true, phase: phase.id, records_synced: totalSynced, has_more: true, next_cursor: nextCursorRecord };
}

// ── Search vector flush ───────────────────────────────────────────────────────

function uniqueIds(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

async function rebuildScopedSearchVectors(
  admin: ReturnType<typeof createAdminClient>,
  rpcName: string,
  tenantId: string,
  ids: string[],
): Promise<void> {
  const scopedIds = uniqueIds(ids);
  if (scopedIds.length === 0) return;
  const chunkSize = 100;
  for (let index = 0; index < scopedIds.length; index += chunkSize) {
    const chunk = scopedIds.slice(index, index + chunkSize);
    const { error } = await admin.schema('app').rpc(rpcName, {
      p_tenant_id: tenantId,
      p_ids: chunk,
    });
    if (error) throw new Error(`${rpcName} failed: ${error.message}`);
  }
}

async function flushSearchVectors(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  pending: {
    buyerIds: string[];
    buyerUserIds: string[];
    productIds: string[];
    brandIds: string[];
    categoryIds: string[];
    locationIds: string[];
    warehouseIds: string[];
    priceListIds: string[];
  },
): Promise<void> {
  const buyerIds = uniqueIds(pending.buyerIds);
  const buyerUserIds = uniqueIds(pending.buyerUserIds);

  const run = async (label: string, task: () => Promise<void>) => {
    try {
      await task();
    } catch (error) {
      console.error(`[sync] ${label} search-vector rebuild failed; continuing with other entities:`, error);
    }
  };

  if (pending.productIds.length > 0) {
    await run('products', () => rebuildScopedSearchVectors(admin, 'rebuild_tenant_products_search_vectors', tenantId, pending.productIds));
  }
  if (buyerIds.length > 0) {
    await run('buyers', () => rebuildBuyerSearchVectors(admin, tenantId, buyerIds));
  }
  if (buyerIds.length > 0 || buyerUserIds.length > 0) {
    await run('buyer users', () => rebuildBuyerUserSearchVectors(admin, buyerIds, buyerUserIds));
  }
  if (pending.brandIds.length > 0) {
    await run('brands', () => rebuildScopedSearchVectors(admin, 'rebuild_tenant_brands_search_vectors', tenantId, pending.brandIds));
  }
  if (pending.categoryIds.length > 0) {
    await run('categories', () => rebuildScopedSearchVectors(admin, 'rebuild_tenant_categories_search_vectors', tenantId, pending.categoryIds));
  }
  if (pending.locationIds.length > 0) {
    await run('locations', () => rebuildScopedSearchVectors(admin, 'rebuild_locations_search_vectors', tenantId, pending.locationIds));
  }
  if (pending.warehouseIds.length > 0) {
    await run('warehouses', () => rebuildScopedSearchVectors(admin, 'rebuild_warehouses_search_vectors', tenantId, pending.warehouseIds));
  }
  if (pending.priceListIds.length > 0) {
    await run('price lists', () => rebuildScopedSearchVectors(admin, 'rebuild_price_lists_search_vectors', tenantId, pending.priceListIds));
  }
}

// Search vectors are a read-side optimization, not sync-correctness — a slow or
// failing rebuild must never block the phase's completed/paused status write, or
// throw and abandon the job at status='running' (see reap_stale_sync_jobs).
// Runs after the job status is already persisted, via EdgeRuntime.waitUntil so
// it still completes after the response returns instead of being cut off.
function flushSearchVectorsInBackground(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  pending: {
    buyerIds: string[];
    buyerUserIds: string[];
    productIds: string[];
    brandIds: string[];
    categoryIds: string[];
    locationIds: string[];
    warehouseIds: string[];
    priceListIds: string[];
  },
): void {
  if (
    pending.buyerIds.length === 0
    && pending.buyerUserIds.length === 0
    && pending.productIds.length === 0
    && pending.brandIds.length === 0
    && pending.categoryIds.length === 0
    && pending.locationIds.length === 0
    && pending.warehouseIds.length === 0
    && pending.priceListIds.length === 0
  ) return;
  const task = flushSearchVectors(admin, tenantId, pending).catch((err) => {
    console.error('[sync] scoped search vector rebuild failed (non-fatal, phase already completed):', err);
  });
  const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  edgeRuntime?.waitUntil(task);
}

// ── Response helpers ──────────────────────────────────────────────────────────

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ ok: false, error: message }, status);
}

export async function parseSyncRequest(req: Request): Promise<SyncRequest> {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const tenantIntegrationId = typeof body.tenant_integration_id === 'string' ? body.tenant_integration_id : null;
  if (!tenantIntegrationId) throw new Error('tenant_integration_id is required');
  return {
    tenant_integration_id: tenantIntegrationId,
    job_id: typeof body.job_id === 'string' ? body.job_id : null,
    page_from: typeof body.page_from === 'number' ? body.page_from : null,
    per_page: typeof body.per_page === 'number' ? body.per_page : null,
    since: typeof body.since === 'string' ? body.since : null,
    step: typeof body.step === 'string' ? body.step : null,
  };
}
