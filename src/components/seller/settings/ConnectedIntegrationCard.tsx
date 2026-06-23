'use client';

import { useState } from 'react';
import {
  BookCheck,
  Boxes,
  Cable,
  CheckCircle2,
  ChevronDown,
  History,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DetailTabs } from '@/components/seller/detail/DetailTabs';
import type {
  IntegrationCatalogItem,
  IntegrationSyncJob,
  IntegrationSyncPhaseStats,
} from '@/hooks/useIntegrationsSettings';
import { formatIntegrationJobError } from '@/lib/integrations/job-error-log';
import { IntegrationJobLiveLog } from './IntegrationJobLiveLog';

function labelize(value: string) {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDate(value?: string | null, withTime = false) {
  if (!value) return withTime ? 'Not yet' : 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return withTime ? 'Not yet' : 'Not set';
  return new Intl.DateTimeFormat('en-IN', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-IN').format(value);
}

function getStatusVariant(status: string) {
  switch (status) {
    case 'connected':
    case 'completed':
    case 'ok':
    case 'cancelled':
      return 'success' as const;
    case 'queued':
    case 'running':
    case 'syncing':
      return 'info' as const;
    case 'failed':
    case 'sync_failed':
    case 'expired':
    case 'invalid':
      return 'warning' as const;
    default:
      return 'outline' as const;
  }
}

function getIntegrationIcon(integration: IntegrationCatalogItem) {
  if (integration.connectivity_mode === 'local') return Cable;
  if (integration.id.includes('inventory')) return Boxes;
  if (integration.id.includes('books')) return BookCheck;
  return ServerCog;
}

function getLatestJobErrorMessage(job: IntegrationSyncJob | null) {
  if (!job) return null;

  const firstEntry = job.error_log?.[0] ?? null;
  if (firstEntry) return formatIntegrationJobError(firstEntry);
  if (job.progress?.note) return job.progress.note;
  return job.progress?.phase_label ?? null;
}

function getJobTimestamp(job: IntegrationSyncJob) {
  return new Date(job.completed_at ?? job.started_at ?? job.created_at).getTime();
}

function sortJobsDesc(jobs: IntegrationSyncJob[]) {
  return [...jobs].sort((a, b) => getJobTimestamp(b) - getJobTimestamp(a));
}

type PhaseState = 'Not Started' | 'Syncing' | 'Successful' | 'Failed';

function getPhaseStateVariant(state: PhaseState) {
  switch (state) {
    case 'Successful':
      return 'success' as const;
    case 'Syncing':
      return 'info' as const;
    case 'Failed':
      return 'warning' as const;
    default:
      return 'outline' as const;
  }
}

function getPhaseState(job: IntegrationSyncJob, phaseId: string, phaseIndex: number): PhaseState {
  const progress = job.progress;
  const currentPhase = progress?.phase ?? null;
  const phases = progress?.phases ?? [];
  const currentIndex = currentPhase ? phases.findIndex((entry) => entry === currentPhase) : -1;
  const stat = progress?.counts?.[phaseId] ?? job.summary?.counts?.[phaseId] ?? null;
  const hasActivity = (stat?.processed ?? 0) > 0 || (stat?.pages ?? 0) > 0 || (stat?.failed ?? 0) > 0;

  if (job.status === 'failed') {
    if (currentPhase === phaseId) return 'Failed';
    if (currentIndex >= 0 && phaseIndex < currentIndex) return 'Successful';
    return hasActivity ? 'Successful' : 'Not Started';
  }

  if (job.status === 'running' || job.status === 'queued') {
    if (currentPhase === phaseId) return 'Syncing';
    if (currentIndex >= 0 && phaseIndex < currentIndex) return 'Successful';
    return hasActivity ? 'Successful' : 'Not Started';
  }

  if (job.status === 'completed') {
    return hasActivity ? 'Successful' : 'Not Started';
  }

  return hasActivity ? 'Successful' : 'Not Started';
}

function getPhaseEntries(job: IntegrationSyncJob) {
  const phaseOrder = job.progress?.phases?.length
    ? job.progress.phases
    : Object.keys(job.progress?.counts ?? job.summary?.counts ?? {});

  return phaseOrder.map((phaseId, phaseIndex) => ({
    id: phaseId,
    label: labelize(phaseId),
    state: getPhaseState(job, phaseId, phaseIndex),
    stat: job.progress?.counts?.[phaseId] ?? job.summary?.counts?.[phaseId] ?? null,
  }));
}

function getKnownEntityKeys() {
  return ['brands', 'products', 'customers', 'estimates', 'orders', 'invoices', 'locations', 'tenant_inventory'];
}

function getEntityAliases(key: string) {
  switch (key) {
    case 'orders':
      return ['orders', 'sales_orders'];
    case 'tenant_inventory':
      return ['tenant_inventory', 'inventory', 'item_locations'];
    default:
      return [key];
  }
}

function pickEntityStat(
  job: IntegrationSyncJob | null,
  key: string,
): { value: number; stat: IntegrationSyncPhaseStats | null; source: 'progress' | 'summary'; label: string } | null {
  if (!job) return null;

  for (const alias of getEntityAliases(key)) {
    const progressStat = job.progress?.counts?.[alias] ?? null;
    if (progressStat) {
      return {
        value: progressStat.processed,
        stat: progressStat,
        source: 'progress',
        label: labelize(alias),
      };
    }

    const summaryStat = job.summary?.counts?.[alias] ?? null;
    if (summaryStat) {
      return {
        value: summaryStat.processed,
        stat: summaryStat,
        source: 'summary',
        label: labelize(alias),
      };
    }
  }

  if (job.summary && typeof job.summary[key] === 'number') {
    return {
      value: job.summary[key] as number,
      stat: null,
      source: 'summary',
      label: labelize(key),
    };
  }

  return null;
}

function getEntityCards(job: IntegrationSyncJob | null) {
  return getKnownEntityKeys()
    .map((key) => {
      const stat = pickEntityStat(job, key);
      if (!stat) return null;

      const countLabel = stat.value === 1 ? 'entity synced' : 'entities synced';
      const metaParts = [];
      if (stat.stat) {
        metaParts.push(`${formatNumber(stat.stat.failed)} failed`);
        metaParts.push(`${formatNumber(stat.stat.pages)} pages`);
      }
      if (job?.status === 'running' || job?.status === 'queued') {
        metaParts.push('last poll');
      }

      return {
        key,
        label: stat.label,
        value: stat.value,
        countLabel,
        meta: metaParts.join(' · '),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function getSyncablePhaseActions(integration: IntegrationCatalogItem) {
  if (!integration.id.startsWith('zoho_')) return [];

  const capabilities = integration.capabilities ?? {};
  const actions: Array<{ id: string; label: string; description: string }> = [];
  const add = (id: string, label: string, description: string) => {
    actions.push({ id, label, description });
  };

  add('locations', integration.id === 'zoho_inventory' ? 'Warehouses' : 'Locations', 'Runs only the location import phase.');

  if (capabilities.inbound_reference?.includes('customers')) {
    add('customers', 'Customers', 'Runs only the customer import phase.');
  }
  if (capabilities.inbound_reference?.includes('products')) {
    add('products', 'Products', 'Runs only the product import phase.');
  }
  if (capabilities.inbound_transactional?.includes('estimates')) {
    add('estimates', 'Estimates', 'Runs only the estimate import phase.');
  }
  if (capabilities.inbound_transactional?.includes('orders')) {
    add('orders', 'Sales Orders', 'Runs only the sales order import phase.');
  }
  if (capabilities.inbound_transactional?.includes('invoices')) {
    add('invoices', 'Invoices', 'Runs only the invoice import phase.');
  }

  return actions;
}

function getSummaryChips(job: IntegrationSyncJob | null) {
  if (!job) return [];

  const chips: Array<{ label: string; value: string }> = [];
  if (job.summary?.scope) chips.push({ label: 'Scope', value: labelize(job.summary.scope) });
  if (job.summary?.since) chips.push({ label: 'Since', value: formatDate(job.summary.since) });
  if (job.summary?.last_synced_at) chips.push({ label: 'Completed', value: formatDate(job.summary.last_synced_at, true) });
  if (job.summary?.total_processed != null) chips.push({ label: 'Processed', value: formatNumber(job.summary.total_processed) });
  if (job.summary?.total_failed != null) chips.push({ label: 'Failed', value: formatNumber(job.summary.total_failed) });
  return chips;
}

function getWebhookState(integration: IntegrationCatalogItem, webhookSetupStatus?: 'pending' | 'active' | 'failed' | null) {
  if (integration.capabilities?.webhooks === true) {
    return webhookSetupStatus === 'active'
      ? { label: 'Webhooks active', variant: 'success' as const }
      : webhookSetupStatus === 'failed'
        ? { label: 'Webhooks retrying', variant: 'warning' as const }
        : { label: 'Webhooks pending', variant: 'info' as const };
  }

  return { label: 'Webhooks missing', variant: 'warning' as const };
}

function getProgressText(job: IntegrationSyncJob) {
  const progress = job.progress;
  const knownDenominator = progress?.items_total ?? progress?.phases_total ?? null;
  if (knownDenominator == null || knownDenominator === 0) return null;

  const numerator = progress?.items_total != null ? progress.items_processed ?? 0 : progress?.phase_current ?? 0;
  const percent = Math.max(4, Math.min(100, Math.round((numerator / knownDenominator) * 100)));
  return { percent, numerator, denominator: knownDenominator };
}

type TabId = 'overview' | 'flows' | 'history';

interface ConnectedIntegrationCardProps {
  integration: IntegrationCatalogItem;
  available: boolean;
  isSellerAdmin: boolean;
  onOpenWizard: () => void;
  onDisconnect: () => void;
  onSyncNow: () => void;
  onSyncPhase: (phaseId: string) => void;
  onStopSync: () => void;
  onRefresh: () => void;
  onRetryWebhooks: () => void;
  isSyncingNow?: boolean;
  syncTargetPhase?: string | null;
  isStoppingSync?: boolean;
  isRetryingWebhooks?: boolean;
}

export function ConnectedIntegrationCard({
  integration,
  available,
  isSellerAdmin,
  onOpenWizard,
  onDisconnect,
  onSyncNow,
  onSyncPhase,
  onStopSync,
  onRefresh,
  onRetryWebhooks,
  isSyncingNow = false,
  syncTargetPhase = null,
  isStoppingSync = false,
  isRetryingWebhooks = false,
}: ConnectedIntegrationCardProps) {
  const [tab, setTab] = useState<TabId>('overview');

  const ti = integration.tenant_integration!;
  const activeJob = ti.active_job ?? null;
  const sortedHistory = sortJobsDesc(ti.sync_history);
  const latestCompleted = sortedHistory.find((job) => job.status === 'completed') ?? null;
  const previousRun = sortedHistory.find((job) => job.id !== latestCompleted?.id) ?? null;
  const latestFinishedRun = sortedHistory.find((job) => job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') ?? null;
  const latestVisibleRun = activeJob ?? latestFinishedRun ?? latestCompleted ?? null;
  const webhookSetupStatus = (() => {
    const raw = ti.config?.webhook_setup;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const status = (raw as { status?: unknown }).status;
    return status === 'pending' || status === 'active' || status === 'failed' ? status : null;
  })();
  const webhookState = getWebhookState(integration, webhookSetupStatus);
  const countCards = getEntityCards(latestVisibleRun);
  const failedRun = latestFinishedRun?.status === 'failed' ? latestFinishedRun : null;
  const displayStatus = (() => {
    if (!available) return { label: 'Gated', variant: 'outline' as const };
    if (activeJob?.status === 'running') return { label: 'Syncing', variant: 'info' as const };
    if (activeJob?.status === 'queued') return { label: 'Queued', variant: 'info' as const };
    if (latestFinishedRun?.status === 'cancelled') return { label: 'Cancelled', variant: 'success' as const };
    if (ti.health_status === 'expired' || ti.health_status === 'invalid') return { label: 'Needs attention', variant: 'warning' as const };
    if (ti.status === 'sync_failed') return { label: 'Sync failed', variant: 'warning' as const };
    if (ti.status === 'disconnected') return { label: 'Disconnected', variant: 'outline' as const };
    if (ti.status === 'connected') return { label: 'Connected', variant: 'success' as const };
    return { label: labelize(ti.status), variant: getStatusVariant(ti.status) };
  })();

  const isSyncFailed = ti.status === 'sync_failed' || activeJob?.status === 'failed';
  const isSyncInProgress = activeJob?.status === 'running' || activeJob?.status === 'queued';
  const needsReconnect = ti.status === 'disconnected' || ti.health_status === 'expired' || ti.health_status === 'invalid';
  const Icon = getIntegrationIcon(integration);
  const currentRun = activeJob ?? latestVisibleRun;
  const currentRunPhaseEntries = currentRun ? getPhaseEntries(currentRun) : [];
  const currentRunProgress = currentRun ? getProgressText(currentRun) : null;
  const syncablePhaseActions = getSyncablePhaseActions(integration);

  return (
    <section className="overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-xs">
      <header className="border-b border-cream-200 bg-cream-50 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cream-200 bg-white text-teal-700 shadow-sm">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg text-cream-900">{integration.display_name}</h2>
                <Badge variant={displayStatus.variant}>{displayStatus.label}</Badge>
              </div>
              <p className="text-sm text-cream-600">{integration.description}</p>
            </div>
          </div>
          {isSellerAdmin && available ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpenWizard}
              >
                Reconnect
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-danger-700 hover:bg-danger-50 hover:text-danger-800"
                onClick={onDisconnect}
                disabled={isSyncingNow || isStoppingSync}
              >
                Disconnect
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="space-y-5 px-5 py-5">
        {isSellerAdmin && available ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-b border-cream-200 pb-4">
            <Button type="button" variant="ghost" size="sm" onClick={onRefresh}>
              <History className="h-4 w-4" />
              Refresh
            </Button>
            {isSyncInProgress ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={onStopSync}
                disabled={isStoppingSync}
              >
                {isStoppingSync ? 'Stopping…' : 'Stop sync'}
              </Button>
            ) : isSyncFailed ? (
              <Button
                type="button"
                variant="accent"
                size="sm"
                onClick={onSyncNow}
                disabled={isSyncingNow}
              >
                {isSyncingNow ? 'Syncing…' : 'Sync Again'}
              </Button>
            ) : null}
            {!isSyncInProgress && !isSyncFailed ? (
              <Button
                type="button"
                variant="accent"
                size="sm"
                onClick={onSyncNow}
                disabled={isSyncingNow || ti.status !== 'connected'}
              >
                {isSyncingNow ? 'Syncing…' : 'Sync now'}
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-cream-200 bg-cream-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Health</div>
            <div className="mt-3 flex items-center gap-2 text-lg font-semibold text-cream-900">
              {ti.health_status === 'ok' ? (
                <ShieldCheck className="h-5 w-5 text-success-700" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-warning-700" />
              )}
              {labelize(ti.health_status ?? 'pending_setup')}
            </div>
            <div className="mt-2 text-sm text-cream-700">Checked {formatDate(ti.last_health_check_at, true)}</div>
          </div>

          <div className="rounded-2xl border border-cream-200 bg-cream-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Connected</div>
            <div className="mt-3 text-lg font-semibold text-cream-900">{formatDate(ti.connected_at)}</div>
            <div className="mt-2 text-sm text-cream-700">First successful handshake for this tenant.</div>
          </div>

          <div className="rounded-2xl border border-cream-200 bg-cream-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">
              {activeJob ? 'Live poll' : 'Latest sync'}
            </div>
            <div className="mt-3 text-lg font-semibold text-cream-900">
              {latestVisibleRun ? formatDate(latestVisibleRun.completed_at ?? latestVisibleRun.started_at ?? latestVisibleRun.created_at, true) : 'Not yet'}
            </div>
            <div className="mt-2 text-sm text-cream-700">
              {activeJob ? 'Polling every 30 seconds while active.' : 'Updates after every completed run.'}
            </div>
            {latestFinishedRun?.status === 'cancelled' ? (
              <div className="mt-3 rounded-lg border border-success-200 bg-success-50 px-3 py-2 text-sm leading-6 text-success-900">
                Cancelled by user request. The worker stopped before the next fetch page.
              </div>
            ) : null}
          </div>
        </div>

        <DetailTabs
          tabs={[
            { id: 'overview', label: 'Overview' },
            {
              id: 'flows',
              label: 'Data flows',
              badge: ti.data_flows.length > 0 ? ti.data_flows.length : undefined,
            },
            {
              id: 'history',
              label: 'History',
              badge: ti.sync_history.length > 0 ? ti.sync_history.length : undefined,
            },
          ]}
          active={tab}
          onChange={(id) => setTab(id as TabId)}
        />

        {tab === 'overview' ? (
          <div className="space-y-4">
            {activeJob ? (
              <details className="group rounded-2xl border border-cream-200 bg-white">
                <summary className="cursor-pointer list-none px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-cream-900">{labelize(activeJob.job_type)}</span>
                        <Badge variant={getStatusVariant(activeJob.status)}>{labelize(activeJob.status)}</Badge>
                      </div>
                      <div className="mt-1 text-sm text-cream-700">
                        {activeJob.progress?.phase_label ?? 'Waiting for worker…'}
                      </div>
                    </div>
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-cream-500 transition-transform group-open:rotate-180" />
                  </div>
                  {currentRunProgress ? (
                    <div className="mt-4 space-y-2">
                      <div className="h-2.5 overflow-hidden rounded-full bg-cream-200">
                        <div
                          className="h-full rounded-full bg-teal-500 transition-[width] duration-700"
                          style={{ width: `${currentRunProgress.percent}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs text-cream-600">
                        <span>
                          {formatNumber(currentRunProgress.numerator)} / {formatNumber(currentRunProgress.denominator)}
                        </span>
                        <span>{currentRunProgress.percent}% complete</span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-cream-200">
                      <div className="h-full w-1/3 rounded-full bg-teal-500" />
                    </div>
                  )}
                </summary>
                <div className="border-t border-cream-200 px-4 py-4">
                  <div className="space-y-2">
                    {currentRunPhaseEntries.length > 0 ? (
                      currentRunPhaseEntries.map((phase) => (
                        <div key={`${currentRun?.id}-${phase.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cream-200 bg-cream-50 px-3 py-2">
                          <div>
                            <div className="text-sm font-medium text-cream-900">{phase.label}</div>
                            <div className="mt-0.5 text-xs text-cream-600">
                              {phase.stat
                                ? `${formatNumber(phase.stat.processed)} synced · ${formatNumber(phase.stat.failed)} failed · ${formatNumber(phase.stat.pages)} pages`
                                : 'No progress yet'}
                            </div>
                          </div>
                          <Badge variant={getPhaseStateVariant(phase.state)}>{phase.state}</Badge>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-lg border border-dashed border-cream-300 bg-cream-50 px-3 py-4 text-sm text-cream-700">
                        Phase tracker will populate once the worker reports its first poll.
                      </div>
                    )}
                  </div>
                </div>
              </details>
            ) : (
              <div className="rounded-2xl border border-cream-200 bg-cream-50 px-4 py-4">
                <div className="text-sm font-semibold text-cream-900">Setup notes</div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-cream-700">
                  <div className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                    <span>
                      {integration.connectivity_mode === 'local'
                        ? 'Bridge install, credential test, and initial import stay in the same wizard.'
                        : 'Credential verification and the first import stay in the same wizard.'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                    <span>Sync history updates live while a job is queued or running.</span>
                  </div>
                </div>
              </div>
            )}

            {isSellerAdmin && available && syncablePhaseActions.length > 0 ? (
              <div className="rounded-2xl border border-cream-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-cream-900">Run a single phase</div>
                    <div className="mt-1 text-sm text-cream-700">
                      Re-run just one entity phase to validate a specific slice without kicking off the full sync.
                    </div>
                  </div>
                  <Badge variant="outline">Phase scoped</Badge>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {syncablePhaseActions.map((phase) => (
                    <div key={phase.id} className="rounded-xl border border-cream-200 bg-cream-50 px-4 py-3">
                      <div className="text-sm font-semibold text-cream-900">{phase.label}</div>
                      <div className="mt-1 text-xs leading-5 text-cream-600">{phase.description}</div>
                      <Button
                        type="button"
                        variant="accent"
                        size="sm"
                        className="mt-3"
                        aria-label={`Sync now for ${phase.label}`}
                        onClick={() => onSyncPhase(phase.id)}
                        disabled={isSyncingNow || ti.status !== 'connected'}
                      >
                        {isSyncingNow && syncTargetPhase === phase.id ? 'Syncing…' : 'Sync now'}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-cream-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-cream-900">Coverage status</div>
                  <div className="mt-1 text-sm text-cream-700">
                    High-level entities from the latest successful or active run, plus webhook coverage.
                  </div>
                </div>
                <Badge variant={webhookState.variant}>{webhookState.label}</Badge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {countCards.length > 0 ? (
                  countCards.map((card) => (
                    <div key={card.key} className="rounded-xl border border-cream-200 bg-cream-50 px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">{card.label}</div>
                      <div className="mt-1 text-lg font-semibold text-cream-900">{formatNumber(card.value)}</div>
                      <div className="mt-1 text-xs text-cream-600">{card.countLabel}</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-cream-300 bg-cream-50 px-4 py-6 text-sm text-cream-700 sm:col-span-2 xl:col-span-4">
                    No sync counts available yet.
                  </div>
                )}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-cream-200 bg-cream-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Webhooks</div>
                  <div className="mt-1 text-sm font-medium text-cream-900">{webhookState.label}</div>
                  <div className="mt-1 text-xs text-cream-600">
                    {integration.capabilities?.webhooks === true
                      ? 'Webhook capture is enabled in the integration catalog.'
                      : 'Webhook capture is not part of this integration yet.'}
                  </div>
                  {webhookState.label !== 'Webhooks active' ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-3 px-0 text-teal-700 hover:bg-transparent hover:text-teal-800"
                      onClick={onRetryWebhooks}
                      disabled={isRetryingWebhooks}
                    >
                      {isRetryingWebhooks ? 'Retrying…' : 'Retry webhooks'}
                    </Button>
                  ) : null}
                </div>
                <div className="rounded-xl border border-cream-200 bg-cream-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Latest note</div>
                  <div className="mt-1 text-sm font-medium text-cream-900">{latestVisibleRun?.summary?.note ?? latestVisibleRun?.progress?.note ?? 'No note'}</div>
                  <div className="mt-1 text-xs text-cream-600">Pulled from the most recent sync payload.</div>
                </div>
                <div className="rounded-xl border border-cream-200 bg-cream-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Phases completed</div>
                  <div className="mt-1 text-sm font-medium text-cream-900">
                    {latestVisibleRun?.summary?.phases_completed?.length ? latestVisibleRun.summary.phases_completed.length : 0}
                  </div>
                  <div className="mt-1 text-xs text-cream-600">Visible in the latest sync summary.</div>
                </div>
                <div className="rounded-xl border border-cream-200 bg-cream-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Last health check</div>
                  <div className="mt-1 text-sm font-medium text-cream-900">{formatDate(ti.last_health_check_at, true)}</div>
                  <div className="mt-1 text-xs text-cream-600">Connection freshness from the integration record.</div>
                </div>
              </div>
            </div>

            {failedRun ? (
              <div className="rounded-2xl border border-warning-500/30 bg-warning-50 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-warning-950">Last sync failed</div>
                    <p className="mt-1 text-sm leading-6 text-warning-900">
                      {getLatestJobErrorMessage(failedRun) ??
                        'The sync worker stopped before it could complete. Open History to review the run.'}
                    </p>
                  </div>
                  <Badge variant="warning">{labelize(failedRun.job_type)}</Badge>
                </div>
              </div>
            ) : null}
          </div>
        ) : tab === 'flows' ? (
          <div className="rounded-2xl border border-cream-200 bg-cream-50 px-4 py-5">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-cream-500" />
              <div className="text-sm font-semibold text-cream-900">Data flows deferred</div>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-cream-700">
              The detailed mapping view is being simplified separately. For now, use the overview counts and the history log
              to validate sync health without exposing the entity-level wiring.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-cream-200 bg-white px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Active flows</div>
                <div className="mt-1 text-lg font-semibold text-cream-900">{ti.data_flows.length}</div>
              </div>
              <div className="rounded-xl border border-cream-200 bg-white px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Webhook coverage</div>
                <div className="mt-1 text-sm font-medium text-cream-900">{webhookState.label}</div>
              </div>
              <div className="rounded-xl border border-cream-200 bg-white px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Latest run</div>
                <div className="mt-1 text-sm font-medium text-cream-900">{latestVisibleRun ? formatDate(latestVisibleRun.completed_at ?? latestVisibleRun.started_at ?? latestVisibleRun.created_at, true) : 'Not yet'}</div>
              </div>
              <div className="rounded-xl border border-cream-200 bg-white px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">History items</div>
                <div className="mt-1 text-lg font-semibold text-cream-900">{ti.sync_history.length}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {activeJob ? (
              <IntegrationJobLiveLog activeJob={activeJob} />
            ) : null}

            {sortedHistory.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 px-4 py-6 text-sm text-cream-700">
                Sync history will appear here after the first import runs.
              </div>
            ) : (
              <div className="space-y-3">
                {sortedHistory.map((job) => (
                  <details key={job.id} className="group rounded-2xl border border-cream-200 bg-white px-4 py-4">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-cream-900">{labelize(job.job_type)}</span>
                          <Badge variant={getStatusVariant(job.status)}>{labelize(job.status)}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-cream-700">
                          {job.progress?.phase_label ?? job.summary?.note ?? 'No phase details reported yet.'}
                        </p>
                        {job.status === 'cancelled' ? (
                          <p className="mt-2 rounded-lg border border-success-200 bg-success-50 px-3 py-2 text-sm leading-6 text-success-900">
                            {job.progress?.note ?? 'Cancelled by user request. The worker stopped before the next fetch page.'}
                          </p>
                        ) : null}
                        {job.status === 'failed' ? (
                          <p className="mt-2 text-sm leading-6 text-warning-800">
                            {getLatestJobErrorMessage(job) ?? 'The worker failed before it could record a detailed error.'}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-right text-xs text-cream-600">
                        <span>{formatDate(job.completed_at ?? job.started_at ?? job.created_at, true)}</span>
                        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                      </div>
                    </summary>

                    <div className="mt-4 space-y-3 border-t border-cream-200 pt-4">
                      {job === activeJob ? (
                        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Live run log</div>
                      ) : null}
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {getSummaryChips(job).map((chip) => (
                          <div key={`${job.id}-${chip.label}`} className="rounded-xl border border-cream-200 bg-cream-50 px-4 py-3">
                            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">{chip.label}</div>
                            <div className="mt-1 text-sm font-medium text-cream-900">{chip.value}</div>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-xl border border-cream-200 bg-cream-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Phase tracker</div>
                            <div className="mt-1 text-sm text-cream-700">The latest run state for each phase, without the extra card clutter.</div>
                          </div>
                          <Badge variant={getStatusVariant(job.status)}>{labelize(job.status)}</Badge>
                        </div>
                        <div className="mt-4 space-y-2">
                          {getPhaseEntries(job).map((phase) => (
                            <div key={`${job.id}-${phase.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cream-200 bg-white px-3 py-2">
                              <div>
                                <div className="text-sm font-medium text-cream-900">{phase.label}</div>
                                <div className="mt-0.5 text-xs text-cream-600">
                                  {phase.stat
                                    ? `${formatNumber(phase.stat.processed)} synced · ${formatNumber(phase.stat.failed)} failed · ${formatNumber(phase.stat.pages)} pages`
                                    : 'No progress yet'}
                                </div>
                              </div>
                              <Badge variant={getPhaseStateVariant(phase.state)}>{phase.state}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
