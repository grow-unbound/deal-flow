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
  IntegrationDataFlow,
  IntegrationSyncJob,
  IntegrationSyncPhaseStats,
} from '@/hooks/useIntegrationsSettings';
import { formatIntegrationJobError } from '@/lib/integrations/job-error-log';
import {
  formatZohoDailyNextRun,
  formatZohoDailySyncLabel,
  isZohoDailySyncSchedule,
} from '@/lib/integrations/schedule';
import { resolveSyncWindowSince, type SyncWindowId } from '@/lib/integrations/sync-window';
import { IntegrationJobLiveLog } from './IntegrationJobLiveLog';
import { SyncWindowDialog } from './SyncWindowDialog';

function labelize(value: string) {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function labelizePhase(value: string) {
  if (value === 'orders') return 'Sales Orders';
  return labelize(value);
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

function formatRunOrigin(origin?: string | null) {
  if (!origin) return null;
  return labelize(origin);
}

function formatScheduleSummary(flow: IntegrationDataFlow | null) {
  if (!flow) return null;

  const scheduleLabel = formatZohoDailySyncLabel(flow.schedule);
  const nextRunLabel = formatZohoDailyNextRun(flow.schedule);

  return {
    label: scheduleLabel,
    nextRunLabel,
  };
}

function getFlowDisplayName(flow: IntegrationDataFlow) {
  switch (flow.entity_type) {
    case 'orders':
      return 'Sales Orders';
    case 'locations':
      return 'Locations';
    case 'customers':
      return 'Customers';
    case 'products':
      return 'Products';
    case 'estimates':
      return 'Estimates';
    case 'invoices':
      return 'Invoices';
    default:
      return labelize(flow.entity_type);
  }
}

function getFlowLastRun(flow: IntegrationDataFlow) {
  if (!flow.last_run_at) return 'Not yet';
  return formatDate(flow.last_run_at, true);
}

function getFlowScheduleLine(flow: IntegrationDataFlow) {
  const schedule = formatScheduleSummary(flow);
  if (!schedule?.label) return 'No schedule configured';
  return schedule.nextRunLabel ? `${schedule.label} · ${schedule.nextRunLabel}` : schedule.label;
}

function getFlowEntityMatch(flow: IntegrationDataFlow): 'locations' | 'customers' | 'products' | 'transactions' | null {
  switch (flow.entity_type) {
    case 'locations':
      return 'locations';
    case 'customers':
      return 'customers';
    case 'products':
      return 'products';
    case 'estimates':
    case 'orders':
    case 'invoices':
      return 'transactions';
    default:
      return null;
  }
}

function getMatchingFlowSummary(flows: IntegrationDataFlow[], key: 'locations' | 'customers' | 'products' | 'transactions') {
  const matches = flows.filter((flow) => getFlowEntityMatch(flow) === key);
  if (matches.length === 0) return null;

  const scheduleFlow = matches.find((flow) => flow.schedule) ?? matches[0];
  const lastRunFlow = matches
    .filter((flow) => flow.last_run_at)
    .sort((a, b) => new Date(b.last_run_at ?? 0).getTime() - new Date(a.last_run_at ?? 0).getTime())[0] ?? null;

  return {
    flow: scheduleFlow,
    label: formatScheduleSummary(scheduleFlow)?.label ?? null,
    nextRunLabel: formatScheduleSummary(scheduleFlow)?.nextRunLabel ?? null,
    lastRunAt: lastRunFlow?.last_run_at ?? null,
  };
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
    label: labelizePhase(phaseId),
    state: getPhaseState(job, phaseId, phaseIndex),
    stat: job.progress?.counts?.[phaseId] ?? job.summary?.counts?.[phaseId] ?? null,
  }));
}

const ENTITY_CARD_KEYS = ['locations', 'customers', 'products', 'transactions'] as const;
const TRANSACTION_PHASE_IDS = ['estimates', 'orders', 'invoices'] as const;

function getEntityAliases(key: string) {
  switch (key) {
    case 'transactions':
      return [...TRANSACTION_PHASE_IDS];
    case 'locations':
      return ['locations', 'warehouses'];
    case 'orders':
      return ['orders', 'sales_orders'];
    default:
      return [key];
  }
}

function pickEntityStat(
  job: IntegrationSyncJob | null,
  key: string,
): { value: number; stat: IntegrationSyncPhaseStats | null; source: 'progress' | 'summary'; label: string } | null {
  if (!job) return null;

  if (key === 'transactions') {
    const breakdown = TRANSACTION_PHASE_IDS
      .map((phaseId) => ({
        phaseId,
        stat: job.progress?.counts?.[phaseId] ?? job.summary?.counts?.[phaseId] ?? null,
      }))
      .filter((entry) => entry.stat !== null);

    const processed = breakdown.reduce((total, entry) => total + (entry.stat?.processed ?? 0), 0);
    const failed = breakdown.reduce((total, entry) => total + (entry.stat?.failed ?? 0), 0);
    const pages = breakdown.reduce((total, entry) => total + (entry.stat?.pages ?? 0), 0);

    return {
      value: processed,
      stat: breakdown.length > 0
        ? { entity_type: 'transactions', processed, failed, pages }
        : null,
      source: breakdown.some((entry) => entry.stat !== null) ? 'progress' : 'summary',
      label: 'Transactions',
    };
  }

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

function getPhaseStateForSummary(
  job: IntegrationSyncJob | null,
  phaseId: (typeof TRANSACTION_PHASE_IDS)[number],
): PhaseState {
  if (!job) return 'Not Started';

  const phaseIndex = TRANSACTION_PHASE_IDS.indexOf(phaseId);
  if (phaseIndex < 0) return 'Not Started';

  return getPhaseState(job, phaseId, phaseIndex);
}

function getTransactionBreakdown(job: IntegrationSyncJob | null) {
  return TRANSACTION_PHASE_IDS.map((phaseId) => {
    const stat = job?.progress?.counts?.[phaseId] ?? job?.summary?.counts?.[phaseId] ?? null;
    return {
      id: phaseId,
      label: labelizePhase(phaseId),
      state: getPhaseStateForSummary(job, phaseId),
      stat,
    };
  });
}

function getEntityCards(job: IntegrationSyncJob | null, flows: IntegrationDataFlow[]) {
  return ENTITY_CARD_KEYS
    .map((key) => {
      const stat = pickEntityStat(job, key);
      const breakdown = key === 'transactions' ? getTransactionBreakdown(job) : [];
      const scheduleSummary = getMatchingFlowSummary(flows, key);
      const effectiveStat = stat ?? {
        value: 0,
        stat: null,
        source: 'summary' as const,
        label: key === 'transactions' ? 'Transactions' : labelize(key),
      };
      const state: PhaseState = key === 'transactions'
        ? breakdown.some((entry) => entry.state === 'Failed')
          ? 'Failed'
          : breakdown.some((entry) => entry.state === 'Syncing')
            ? 'Syncing'
            : breakdown.some((entry) => entry.state === 'Successful')
              ? 'Successful'
              : 'Not Started'
        : effectiveStat.value > 0
          ? 'Successful'
          : 'Not Started';

      const metaParts = [];
      if (scheduleSummary?.label) {
        metaParts.push(scheduleSummary.label);
      }
      if (scheduleSummary?.lastRunAt) {
        metaParts.push(`Last run ${formatDate(scheduleSummary.lastRunAt, true)}`);
      }
      if (scheduleSummary?.nextRunLabel) {
        metaParts.push(scheduleSummary.nextRunLabel);
      }
      if (effectiveStat.stat) {
        metaParts.push(`${formatNumber(effectiveStat.stat.failed)} failed`);
        metaParts.push(`${formatNumber(effectiveStat.stat.pages)} pages`);
      }
      if (job?.status === 'running' || job?.status === 'queued') {
        metaParts.push('last poll');
      }
      const meta = metaParts.length > 0 ? metaParts.join(' · ') : 'No sync yet';

      return {
        key,
        label: effectiveStat.label,
        value: effectiveStat.value,
        countLabel: key === 'transactions'
          ? effectiveStat.value === 1
            ? 'document synced'
            : 'documents synced'
          : effectiveStat.value === 1
            ? 'entity synced'
            : 'entities synced',
        state,
        meta,
        breakdown,
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
  if (capabilities.inbound_transactional?.some((entity) => TRANSACTION_PHASE_IDS.includes(entity as (typeof TRANSACTION_PHASE_IDS)[number]))) {
    add('transactions', 'Transactions', 'Runs estimates, sales orders, and invoices in sequence.');
  }

  return actions;
}

function getSummaryChips(job: IntegrationSyncJob | null) {
  if (!job) return [];

  const chips: Array<{ label: string; value: string }> = [];
  if (job.summary?.scope) chips.push({ label: 'Scope', value: labelize(job.summary.scope) });
  if (job.summary?.since) chips.push({ label: 'Since', value: formatDate(job.summary.since) });
  if (job.run_origin || job.summary?.run_origin) {
    chips.push({ label: 'Run', value: formatRunOrigin(job.run_origin ?? job.summary?.run_origin) ?? 'Unknown' });
  }
  if (job.sync_window || job.summary?.sync_window) {
    chips.push({ label: 'Window', value: job.sync_window ?? job.summary?.sync_window ?? 'Unknown' });
  }
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
  onSyncNow: (since: string) => void;
  onSyncPhase: (phaseId: string, since: string) => void;
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
  const [syncDialog, setSyncDialog] = useState<{
    open: boolean;
    mode: 'full' | 'phase';
    phaseId?: string;
    phaseLabel?: string;
  }>({ open: false, mode: 'full' });

  const ti = integration.tenant_integration!;
  const activeJob = ti.active_job ?? null;
  const sortedHistory = sortJobsDesc(ti.sync_history);
  const latestCompleted = sortedHistory.find((job) => job.status === 'completed') ?? null;
  const previousRun = sortedHistory.find((job) => job.id !== latestCompleted?.id) ?? null;
  const latestFinishedRun = sortedHistory.find((job) => job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') ?? null;
  const latestVisibleRun = activeJob ?? latestFinishedRun ?? latestCompleted ?? null;
  const webhookSetupStatus = (() => {
    const setupByEntity = ti.config?.webhook_setup_by_entity;
    if (setupByEntity && typeof setupByEntity === 'object' && !Array.isArray(setupByEntity)) {
      const states = Object.values(setupByEntity as Record<string, { status?: unknown }>);
      if (states.length > 0) {
        return states.every((state) => state.status === 'active')
          ? 'active'
          : states.some((state) => state.status === 'pending')
            ? 'pending'
            : 'failed';
      }
    }
    const legacy = ti.config?.webhook_setup;
    if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return null;
    const status = (legacy as { status?: unknown }).status;
    return status === 'pending' || status === 'active' || status === 'failed' ? status : null;
  })();
  const webhookState = getWebhookState(integration, webhookSetupStatus);
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
  const activeFlows = ti.data_flows.filter((flow) => flow.is_active);
  const flowSummaries = activeFlows
    .filter((flow) => flow.is_active)
    .map((flow) => ({
      ...flow,
      label: getFlowDisplayName(flow),
      scheduleLabel: formatZohoDailySyncLabel(flow.schedule),
      nextRunLabel: formatZohoDailyNextRun(flow.schedule),
    }));
  const entityCards = getEntityCards(latestVisibleRun, activeFlows);

  function openFullSyncDialog() {
    setSyncDialog({ open: true, mode: 'full' });
  }

  function openPhaseSyncDialog(phaseId: string, phaseLabel: string) {
    setSyncDialog({ open: true, mode: 'phase', phaseId, phaseLabel });
  }

  function handleSyncWindowConfirm(windowId: SyncWindowId) {
    const since = resolveSyncWindowSince(windowId);
    if (syncDialog.mode === 'phase' && syncDialog.phaseId) {
      onSyncPhase(syncDialog.phaseId, since);
      return;
    }
    onSyncNow(since);
  }

  return (
    <section className="group overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-xs">
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
                onClick={openFullSyncDialog}
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
                onClick={openFullSyncDialog}
                disabled={isSyncingNow || ti.status !== 'connected'}
              >
                {isSyncingNow ? 'Syncing…' : 'Sync now'}
              </Button>
            ) : null}
            {integration.id.startsWith('zoho_') ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openPhaseSyncDialog('products', 'Pricelists')}
                disabled={isSyncingNow || ti.status !== 'connected'}
              >
                {isSyncingNow && syncTargetPhase === 'products' ? 'Syncing…' : 'Sync now Pricelists'}
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

            <div className="rounded-2xl border border-cream-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-cream-900">Sync coverage</div>
                  <div className="mt-1 text-sm text-cream-700">
                    Locations, Customers, Products, and Transactions stay visible in one row, with the transactional
                    breakdown expanded underneath.
                  </div>
                </div>
                <Badge variant={webhookState.variant}>{webhookState.label}</Badge>
              </div>
              <div className="mt-4 grid gap-3 xl:grid-cols-4">
                {entityCards.map((card) => {
                  const phaseAction = syncablePhaseActions.find((phase) =>
                    phase.id === (card.key === 'transactions' ? 'transactions' : card.key)
                  );
                  const phaseLabel = card.key === 'transactions' ? 'Transactions' : card.label;
                  const disabled = isSyncingNow || ti.status !== 'connected' || !phaseAction;
                  const isCurrentTarget = syncTargetPhase === (card.key === 'transactions' ? 'transactions' : card.key);

                  return (
                    <div
                      key={card.key}
                      className="group/card rounded-2xl border border-cream-200 bg-cream-50 px-4 py-4 shadow-xs transition-shadow hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">{phaseLabel}</div>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-2xl font-display text-cream-900">{formatNumber(card.value)}</span>
                            <span className="text-sm text-cream-600">{card.countLabel}</span>
                          </div>
                        </div>
                        <Badge variant={getPhaseStateVariant(card.state)}>{card.state}</Badge>
                      </div>

                      <div className="mt-3 text-sm leading-6 text-cream-700">{card.meta}</div>

                      {card.key === 'transactions' ? (
                        <div className="mt-4 space-y-2 rounded-xl border border-cream-200 bg-white p-3">
                          {card.breakdown.map((phase) => (
                            <div key={phase.id} className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium text-cream-900">{phase.label}</div>
                                <div className="text-xs text-cream-600">
                                  {phase.stat
                                    ? `${formatNumber(phase.stat.processed)} synced · ${formatNumber(phase.stat.failed)} failed · ${formatNumber(phase.stat.pages)} pages`
                                    : 'No sync yet'}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={getPhaseStateVariant(phase.state)}>{phase.state}</Badge>
                                {syncablePhaseActions.find((action) => action.id === phase.id) ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openPhaseSyncDialog(phase.id, phase.label)}
                                    disabled={isSyncingNow || ti.status !== 'connected'}
                                    aria-label={`Sync now for ${phase.label}`}
                                  >
                                    {isSyncingNow && syncTargetPhase === phase.id ? 'Syncing…' : 'Sync now'}
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="mt-4 flex justify-end opacity-100 transition sm:pointer-events-none sm:translate-y-1 sm:opacity-0 sm:group-hover/card:pointer-events-auto sm:group-hover/card:translate-y-0 sm:group-hover/card:opacity-100 sm:group-focus-within/card:pointer-events-auto sm:group-focus-within/card:translate-y-0 sm:group-focus-within/card:opacity-100">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            if (!phaseAction || disabled) return;
                            openPhaseSyncDialog(phaseAction.id, phaseLabel);
                          }}
                          disabled={disabled}
                          aria-label={`Sync now for ${phaseLabel}`}
                        >
                          {isSyncingNow && isCurrentTarget ? 'Syncing…' : 'Sync now'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
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
          <div className="space-y-4">
            <div className="rounded-2xl border border-cream-200 bg-cream-50 px-4 py-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-cream-900">Schedule coverage</div>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-cream-700">
                    Each active Zoho flow shows its daily cadence, the last completed run, and the next expected 5:00 AM refresh.
                  </p>
                </div>
                <Badge variant={webhookState.variant}>{webhookState.label}</Badge>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {flowSummaries.length > 0 ? (
                  flowSummaries.map((flow) => (
                    <div key={flow.id} className="rounded-xl border border-cream-200 bg-white px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-cream-900">{flow.label}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.12em] text-cream-600">
                            {labelize(flow.trigger_type)} capture
                          </div>
                        </div>
                        <Badge variant={flow.scheduleLabel ? 'success' : 'outline'}>{flow.scheduleLabel ?? 'Not scheduled'}</Badge>
                      </div>
                      <div className="mt-3 space-y-1 text-sm text-cream-700">
                        <div>{getFlowScheduleLine(flow)}</div>
                        <div>Last run {getFlowLastRun(flow)}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-cream-300 bg-white px-4 py-5 text-sm text-cream-700 md:col-span-2 xl:col-span-4">
                    No active Zoho flows were found for this integration yet.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-cream-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-cream-900">Sync coverage</div>
                  <div className="mt-1 text-sm text-cream-700">
                    Locations, Customers, Products, and Transactions stay visible in one row, with the transactional breakdown expanded underneath.
                  </div>
                </div>
                <Badge variant={webhookState.variant}>{webhookState.label}</Badge>
              </div>
              <div className="mt-4 grid gap-3 xl:grid-cols-4">
                {entityCards.map((card) => {
                  const phaseAction = syncablePhaseActions.find((phase) =>
                    phase.id === (card.key === 'transactions' ? 'transactions' : card.key)
                  );
                  const phaseLabel = card.key === 'transactions' ? 'Transactions' : card.label;
                  const disabled = isSyncingNow || ti.status !== 'connected' || !phaseAction;
                  const isCurrentTarget = syncTargetPhase === (card.key === 'transactions' ? 'transactions' : card.key);

                  return (
                    <div
                      key={card.key}
                      className="group/card rounded-2xl border border-cream-200 bg-cream-50 px-4 py-4 shadow-xs transition-shadow hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">{phaseLabel}</div>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-2xl font-display text-cream-900">{formatNumber(card.value)}</span>
                            <span className="text-sm text-cream-600">{card.countLabel}</span>
                          </div>
                        </div>
                        <Badge variant={getPhaseStateVariant(card.state)}>{card.state}</Badge>
                      </div>

                      <div className="mt-3 space-y-1 text-sm leading-6 text-cream-700">
                        {card.meta.split(' · ').map((part) => (
                          <div key={`${card.key}-${part}`}>{part}</div>
                        ))}
                      </div>

                      {card.key === 'transactions' ? (
                        <div className="mt-4 space-y-2 rounded-xl border border-cream-200 bg-white p-3">
                          {card.breakdown.map((phase) => (
                            <div key={phase.id} className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium text-cream-900">{phase.label}</div>
                                <div className="text-xs text-cream-600">
                                  {phase.stat
                                    ? `${formatNumber(phase.stat.processed)} synced · ${formatNumber(phase.stat.failed)} failed · ${formatNumber(phase.stat.pages)} pages`
                                    : 'No sync yet'}
                                </div>
                              </div>
                              <Badge variant={getPhaseStateVariant(phase.state)}>{phase.state}</Badge>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="mt-4 flex justify-end opacity-100 transition sm:pointer-events-none sm:translate-y-1 sm:opacity-0 sm:group-hover/card:pointer-events-auto sm:group-hover/card:translate-y-0 sm:group-hover/card:opacity-100 sm:group-focus-within/card:pointer-events-auto sm:group-focus-within/card:translate-y-0 sm:group-focus-within/card:opacity-100">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            if (!phaseAction || disabled) return;
                            openPhaseSyncDialog(phaseAction.id, phaseLabel);
                          }}
                          disabled={disabled}
                          aria-label={`Sync now for ${phaseLabel}`}
                        >
                          {isSyncingNow && isCurrentTarget ? 'Syncing…' : 'Sync now'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
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
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-cream-900">{labelize(job.job_type)}</span>
                          {job.run_origin ? (
                            <Badge variant={job.run_origin === 'scheduled' ? 'success' : 'outline'}>
                              {formatRunOrigin(job.run_origin)}
                            </Badge>
                          ) : null}
                          <Badge variant={getStatusVariant(job.status)}>{labelize(job.status)}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-cream-700">
                          {job.run_origin === 'scheduled'
                            ? `${job.sync_window ?? job.summary?.sync_window ?? 'Scheduled sync'} · ${job.progress?.phase_label ?? job.summary?.note ?? 'No phase details reported yet.'}`
                            : job.progress?.phase_label ?? job.summary?.note ?? 'No phase details reported yet.'}
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
                      {job.run_origin === 'scheduled' ? (
                        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">Scheduled run</div>
                          <div className="mt-1 text-sm font-medium text-teal-950">
                            {job.sync_window ?? job.summary?.sync_window ?? 'Last 24 hours'}
                          </div>
                        </div>
                      ) : null}
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

      <SyncWindowDialog
        open={syncDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setSyncDialog({ open: false, mode: 'full' });
          }
        }}
        title={syncDialog.mode === 'phase'
          ? `Choose a sync window for ${syncDialog.phaseLabel ?? 'this phase'}`
          : 'Choose a sync window for full sync'}
        description={syncDialog.mode === 'phase'
          ? 'Pick how far back this sync should look before it starts importing data.'
          : 'Pick how far back the sync should run before importing data across all enabled phases.'}
        confirmLabel={syncDialog.mode === 'phase' ? 'Start phase sync' : 'Start sync'}
        onConfirm={handleSyncWindowConfirm}
      />
    </section>
  );
}
