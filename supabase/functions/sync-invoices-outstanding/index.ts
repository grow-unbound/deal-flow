import {
  createAdminClient,
  loadTenantIntegration,
  loadIntegrationCredentials,
  runPhaseSync,
  updatePhaseJob,
  resolveSyncImportActorId,
  createDbTokenCache,
  assertZohoIntegration,
  parseSyncRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/sync-utils.ts';
import { createZohoAdapter } from '../_shared/integrations-zoho.ts';
import { persistZohoEntityPage } from '../_shared/integrations-persist.ts';

// invoices_outstanding phase: true-up currently-open invoice balances from
// Zoho. Zoho does not bump invoice.last_modified_time when a payment is
// applied, so the regular incremental `invoices` phase (which filters by
// last_modified_time/date_start) can silently miss balance changes on old
// invoices — this phase exists to catch those.
//
// Previously this issued one unconditional /invoices fetch with NO filter at
// all, re-pulling the tenant's entire invoice history every run (73k+ rows
// for WineYard, most of them long-settled) just to catch a few hundred real
// balance changes. Fixed 2026-09-05 to two bounded passes instead:
//
//   1. Forward sweep — three status-filtered Zoho list calls (unpaid,
//      overdue, partially_paid; see
//      https://www.zoho.com/books/api/v3/invoices/#list-invoices). Three
//      separate calls rather than trusting one value's filter semantics to
//      be a superset of the others — cheap, and guarantees no gap.
//   2. Reconciliation sweep — anything still marked outstanding_balance > 0
//      locally that the forward sweep did NOT just refresh to one of those
//      three statuses gets an individual GET /invoices/{id}. This is what
//      catches recently-settled/voided invoices (they drop out of Zoho's
//      outstanding-status filters, so the forward sweep alone would never
//      touch them) and any invoice sitting in a status our filter list
//      doesn't cover (e.g. locally 'sent').
//
// Total volume is bounded by "however many invoices are actually open right
// now" (WineYard: ~1000), not "every invoice ever issued".
//
// Staged/resumable, same as every other phase: the sync-coordinator's
// dispatch_next_page action re-invokes this function with an advancing
// `page_from`, calling it until has_more:false. A single blocking call that
// did all 3 statuses + the full reconciliation pass in one invocation
// (first version of this fix) took 2m28s end-to-end and blew the
// coordinator's 140s per-dispatch timeout — the coordinator's fetch aborted
// and marked the phase failed, even though the (still-running, since Deno
// doesn't kill it on an aborted caller) function went on to persist
// everything successfully a few seconds later. Splitting into stages, each
// well under the timeout on its own, fixes that without needing to touch
// the coordinator's dispatch protocol at all.
//
// page_from encodes the stage:
//   1..3  -> forward sweep for FORWARD_SWEEP_STATUSES[page_from - 1]
//            (each fully paginated within its own dispatch — a single
//            status's result set is small enough to finish there)
//   4+    -> reconciliation, processing RECONCILE_BATCH_SIZE stale
//            candidates per dispatch, offset (page_from - 4) * batch size
const ENTITY_TYPE = 'invoices_outstanding';
const PATH = '/invoices';
const ITEM_KEY = 'invoices';
const FORWARD_SWEEP_STATUSES = ['unpaid', 'overdue', 'partially_paid'] as const;
const RECONCILE_STAGE_START = FORWARD_SWEEP_STATUSES.length + 1; // 4
const RECONCILE_BATCH_SIZE = 40;

function buildProgress(recordsSynced: number, note: string, extra: Record<string, unknown> = {}) {
  return {
    phase: ENTITY_TYPE,
    phase_label: 'Invoices Outstanding',
    phase_group: 'analysis',
    phase_group_label: 'Analysis',
    phases: [ENTITY_TYPE],
    records_synced: recordsSynced,
    items_processed: recordsSynced,
    note,
    ...extra,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const input = await parseSyncRequest(req);
    const admin = createAdminClient();
    const integration = await loadTenantIntegration(admin, input.tenant_integration_id);
    const credentials = await loadIntegrationCredentials(admin, integration.id, integration.integration_type_id);
    const zohoTypeId = assertZohoIntegration(integration.integration_type_id);

    const stage = input.page_from && input.page_from >= 1 ? input.page_from : 1;

    // Cumulative total carries across dispatches the same way runPhaseSync's
    // own resume-from-pageFrom>1 path does — reseed from what a prior stage
    // already wrote rather than starting back at zero.
    let cumulativeSynced = 0;
    if (input.job_id && stage > 1) {
      const { data } = await admin
        .schema('app')
        .from('integration_sync_jobs')
        .select('records_synced')
        .eq('id', input.job_id)
        .maybeSingle();
      cumulativeSynced = data?.records_synced ?? 0;
    }

    let stageSynced = 0;
    let hasMore = true;
    let nextStage = stage + 1;
    let summaryNote = '';
    const summaryExtra: Record<string, unknown> = {};

    if (stage < RECONCILE_STAGE_START) {
      // Forward sweep for one status, fully paginated within this dispatch.
      const status = FORWARD_SWEEP_STATUSES[stage - 1];
      let pageFrom = 1;
      while (true) {
        const result = await runPhaseSync(admin, integration, credentials, {
          id: ENTITY_TYPE,
          label: `Re-fetching ${status} invoices from Zoho`,
          entityType: ENTITY_TYPE,
          path: PATH,
          itemKey: ITEM_KEY,
          extraParams: { status },
        }, {
          pageFrom,
          perPage: input.per_page ?? 200,
        });
        stageSynced += result.records_synced;
        if (!result.has_more) break;
        pageFrom = (result.next_cursor as { page?: number } | null)?.page ?? pageFrom + 1;
      }
      summaryNote = `forward sweep (${status}): ${stageSynced} synced`;
      hasMore = true; // always at least one more stage — reconciliation
    } else {
      // Reconciliation: local rows still outstanding that the forward sweep
      // didn't just confirm — batched, offset by how many prior
      // reconciliation dispatches have already run.
      const offset = (stage - RECONCILE_STAGE_START) * RECONCILE_BATCH_SIZE;
      const { data: staleRows, error: staleErr } = await admin
        .schema('app')
        .from('invoices')
        .select('id, external_ref')
        .eq('tenant_id', integration.tenant_id)
        .is('deleted_at', null)
        .gt('outstanding_balance', 0)
        .neq('status', 'void')
        .not('status', 'in', `(${FORWARD_SWEEP_STATUSES.join(',')})`)
        .order('id')
        .range(offset, offset + RECONCILE_BATCH_SIZE - 1);
      if (staleErr) throw staleErr;

      let reconciled = 0;
      let reconcileFailed = 0;
      if (staleRows && staleRows.length > 0) {
        const tokenCache = createDbTokenCache(admin, integration.id);
        const adapter = createZohoAdapter(zohoTypeId, credentials, tokenCache);
        const actorId = resolveSyncImportActorId(integration);

        for (const row of staleRows) {
          if (!row.external_ref) continue;
          try {
            const invoice = await adapter.fetchInvoiceById(row.external_ref);
            if (!invoice) continue;
            const result = await persistZohoEntityPage(
              admin,
              integration.tenant_id,
              actorId,
              integration.id,
              ENTITY_TYPE,
              zohoTypeId,
              [invoice],
              adapter,
            );
            reconciled += result.created + result.updated;
          } catch (err) {
            reconcileFailed++;
            console.error(`[sync-invoices-outstanding] reconcile failed for invoice ${row.external_ref}: ${String(err)}`);
          }
        }
      }
      stageSynced = reconciled;
      summaryExtra.reconciliation_batch_candidates = staleRows?.length ?? 0;
      summaryExtra.reconciliation_batch_synced = reconciled;
      summaryExtra.reconciliation_batch_failed = reconcileFailed;
      summaryNote = `reconciliation batch @${offset}: ${reconciled}/${staleRows?.length ?? 0} synced`;
      // Fewer rows than a full batch means this was the last one.
      hasMore = (staleRows?.length ?? 0) === RECONCILE_BATCH_SIZE;
    }

    const newTotal = cumulativeSynced + stageSynced;

    if (input.job_id) {
      if (hasMore) {
        await updatePhaseJob(admin, input.job_id, {
          status: 'paused',
          records_synced: newTotal,
          next_cursor: { page: nextStage },
          progress: buildProgress(newTotal, summaryNote, { next_cursor: { page: nextStage }, ...summaryExtra }),
        });
      } else {
        const completedAt = new Date().toISOString();
        await updatePhaseJob(admin, input.job_id, {
          status: 'completed',
          records_synced: newTotal,
          completed_at: completedAt,
          progress: buildProgress(newTotal, summaryNote, summaryExtra),
          summary: {
            forward_sweep_statuses: FORWARD_SWEEP_STATUSES,
            total_processed: newTotal,
            last_synced_at: completedAt,
            note: `Invoices Outstanding: ${newTotal} synced across ${stage} stages`,
            ...summaryExtra,
          },
        });
      }
    }

    return jsonResponse({
      ok: true,
      phase: ENTITY_TYPE,
      records_synced: newTotal,
      has_more: hasMore,
      next_cursor: hasMore ? { page: nextStage } : null,
    });
  } catch (err) {
    console.error('[sync-invoices-outstanding]', err);
    return errorResponse(err instanceof Error ? err.message : 'Sync failed');
  }
});
