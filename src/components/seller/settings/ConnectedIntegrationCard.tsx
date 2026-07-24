'use client';

import { useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import {
  BookCheck,
  Boxes,
  Cable,
  ChevronDown,
  History,
  Plug,
  RefreshCw,
  Sparkles,
  Unplug,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  Webhook,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { StatusGlyph, type StatusTone } from '@/components/ui/status-pill';
import { DetailTabs } from '@/components/seller/detail/DetailTabs';
import type {
  IntegrationCatalogItem,
  IntegrationDataFlow,
  IntegrationEntityError,
  IntegrationSyncJob,
  IntegrationSyncPhaseStats,
} from '@/hooks/useIntegrationsSettings';
import { formatIntegrationJobError } from '@/lib/integrations/job-error-log';
import { isOAuthLiveTenantIntegrationStatus } from '@/lib/integrations/contracts';
import { REFERENCE_PHASES, TRANSACTIONAL_PHASES } from '@/lib/integrations/sync-orchestration';
import {
  estimateZohoDailyNextRun,
  formatZohoDailyNextRun,
  formatZohoDailySyncLabel,
  isZohoDailySyncSchedule,
} from '@/lib/integrations/schedule';
import { formatIntegrationDateTimeLabel } from '@/lib/integrations/format';
import { cn, formatNumberValue } from '@/lib/utils';
import { FieldMappingsPanel } from './FieldMappingsPanel';
import { IntegrationJobLiveLog } from './IntegrationJobLiveLog';
import { SyncWindowDialog, type SyncConfirmOptions } from './SyncWindowDialog';

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

type EntityGroupKey = 'locations' | 'customers' | 'products' | 'transactions';
type SyncPhaseId = 'locations' | 'customers' | 'products' | 'transactions';

const ENTITY_GROUPS: Array<{
  key: EntityGroupKey;
  label: string;
  aliases: string[];
  sublabels: string[];
}> = [
  { key: 'locations', label: 'Locations', aliases: ['locations', 'warehouses'], sublabels: ['Locations'] },
  { key: 'customers', label: 'Customers', aliases: ['customers', 'contact_persons'], sublabels: ['Customers'] },
  {
    key: 'products',
    label: 'Products',
    aliases: ['products', 'brands', 'categories', 'pricelists', 'price_lists', 'inventory'],
    sublabels: ['Products', 'Brands', 'Categories', 'Pricelists', 'Inventory'],
  },
  {
    key: 'transactions',
    label: 'Transactions',
    aliases: ['estimates', 'orders', 'salesorders', 'invoices'],
    sublabels: ['Estimates', 'Sales Orders', 'Invoices'],
  },
];

const GROUP_BY_PHASE_ID: Record<string, EntityGroupKey> = {
  locations: 'locations',
  warehouses: 'locations',
  customers: 'customers',
  contact_persons: 'customers',
  products: 'products',
  brands: 'products',
  categories: 'products',
  pricelists: 'products',
  price_lists: 'products',
  inventory: 'products',
  estimates: 'transactions',
  orders: 'transactions',
  salesorders: 'transactions',
  invoices: 'transactions',
};

// ── 3-phase structure ──────────────────────────────────────────────────────────

interface SyncPhaseGroup {
  id: string;
  label: string;
  description: string;
  subPhases: Array<{ id: string; label: string; aliases: string[] }>;
  /** Entity types (from integration_entity_map) that belong to this phase */
  errorEntityTypes: string[];
  syncWindowLabel: string;
  canSyncAgain: boolean;
}

// Sub-phase id → label/aliases metadata. The *set* of phases per group comes
// from REFERENCE_PHASES/TRANSACTIONAL_PHASES (src/lib/integrations/sync-orchestration.ts)
// so this can't silently drift from the backend's actual phase list again —
// only labels/entity-map aliases are maintained here.
const REFERENCE_PHASE_META: Record<string, { label: string; aliases: string[] }> = {
  locations: { label: 'Locations', aliases: ['locations', 'warehouses'] },
  products: { label: 'Products', aliases: ['products', 'brands', 'categories'] },
  inventory: { label: 'Inventory', aliases: ['inventory'] },
  pricelists: { label: 'Pricelists', aliases: ['pricelists', 'price_lists'] },
  customers: { label: 'Customers', aliases: ['customers'] },
  contact_persons: { label: 'Contact Persons', aliases: ['contact_persons'] },
};

const TRANSACTIONAL_PHASE_META: Record<string, { label: string; aliases: string[] }> = {
  estimates: { label: 'Estimates', aliases: ['estimates'] },
  orders: { label: 'Sales Orders', aliases: ['orders', 'salesorders'] },
  invoices: { label: 'Invoices', aliases: ['invoices'] },
};

// transaction_line_items is deliberately excluded here — it only ever runs
// as part of the automatic daily incremental sync (see resolvePhasesForPolicy
// in sync-orchestration.ts), never via any manual trigger, and is hidden
// from the frontend phase grid entirely.
const VISIBLE_TRANSACTIONAL_PHASES = TRANSACTIONAL_PHASES.filter((id) => id !== 'transaction_line_items');

const SYNC_PHASE_GROUPS: SyncPhaseGroup[] = [
  {
    id: 'reference',
    label: 'Phase 1 — Reference Data',
    description: 'Locations, Products, Inventory, Pricelists, Customers, Contact Persons',
    subPhases: REFERENCE_PHASES.map((id) => ({ id, ...REFERENCE_PHASE_META[id] })),
    errorEntityTypes: ['locations', 'warehouses', 'products', 'brands', 'categories', 'inventory', 'pricelists', 'price_lists', 'price_list_items', 'customers', 'contact_persons'],
    syncWindowLabel: 'Products, Inventory & Customers: filtered by selected date. Locations & Pricelists: always full sync (Zoho API limitation).',
    canSyncAgain: true,
  },
  {
    id: 'transactional',
    label: 'Phase 2 — Transactions',
    description: 'Estimates, Sales Orders, Invoices',
    subPhases: VISIBLE_TRANSACTIONAL_PHASES.map((id) => ({ id, ...TRANSACTIONAL_PHASE_META[id] })),
    errorEntityTypes: ['estimates', 'orders', 'salesorders', 'invoices'],
    syncWindowLabel: 'All transaction data filtered by the selected date window.',
    canSyncAgain: true,
  },
  {
    id: 'analysis',
    label: 'Phase 3 — Analysis',
    description: 'KPI summary, recommendations, snapshots',
    subPhases: [
      { id: 'kpi_summary', label: 'KPI Summary', aliases: ['kpi_summary'] },
      { id: 'recommendations', label: 'Recommendations', aliases: ['reco'] },
    ],
    errorEntityTypes: ['analysis', 'kpi_summary', 'reco'],
    syncWindowLabel: 'Computed automatically after Phase 2 completes.',
    canSyncAgain: false,
  },
];

function getEntityGroup(key: EntityGroupKey) {
  return ENTITY_GROUPS.find((group) => group.key === key) ?? ENTITY_GROUPS[0];
}

function getGroupCountLabel(key: EntityGroupKey, value: number) {
  if (key === 'transactions') {
    return value === 1 ? 'record' : 'records';
  }
  return value === 1 ? 'entity' : 'entities';
}

function getGroupSummaryTotals(totals: NonNullable<IntegrationCatalogItem['coverage_totals']> | null | undefined, key: EntityGroupKey) {
  if (!totals) return null;
  switch (key) {
    case 'locations':
      return { total: totals.locations, items: { Locations: totals.locations } };
    case 'customers':
      return { total: totals.customers, items: { Customers: totals.customers } };
    case 'products':
      return {
        total: totals.products + totals.brands + totals.categories + totals.pricelists + totals.inventory,
        items: {
          Products: totals.products,
          Brands: totals.brands,
          Categories: totals.categories,
          Pricelists: totals.pricelists,
          Inventory: totals.inventory,
        },
      };
    case 'transactions':
      return {
        total: totals.estimates + totals.orders + totals.invoices,
        items: {
          Estimates: totals.estimates,
          'Sales Orders': totals.orders,
          Invoices: totals.invoices,
        },
      };
    default:
      return null;
  }
}

// Every job row carries its own authoritative `phase` column (set once, at
// creation) — dedup by that directly instead of inferring phase from
// progress/summary fields, which are empty until a phase actually starts
// running and otherwise silently fall back to a stale historical row.
function getLatestJobByPhase(jobs: IntegrationSyncJob[]) {
  const map = new Map<string, IntegrationSyncJob>();
  for (const job of jobs) {
    if (job.phase && !map.has(job.phase)) map.set(job.phase, job);
  }
  return map;
}

function getLastCompletedJobByPhase(jobs: IntegrationSyncJob[]) {
  const map = new Map<string, IntegrationSyncJob>();
  for (const job of jobs) {
    if (job.phase && job.status === 'completed' && !map.has(job.phase)) map.set(job.phase, job);
  }
  return map;
}

// Each resumed attempt of a phase is its OWN job row with its OWN counters
// starting at 0 — a phase that took 3 paused/resumed attempts before finally
// finishing shows "0 processed" then "347 processed" then "0" again if you
// only look at any single row. Walk back from newest (guaranteed to be the
// currently in-progress row — this is only called while a phase is actively
// syncing/paused) and sum each attempt's own count. A resumed dispatch only
// ever continues from a 'paused'/'failed'/'cancelled' predecessor — never
// from 'completed' (see resolvePhaseResumePage in integrations-sync) — so
// hitting a 'completed' row means everything before it belongs to a wholly
// separate, already-finished run and must NOT be folded into this total.
function getCumulativePhaseStat(jobs: IntegrationSyncJob[], phaseId: string): IntegrationSyncPhaseStats | null {
  let processed = 0;
  let failed = 0;
  let pages = 0;
  let sawAny = false;
  for (const job of jobs) {
    if (job.phase !== phaseId) continue;
    if (job.status === 'completed') break;
    const stat = job.progress?.counts?.[phaseId] ?? job.summary?.counts?.[phaseId] ?? null;
    if (stat) {
      processed += stat.processed ?? 0;
      failed += stat.failed ?? 0;
      pages += stat.pages ?? 0;
      sawAny = true;
    }
  }
  return sawAny ? { entity_type: phaseId, processed, failed, pages } : null;
}

function getGroupRelevantJob(jobs: IntegrationSyncJob[], key: EntityGroupKey) {
  const group = getEntityGroup(key);
  return [...jobs].find((job) => {
    const progress = job.progress;
    const summary = job.summary;
    const progressCounts = progress?.counts ?? null;
    const summaryCounts = summary?.counts ?? null;
    const phaseNames = progress?.phases ?? [];
    const currentPhase = progress?.phase ?? null;

    return (
      group.aliases.some((alias) => Boolean(progressCounts?.[alias]) || Boolean(summaryCounts?.[alias])) ||
      (currentPhase ? group.aliases.includes(currentPhase) : false) ||
      phaseNames.some((phase) => group.aliases.includes(phase)) ||
      (key === 'products' && (summary?.scope === 'reference' || summary?.phases_completed?.includes('brands') || summary?.phases_completed?.includes('products'))) ||
      (key === 'transactions' && (summary?.scope === 'transactional' || summary?.phases_completed?.some((phase) => ['estimates', 'orders', 'invoices'].includes(phase))))
    );
  }) ?? null;
}

function getRunTime(job: IntegrationSyncJob | null) {
  if (!job) return null;
  return job.completed_at ?? job.started_at ?? job.created_at;
}

function getGroupState(job: IntegrationSyncJob | null, key: EntityGroupKey, lastRunAt?: string | null): PhaseState {
  if (!job) return 'Not Started';
  if (job.status === 'failed') return 'Failed';
  if (job.status === 'running' || job.status === 'queued') return 'Syncing';
  const progress = job.progress;
  const summary = job.summary;
  const counts = progress?.counts ?? summary?.counts ?? {};
  const group = getEntityGroup(key);
  const hasActivity = group.aliases.some((alias) => Boolean(counts[alias]) && ((counts[alias]?.processed ?? 0) > 0 || (counts[alias]?.failed ?? 0) > 0 || (counts[alias]?.pages ?? 0) > 0));
  if (hasActivity) return 'Successful';
  return lastRunAt ? 'Successful' : 'Not Started';
}

function getGroupAsOfLabel(lastRunAt?: string | null) {
  if (!lastRunAt) return 'No sync yet';
  return `as of ${formatIntegrationDateTimeLabel(lastRunAt)}`;
}

function getGroupNextRunLabel(nextRunAt?: Date | null) {
  if (!nextRunAt) return 'No next run set';
  return `Next run ${formatIntegrationDateTimeLabel(nextRunAt.toISOString())}`;
}

function getGroupLatestTimestamp(jobs: IntegrationSyncJob[], key: EntityGroupKey) {
  return getRunTime(getGroupRelevantJob(jobs, key));
}

function getGroupLastSuccess(jobs: IntegrationSyncJob[], key: EntityGroupKey) {
  const group = getEntityGroup(key);
  return [...jobs].find((job) => {
    if (job.status !== 'completed') return false;
    const progress = job.progress;
    const summary = job.summary;
    const counts = progress?.counts ?? summary?.counts ?? {};
    return group.aliases.some((alias) => Boolean(counts[alias]) || (summary?.phases_completed?.includes(alias) ?? false));
  }) ?? null;
}

function getGroupPhaseEntries(job: IntegrationSyncJob | null, key: EntityGroupKey) {
  if (!job) return [];
  const group = getEntityGroup(key);
  const phaseOrder = job.progress?.phases?.length ? job.progress.phases : Object.keys(job.progress?.counts ?? job.summary?.counts ?? {});
  const entries = phaseOrder
    .filter((phaseId) => group.aliases.includes(phaseId))
    .map((phaseId) => ({
      id: phaseId,
      label: labelizePhase(phaseId),
      state: getPhaseState(job, phaseId, phaseOrder.indexOf(phaseId)),
      stat: job.progress?.counts?.[phaseId] ?? job.summary?.counts?.[phaseId] ?? null,
    }));

  if (key === 'transactions' && entries.length === 0) {
    return TRANSACTION_PHASE_IDS.map((phaseId) => ({
      id: phaseId,
      label: labelizePhase(phaseId),
      state: getPhaseStateForSummary(job, phaseId),
      stat: job.progress?.counts?.[phaseId] ?? job.summary?.counts?.[phaseId] ?? null,
    }));
  }

  return entries;
}

function getStatusTone(status: string) {
  switch (status) {
    case 'connected':
    case 'completed':
    case 'ok':
    case 'active':
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

function StatusPill({
  label,
  variant,
  icon,
  ...props
}: {
  label: string;
  variant: 'success' | 'info' | 'warning' | 'outline' | 'danger';
  icon?: ReactNode;
} & ComponentPropsWithoutRef<'span'>) {
  const base = 'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em]';
  const variants: Record<typeof variant, string> = {
    success: 'border-success-50 bg-success-50 text-success-700',
    info: 'border-info-50 bg-info-50 text-info-700',
    warning: 'border-warning-50 bg-warning-50 text-warning-700',
    outline: 'border-cream-300 bg-transparent text-cream-700',
    danger: 'border-danger-50 bg-danger-50 text-danger-700',
  };

  const fallbackTone: Record<typeof variant, StatusTone> = {
    success: 'success',
    info: 'info',
    warning: 'warning',
    outline: 'neutral',
    danger: 'danger',
  };

  return (
    <span className={cn(base, icon ? 'gap-1.5' : '', variants[variant])} {...props}>
      <span className="shrink-0">
        {icon ?? <StatusGlyph tone={fallbackTone[variant]} className="h-3.5 w-3.5" />}
      </span>
      <span className="leading-none">{label}</span>
    </span>
  );
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
  const nextRunAt = isZohoDailySyncSchedule(scheduleFlow.schedule) ? estimateZohoDailyNextRun() : null;

  return {
    flow: scheduleFlow,
    label: formatScheduleSummary(scheduleFlow)?.label ?? null,
    nextRunLabel: nextRunAt ? formatIntegrationDateTimeLabel(nextRunAt.toISOString(), nextRunAt) : null,
    nextRunAt,
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

function getAggregateFreshnessTone(status?: string | null) {
  switch (status) {
    case 'fresh':
      return 'success' as const;
    case 'warning':
      return 'info' as const;
    case 'stale':
      return 'warning' as const;
    case 'failed':
      return 'danger' as const;
    default:
      return 'outline' as const;
  }
}

function getAggregateFreshnessLabel(status?: string | null) {
  switch (status) {
    case 'fresh':
      return 'Fresh';
    case 'warning':
      return 'Watching';
    case 'stale':
      return 'Needs analysis';
    case 'failed':
      return 'Repair required';
    default:
      return 'Unknown';
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

function getEntityErrorLabel(error: NonNullable<IntegrationCatalogItem['recent_entity_errors']>[number]) {
  const entity = labelizePhase(error.entity_type);
  const external = error.external_id ? ` · ${error.external_id}` : '';
  return `${entity}${external}: ${error.error_reason}`;
}

function getJobTimestamp(job: IntegrationSyncJob) {
  return new Date(job.completed_at ?? job.started_at ?? job.created_at).getTime();
}

function sortJobsDesc(jobs: IntegrationSyncJob[]) {
  return [...jobs].sort((a, b) => getJobTimestamp(b) - getJobTimestamp(a));
}

type PhaseState = 'Not Started' | 'Syncing' | 'Paused' | 'Successful' | 'Failed' | 'Cancelled';

function getPhaseStateVariant(state: PhaseState) {
  switch (state) {
    case 'Successful':
      return 'success' as const;
    case 'Syncing':
    case 'Paused':
      return 'info' as const;
    case 'Failed':
      return 'warning' as const;
    case 'Cancelled':
      return 'outline' as const;
    default:
      return 'outline' as const;
  }
}

// Maps a job row's own status straight to a PhaseState — the real, current
// state of that specific phase, independent of any client-side "is my click
// still in flight" flag.
function jobStatusToPhaseState(job: IntegrationSyncJob | null | undefined): PhaseState {
  if (!job) return 'Not Started';
  switch (job.status) {
    case 'running':
    case 'queued':
    case 'pending':
      return 'Syncing';
    case 'paused':
      return 'Paused';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    case 'completed':
      return 'Successful';
    default:
      return 'Not Started';
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
        metaParts.push(`${formatNumberValue(effectiveStat.stat.failed, 'COUNT')} failed`);
        metaParts.push(`${formatNumberValue(effectiveStat.stat.pages, 'COUNT')} pages`);
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
  if (job.summary?.total_processed != null) chips.push({ label: 'Processed', value: formatNumberValue(job.summary.total_processed, 'COUNT') });
  if (job.summary?.total_failed != null) chips.push({ label: 'Failed', value: formatNumberValue(job.summary.total_failed, 'COUNT') });
  // Never let a degraded run (a phase skipped after failing) read as plain
  // success in the UI — see server.ts's mergePostSyncWarnings.
  if (job.summary?.warnings?.length) chips.push({ label: 'Status', value: 'Completed with issues' });
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
  const knownDenominator = progress?.items_total && progress.items_total > 0
    ? progress.items_total
    : progress?.phases_total ?? null;
  if (knownDenominator == null || knownDenominator === 0) return null;

  const numerator = progress?.items_total && progress.items_total > 0
    ? progress.items_processed ?? 0
    : progress?.phase_current ?? 0;
  const percent = Math.max(4, Math.min(100, Math.round((numerator / knownDenominator) * 100)));
  return { percent, numerator, denominator: knownDenominator };
}

const CANONICAL_SYNC_PHASE_IDS = SYNC_PHASE_GROUPS.filter((g) => g.canSyncAgain).flatMap((g) => g.subPhases.map((s) => s.id));

// Derives every expected phase's live state for a specific run (identified by
// its master `sync_run` job), scoped strictly to that run's own slave rows —
// not inferred from mixed cross-run history. Used identically by the live
// Overview phase grid and every History tab entry (one call per past run), so
// "Not Started" can never be confused with "this phase's last known state
// from a previous run".
function getPhaseEntriesForRun(masterJob: IntegrationSyncJob, allJobs: IntegrationSyncJob[]) {
  // The backend's real phases_in_run DOES include transaction_line_items for
  // incremental runs (it's still dispatched/tracked server-side) — filter it
  // here too, not just out of the static phase-group lists above, or it would
  // render for exactly the run kind where it actually happens.
  const expectedPhases = (masterJob.progress?.phases_in_run?.length
    ? masterJob.progress.phases_in_run
    : CANONICAL_SYNC_PHASE_IDS
  ).filter((phaseId) => phaseId !== 'transaction_line_items');
  const slaveRows = allJobs.filter((job) => job.phase !== 'sync_run' && job.master_job_id === masterJob.id);
  const latestByPhase = getLatestJobByPhase(slaveRows);

  return expectedPhases.map((phaseId) => {
    const job = latestByPhase.get(phaseId) ?? null;
    return {
      id: phaseId,
      label: labelizePhase(phaseId),
      state: jobStatusToPhaseState(job),
      // A phase's own progress counters reset to 0 on every resumed attempt
      // (each resume is a fresh job row) — sum across this run's own
      // attempt-chain instead of reading a single row's counters, so this
      // doesn't visibly reset every time a phase pauses and resumes.
      stat: getCumulativePhaseStat(slaveRows, phaseId),
    };
  });
}

// The new per-phase job model never sets items_total/phases_total (those are
// legacy fields from the old monolithic sync), so getProgressText above
// always returns null for a real in-progress run — this computes a real,
// monotonically-increasing progress fraction instead: how many of this run's
// phases have actually completed. When the master job explicitly carries
// phases_in_run (every run created by the current backend does), this always
// returns a real 0/N fraction — even before any slave row exists yet — so the
// optimistic "just clicked Sync" state renders 0/N immediately. Without an
// explicit phase list (older/legacy job rows), fall back to the previous
// behavior: only report progress once at least one phase shows real
// activity, otherwise defer to getProgressText's item-based fraction.
function getOverallRunProgress(masterJob: IntegrationSyncJob, allJobs: IntegrationSyncJob[]) {
  const hasExplicitPhaseList = Boolean(masterJob.progress?.phases_in_run?.length);
  const entries = getPhaseEntriesForRun(masterJob, allJobs);
  if (entries.length === 0) return null;
  if (!hasExplicitPhaseList && !entries.some((entry) => entry.state !== 'Not Started')) return null;

  const completed = entries.filter((entry) => entry.state === 'Successful').length;
  const percent = Math.max(4, Math.min(100, Math.round((completed / entries.length) * 100)));
  return { percent, numerator: completed, denominator: entries.length };
}

function PhaseErrorFlyout({ errors }: { errors: IntegrationEntityError[] }) {
  const [open, setOpen] = useState(false);
  if (errors.length === 0) return null;
  return (
    <div className="rounded-lg border border-danger-200 bg-danger-50">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="font-medium text-danger-800">{errors.length} row{errors.length !== 1 ? 's' : ''} skipped</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-danger-600 transition-transform', open ? 'rotate-180' : '')} />
      </button>
      {open ? (
        <div className="border-t border-danger-200 px-3 pb-2 pt-1 space-y-1">
          {errors.map((e, i) => (
            <div key={`${e.entity_type}-${e.external_id ?? i}`} className="text-xs text-danger-900">
              <span className="font-medium">{labelizePhase(e.entity_type)}</span>
              {e.external_id ? <span className="text-danger-600"> · {e.external_id}</span> : null}
              {e.error_reason ? <span className="text-danger-700"> — {e.error_reason}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type TabId = 'overview' | 'flows' | 'history';

interface ConnectedIntegrationCardProps {
  integration: IntegrationCatalogItem;
  available: boolean;
  isSellerAdmin: boolean;
  onOpenWizard: () => void;
  onDisconnect: () => void;
  onSyncNow: (options: SyncConfirmOptions) => void;
  onSyncPhase: (phaseId: string, options: SyncConfirmOptions) => void;
  onStopSync: () => void;
  onRefresh: () => void;
  onRetryWebhooks: () => void;
  onRepairAggregates: () => void;
  onRunAnalysis: () => void;
  isSyncingNow?: boolean;
  syncTargetPhase?: string | null;
  isStoppingSync?: boolean;
  isRetryingWebhooks?: boolean;
  isRepairingAggregates?: boolean;
  isRunningAnalysis?: boolean;
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
  onRepairAggregates,
  onRunAnalysis,
  isSyncingNow = false,
  syncTargetPhase = null,
  isStoppingSync = false,
  isRetryingWebhooks = false,
  isRepairingAggregates = false,
  isRunningAnalysis = false,
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
  const coverageTotals = integration.coverage_totals ?? ti.coverage_totals ?? {
    locations: 0,
    customers: 0,
    products: 0,
    brands: 0,
    categories: 0,
    pricelists: 0,
    inventory: 0,
    estimates: 0,
    orders: 0,
    invoices: 0,
    transactions: 0,
  };
  const activeFlows = ti.data_flows.filter((flow) => flow.is_active);
  const webhookTelemetry = integration.webhook_telemetry ?? ti.webhook_telemetry ?? null;
  const aggregateFreshness = integration.aggregate_freshness ?? ti.aggregate_freshness ?? null;
  const failedRun = latestFinishedRun?.status === 'failed' ? latestFinishedRun : null;
  const displayStatus = (() => {
    if (!available) return { label: 'Gated', variant: 'outline' as const };
    if (activeJob?.status === 'running') return { label: 'Syncing', variant: 'info' as const };
    if (activeJob?.status === 'queued') return { label: 'Queued', variant: 'info' as const };
    if (activeJob?.status === 'pending') return { label: 'Pending', variant: 'info' as const };
    if (activeJob?.status === 'paused') return { label: 'Paused', variant: 'info' as const };
    if (latestFinishedRun?.status === 'cancelled') return { label: 'Cancelled', variant: 'success' as const };
    if (failedRun) return { label: 'Sync failed', variant: 'warning' as const };
    if (ti.health_status === 'expired' || ti.health_status === 'invalid') return { label: 'Needs attention', variant: 'warning' as const };
    if (ti.status === 'disconnected') return { label: 'Disconnected', variant: 'outline' as const };
    if (ti.status === 'connected') return { label: 'Connected', variant: 'success' as const };
    return { label: labelize(ti.status), variant: getStatusVariant(ti.status) };
  })();

  const isSyncFailed = activeJob?.status === 'failed' || failedRun != null;
  const isSyncInProgress = activeJob?.phase === 'sync_run'
    ? ['running', 'queued', 'pending', 'paused'].includes(activeJob.status)
    : ['running', 'queued', 'pending', 'paused'].includes(activeJob?.status ?? '');
  const needsReconnect = ti.status === 'disconnected' || ti.health_status === 'expired' || ti.health_status === 'invalid';
  const Icon = getIntegrationIcon(integration);
  const currentRun = activeJob ?? latestVisibleRun;
  const syncablePhaseActions = getSyncablePhaseActions(integration);
  const runHistory = activeJob ? [activeJob, ...sortedHistory.filter((job) => job.id !== activeJob.id)] : sortedHistory;
  // Scoped strictly to the active run's own slave rows (via master_job_id) —
  // shows every expected phase, including ones that haven't started yet, not
  // just ones already active with some recorded activity.
  const currentRunPhaseEntries = activeJob ? getPhaseEntriesForRun(activeJob, runHistory) : [];
  // History tab: one entry per RUN (master `sync_run` row), not per phase row
  // — excludes whichever master is the currently-live run, already shown
  // above via IntegrationJobLiveLog.
  const historicalMasters = sortedHistory.filter((job) => job.phase === 'sync_run' && job.id !== activeJob?.id);
  // While a sync is actually in progress, prefer the real "phases completed /
  // N" fraction — the new per-phase job model never populates the legacy
  // items_total/phases_total fields getProgressText relies on, so that would
  // otherwise render nothing (or a stale value from an old legacy job).
  const currentRunProgress = isSyncInProgress && activeJob
    ? getOverallRunProgress(activeJob, runHistory) ?? (currentRun ? getProgressText(currentRun) : null)
    : currentRun ? getProgressText(currentRun) : null;
  const overviewCards = ENTITY_GROUPS.map((group) => {
    const totals = getGroupSummaryTotals(coverageTotals, group.key);
    const latestGroupRun = getGroupRelevantJob(runHistory, group.key);
    const scheduleSummary = getMatchingFlowSummary(activeFlows, group.key);
    const state = getGroupState(latestGroupRun, group.key, scheduleSummary?.lastRunAt ?? null);
    const phaseAction = syncablePhaseActions.find((phase) => phase.id === group.key) ?? null;
    const lastRunAt = scheduleSummary?.lastRunAt ?? getRunTime(latestGroupRun);
    const nextRunAt = scheduleSummary?.nextRunAt ?? null;

    return {
      ...group,
      total: totals?.total ?? 0,
      items: totals?.items ?? {},
      state,
      latestGroupRun,
      scheduleSummary,
      phaseAction,
      lastRunAt,
      nextRunAt,
      isCurrentTarget: syncTargetPhase === group.key,
    };
  });
  const latestSyncLabel = latestVisibleRun ? formatIntegrationDateTimeLabel(getRunTime(latestVisibleRun)) : 'Not yet';
  const latestSyncNote = latestVisibleRun
    ? latestVisibleRun.summary?.note ?? latestVisibleRun.progress?.note ?? 'No note'
    : 'No sync activity yet';
  const webhookState = webhookTelemetry?.status ?? 'missing';
  const webhookStateLabel = webhookState === 'active'
    ? 'WEBHOOKS ACTIVE'
    : webhookState === 'failed'
      ? 'WEBHOOKS RETRYING'
      : webhookState === 'pending'
        ? 'WEBHOOKS PENDING'
        : 'WEBHOOKS MISSING';
  const webhookCards = ENTITY_GROUPS.map((group) => {
    const telemetry = webhookTelemetry?.entities[group.key] ?? {
      active: false,
      create: false,
      update: false,
      delete: false,
      processed_last_24h: 0,
      failed_last_24h: 0,
    };
    const totals = getGroupSummaryTotals(coverageTotals, group.key);
    return {
      ...group,
      total: totals?.total ?? 0,
      items: totals?.items ?? {},
      telemetry,
    };
  });
  const allEntityErrors = (integration.recent_entity_errors ?? ti.recent_entity_errors ?? []) as IntegrationEntityError[];
  const recentEntityErrors = allEntityErrors.slice(0, 4);
  const canRunAnalysis = isSellerAdmin && available && !isSyncInProgress && !isRunningAnalysis;
  const canRepairAggregates = isSellerAdmin && available && !isSyncInProgress && !isRepairingAggregates &&
    aggregateFreshness != null && aggregateFreshness.status !== 'fresh';

  function openFullSyncDialog() {
    setSyncDialog({ open: true, mode: 'full' });
  }

  function openPhaseSyncDialog(phaseId: string, phaseLabel: string) {
    setSyncDialog({ open: true, mode: 'phase', phaseId, phaseLabel });
  }

  function handleSyncWindowConfirm(options: SyncConfirmOptions) {
    if (syncDialog.mode === 'phase' && syncDialog.phaseId) {
      onSyncPhase(syncDialog.phaseId, options);
      return;
    }
    onSyncNow(options);
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
                <StatusPill label={displayStatus.label} variant={displayStatus.variant} />
              </div>
              <p className="text-sm text-cream-600">{integration.description}</p>
            </div>
          </div>
          {isSellerAdmin && available ? (
            <div className="flex flex-row-reverse flex-wrap items-center justify-end gap-2">
              {isSyncInProgress ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={onStopSync}
                  disabled={isStoppingSync}
                >
                  <History className="h-4 w-4" />
                  {isStoppingSync ? 'Stopping…' : 'Stop sync'}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  onClick={openFullSyncDialog}
                  disabled={isSyncingNow || !isOAuthLiveTenantIntegrationStatus(ti.status)}
                >
                  <RefreshCw className="h-4 w-4" />
                  {isSyncFailed ? 'Sync Again' : 'Sync now'}
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={onOpenWizard}>
                <Plug className="h-4 w-4" />
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
                <Unplug className="h-4 w-4" />
                Disconnect
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="space-y-5 px-5 py-5">
        <div className="grid gap-3 md:grid-cols-4">
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
              {activeJob ? 'Live Sync' : 'Latest Sync'}
            </div>
            <div className="mt-3 text-lg font-semibold text-cream-900">
              {latestSyncLabel}
            </div>
            <div className="mt-2 text-sm text-cream-700">Latest note: {latestSyncNote}</div>
          </div>

          <div className="rounded-2xl border border-cream-200 bg-cream-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Aggregate Freshness</div>
            <div className="mt-3 flex items-center gap-2 text-lg font-semibold text-cream-900">
              <StatusPill
                label={getAggregateFreshnessLabel(aggregateFreshness?.status)}
                variant={getAggregateFreshnessTone(aggregateFreshness?.status)}
              />
            </div>
            <div className="mt-2 text-sm text-cream-700">
              {aggregateFreshness?.latest_aggregate_at
                ? `Last rebuild ${formatDate(aggregateFreshness.latest_aggregate_at, true)}`
                : 'No aggregate rebuild recorded yet'}
            </div>
            <div className="mt-1 text-xs text-cream-600">
              Snapshots {formatDate(aggregateFreshness?.latest_snapshot_refreshed_at, true)} · KPI tables {formatDate(aggregateFreshness?.latest_kpi_updated_at, true)}
            </div>
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
            {aggregateFreshness?.warning_message ? (
              <div
                className={cn(
                  'rounded-2xl px-4 py-4',
                  aggregateFreshness.status === 'failed'
                    ? 'border border-danger-200 bg-danger-50'
                    : 'border border-warning-500/30 bg-warning-50',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className={cn('text-sm font-semibold', aggregateFreshness.status === 'failed' ? 'text-danger-950' : 'text-warning-950')}>
                      {aggregateFreshness.status === 'failed' ? 'Aggregate rebuild needs repair' : 'Aggregate freshness needs attention'}
                    </div>
                    <p className={cn('mt-1 text-sm leading-6', aggregateFreshness.status === 'failed' ? 'text-danger-900' : 'text-warning-900')}>
                      {aggregateFreshness.warning_message}
                    </p>
                    {aggregateFreshness.last_retried_at ? (
                      <p className={cn('mt-1 text-xs', aggregateFreshness.status === 'failed' ? 'text-danger-700' : 'text-warning-700')}>
                        Last repair attempt {formatDate(aggregateFreshness.last_retried_at, true)}
                      </p>
                    ) : null}
                  </div>
                  {isSellerAdmin && available ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {canRepairAggregates ? (
                        <Button type="button" variant="outline" size="sm" onClick={onRepairAggregates} disabled={isRepairingAggregates}>
                          <ShieldAlert className="h-3.5 w-3.5" />
                          {isRepairingAggregates ? 'Repairing…' : 'Repair Aggregates'}
                        </Button>
                      ) : null}
                      <Button type="button" variant="accent" size="sm" onClick={onRunAnalysis} disabled={!canRunAnalysis}>
                        <Sparkles className="h-3.5 w-3.5" />
                        {isRunningAnalysis ? 'Running…' : 'Run Analysis'}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {currentRun ? (
              <details className="group rounded-2xl border border-cream-200 bg-white">
                <summary className="cursor-pointer list-none px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-cream-900">{labelize(activeJob?.job_type ?? currentRun.job_type)}</span>
                        <StatusPill label={labelize(currentRun.status)} variant={getStatusVariant(currentRun.status)} />
                      </div>
                      <div className="mt-1 text-sm text-cream-700">
                        {currentRun.progress?.phase_label
                          ?? currentRun.summary?.note
                          // "Waiting for worker…" reads as in-progress — wrong for a run
                          // that already ended without ever setting a phase_label/note
                          // (e.g. reaper-halted on a permanently-failed slave).
                          ?? (['failed', 'cancelled', 'completed'].includes(currentRun.status)
                            ? 'No details recorded for this run.'
                            : 'Waiting for worker…')}
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
                          {formatNumberValue(currentRunProgress.numerator, 'COUNT')} / {formatNumberValue(currentRunProgress.denominator, 'COUNT')}
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
                                ? `${formatNumberValue(phase.stat.processed, 'COUNT')} synced · ${formatNumberValue(phase.stat.failed, 'COUNT')} failed · ${formatNumberValue(phase.stat.pages, 'COUNT')} pages`
                                : 'No progress yet'}
                            </div>
                          </div>
                          <StatusPill label={phase.state} variant={getPhaseStateVariant(phase.state)} />
                        </div>
                      ))
                    ) : (
                      <div className="rounded-lg border border-dashed border-cream-300 bg-cream-50 px-3 py-4 text-sm text-cream-700">
                        Phase tracker will populate once the first update arrives.
                      </div>
                    )}
                  </div>
                </div>
              </details>
            ) : null}

            <div className="space-y-3">
              <div className="text-sm font-semibold text-cream-900">Sync phases</div>
              {SYNC_PHASE_GROUPS.map((phaseGroup) => {
                const canSync = isSellerAdmin && available && !isSyncingNow &&
                  isOAuthLiveTenantIntegrationStatus(ti.status) && phaseGroup.canSyncAgain;

                // Aggregate sub-phase counts (always live, from coverageTotals) and
                // status. When a run is active, state is scoped strictly to THAT
                // run's own slave rows (getPhaseEntriesForRun) so a phase not yet
                // reached in the current run reads "Not Started" rather than
                // whatever it was left at by a previous run; otherwise (idle) fall
                // back to each phase's own latest job row across all history.
                const latestJobByPhase = getLatestJobByPhase(runHistory);
                const lastCompletedByPhase = getLastCompletedJobByPhase(runHistory);
                const activeRunEntries = activeJob ? getPhaseEntriesForRun(activeJob, runHistory) : null;
                const subPhaseRows = phaseGroup.subPhases.map((sub) => {
                  const count = (() => {
                    switch (sub.id) {
                      case 'locations': return coverageTotals.locations ?? 0;
                      case 'products': return (coverageTotals.products ?? 0) + (coverageTotals.brands ?? 0) + (coverageTotals.categories ?? 0);
                      case 'inventory': return coverageTotals.inventory ?? 0;
                      case 'pricelists': return coverageTotals.pricelists ?? 0;
                      case 'customers': return coverageTotals.customers ?? 0;
                      case 'estimates': return coverageTotals.estimates ?? 0;
                      case 'orders': return coverageTotals.orders ?? 0;
                      case 'invoices': return coverageTotals.invoices ?? 0;
                      default: return 0;
                    }
                  })();

                  const latestJob = latestJobByPhase.get(sub.id) ?? null;
                  const activeEntry = activeRunEntries?.find((entry) => entry.id === sub.id) ?? null;
                  const state = activeEntry ? activeEntry.state : jobStatusToPhaseState(latestJob);
                  const isSyncing = state === 'Syncing' || state === 'Paused';
                  const pagesNote = isSyncing && latestJob?.progress
                    ? (() => {
                        const pg = (latestJob.progress as { pages_fetched?: number }).pages_fetched;
                        return pg ? `page ${pg}` : null;
                      })()
                    : null;
                  // "This attempt" (cumulative across resumed rows, not reset per
                  // row) vs. "last completed run" — shown side by side so it's
                  // clear whether the current number is fresh progress or the
                  // same total the previous full sync already reached.
                  const currentSynced = isSyncing ? (activeEntry?.stat ?? getCumulativePhaseStat(runHistory, sub.id)) : null;
                  const completedJob = lastCompletedByPhase.get(sub.id) ?? null;
                  const previousSynced = completedJob && completedJob.id !== latestJob?.id
                    ? completedJob.progress?.counts?.[sub.id] ?? completedJob.summary?.counts?.[sub.id] ?? null
                    : null;

                  return { ...sub, count, state, isSyncing, pagesNote, currentSynced, previousSynced };
                });

                const phaseTotal = subPhaseRows.reduce((s, r) => s + r.count, 0);
                const anyActive = subPhaseRows.some((r) => r.state === 'Syncing');
                const anyPaused = subPhaseRows.some((r) => r.state === 'Paused');
                const anyFailed = subPhaseRows.some((r) => r.state === 'Failed');

                // For Phase 3 (analysis), find the dedicated analysis job
                const analysisJob = phaseGroup.id === 'analysis'
                  ? getLatestJobByPhase(runHistory).get('analysis') ?? null
                  : null;
                const analysisStatus = analysisJob?.status ?? null;
                const analysisRunning = analysisStatus === 'running';
                const analysisComplete = analysisStatus === 'completed';
                const analysisFailed = analysisStatus === 'failed';
                const phaseIsOpen = anyActive || analysisRunning;

                return (
                  <details key={phaseGroup.id} className="group/phase overflow-hidden rounded-2xl border border-cream-200 bg-white" open={phaseIsOpen}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <ChevronDown className="h-4 w-4 shrink-0 text-cream-500 transition-transform group-open/phase:rotate-180" />
                        <div>
                          <div className="text-sm font-semibold text-cream-900">{phaseGroup.label}</div>
                          <div className="text-xs text-cream-600">{phaseGroup.description}</div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {anyActive || analysisRunning ? (
                          <StatusPill label="Running" variant="info" />
                        ) : anyPaused ? (
                          <StatusPill label="Paused" variant="info" />
                        ) : anyFailed || analysisFailed ? (
                          <StatusPill label="Failed" variant="danger" />
                        ) : analysisComplete || phaseTotal > 0 ? (
                          <StatusPill label="Done" variant="success" />
                        ) : null}
                        {!analysisComplete && !analysisRunning && !anyActive && !anyPaused && phaseTotal > 0 && phaseGroup.id !== 'analysis' ? (
                          <span className="text-sm font-medium text-cream-900">{formatNumberValue(phaseTotal, 'COUNT')} records</span>
                        ) : null}
                        {phaseGroup.canSyncAgain ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              openPhaseSyncDialog(phaseGroup.id, phaseGroup.label.replace(/^Phase \d+ — /, ''));
                            }}
                            disabled={!canSync}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            {isSyncingNow && syncTargetPhase === phaseGroup.id ? 'Syncing…' : 'Sync Again'}
                          </Button>
                        ) : phaseGroup.id === 'analysis' && isSellerAdmin && available ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              onRunAnalysis();
                            }}
                            disabled={!canRunAnalysis}
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            {isRunningAnalysis ? 'Running…' : 'Run Analysis'}
                          </Button>
                        ) : null}
                      </div>
                    </summary>

                    <div className="border-t border-cream-200 bg-cream-50 px-4 py-3">
                      <div className="space-y-2">
                        {phaseGroup.id === 'analysis' ? (
                          <div className="space-y-2">
                            <div className="rounded-lg border border-cream-200 bg-white px-3 py-3 text-sm text-cream-700">
                              Rebuild snapshots and KPI tables from the rows already synced into DealFlow. Use this after a repaired sync or any time seller metrics look stale; it does not pull fresh source rows.
                            </div>
                            {analysisRunning ? (
                              <div className="flex items-center gap-2 text-sm text-info-700">
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                Computing snapshots and KPI tables…
                              </div>
                            ) : analysisFailed ? (
                              <div className="text-sm text-danger-700">
                                Analysis failed: {analysisJob?.progress?.phase_label ?? 'check sync logs for details'}
                              </div>
                            ) : analysisComplete ? (
                              <>
                                <div className="flex items-center justify-between gap-3 rounded-lg border border-cream-200 bg-white px-3 py-2 text-sm">
                                  <span className="text-cream-900">Snapshots</span>
                                  <span className="text-success-700 font-medium">Ready</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 rounded-lg border border-cream-200 bg-white px-3 py-2 text-sm">
                                  <span className="text-cream-900">KPI tables</span>
                                  <span className="text-success-700 font-medium">Ready</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 rounded-lg border border-cream-200 bg-white px-3 py-2 text-sm">
                                  <span className="text-cream-900">Recommendations</span>
                                  <span className="text-success-700 font-medium">Ready</span>
                                </div>
                                <div className="rounded-lg border border-cream-200 bg-white px-3 py-2 text-xs text-cream-600">
                                  Snapshots {formatDate(aggregateFreshness?.latest_snapshot_refreshed_at, true)} · KPI tables {formatDate(aggregateFreshness?.latest_kpi_updated_at, true)}
                                </div>
                              </>
                            ) : (
                              <div className="text-sm text-cream-700">
                                Triggered automatically after Phase 2 completes. You can also run it manually without re-importing Zoho data.
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            {subPhaseRows.map((sub) => (
                              <div key={sub.id} className="flex items-center justify-between gap-3 rounded-lg border border-cream-200 bg-white px-3 py-2">
                                <div className="text-sm text-cream-900">{sub.label}</div>
                                <div className="flex items-center gap-3 text-sm">
                                  <div className="text-right">
                                    {sub.isSyncing ? (
                                      <div className="text-info-700">
                                        {sub.currentSynced
                                          ? `${formatNumberValue(sub.currentSynced.processed, 'COUNT')} synced so far`
                                          : sub.pagesNote ? `syncing ${sub.pagesNote}…` : 'syncing…'}
                                      </div>
                                    ) : sub.count > 0 ? (
                                      <div className="font-medium text-cream-900">{formatNumberValue(sub.count, 'COUNT')}</div>
                                    ) : (
                                      <div className="text-cream-500">—</div>
                                    )}
                                    {sub.isSyncing && sub.previousSynced ? (
                                      <div className="text-xs text-cream-500">
                                        last sync: {formatNumberValue(sub.previousSynced.processed, 'COUNT')}
                                      </div>
                                    ) : null}
                                  </div>
                                  {sub.state !== 'Not Started' ? (
                                    <StatusPill label={sub.state} variant={getPhaseStateVariant(sub.state)} />
                                  ) : null}
                                </div>
                              </div>
                            ))}
                            <PhaseErrorFlyout
                              errors={allEntityErrors.filter((e) => phaseGroup.errorEntityTypes.includes(e.entity_type))}
                            />
                            <p className="pt-1 text-xs text-cream-500">{phaseGroup.syncWindowLabel}</p>
                          </>
                        )}
                      </div>
                    </div>
                  </details>
                );
              })}
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
                  <StatusPill label={labelize(failedRun.job_type)} variant="warning" />
                </div>
              </div>
            ) : null}

            {recentEntityErrors.length > 0 ? (
              <div className="rounded-2xl border border-danger-200 bg-danger-50 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-danger-950">Recent entity sync errors</div>
                    <p className="mt-1 text-sm leading-6 text-danger-900">
                      These are the latest entity-map failures captured with `error_reason` for faster debugging.
                    </p>
                  </div>
                  <StatusPill label="Entity errors" variant="warning" />
                </div>
                <div className="mt-3 space-y-2">
                  {recentEntityErrors.map((error: IntegrationEntityError) => (
                    <div key={`${error.entity_type}-${error.external_id ?? error.updated_at ?? error.error_reason}`} className="rounded-lg border border-danger-200 bg-white px-3 py-2 text-sm text-danger-950">
                      {getEntityErrorLabel(error)}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : tab === 'flows' ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-cream-200 bg-cream-50 px-4 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-cream-900">Schedule coverage</div>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-cream-700">
                    Each active flow keeps the same four-group structure so schedule and sync state stay easy to scan.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-4">
                {overviewCards.map((card) => (
                  <div key={`schedule-${card.key}`} className="rounded-2xl border border-cream-200 bg-white px-4 pt-4 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-cream-900">{card.label}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.12em] text-cream-600">
                          {card.scheduleSummary?.label ?? 'No schedule'}
                        </div>
                        <div className="mt-2 text-sm text-cream-700">
                          {card.scheduleSummary?.lastRunAt
                            ? `as of ${formatIntegrationDateTimeLabel(card.scheduleSummary.lastRunAt)}`
                            : 'No sync yet'}
                        </div>
                      </div>
                      <StatusPill
                        label={card.scheduleSummary?.nextRunAt ? 'Scheduled' : 'Not scheduled'}
                        variant={card.scheduleSummary?.nextRunAt ? 'success' : 'outline'}
                      />
                    </div>
                    <div className="mt-3 text-sm leading-6 text-cream-700">
                      {card.scheduleSummary?.nextRunAt
                        ? `Next run ${formatIntegrationDateTimeLabel(card.scheduleSummary.nextRunAt.toISOString())}`
                        : 'No next run set'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-cream-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-cream-900">Webhooks</div>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-cream-700">
                    Webhooks are Zoho&apos;s instant signals that something changed. We capture CREATE, UPDATE, and DELETE events as they arrive.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {webhookTelemetry?.status !== 'active' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onRetryWebhooks}
                      disabled={isRetryingWebhooks}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isRetryingWebhooks ? 'animate-spin' : ''}`} />
                      {isRetryingWebhooks ? 'Setting up…' : 'Setup Webhooks'}
                    </Button>
                  )}
                  <StatusPill
                    data-testid="webhooks-status-label"
                    label={webhookStateLabel}
                    variant={webhookTelemetry?.status === 'active'
                      ? 'success'
                      : webhookTelemetry?.status === 'failed'
                        ? 'warning'
                        : 'info'}
                    icon={<Webhook className="h-3.5 w-3.5" />}
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-4">
                {webhookCards.map((card) => (
                  <div key={`webhook-${card.key}`} className="rounded-2xl border border-cream-200 bg-cream-50 px-4 pt-4 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-cream-900">{card.label}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.12em] text-cream-600">Captured updates</div>
                      </div>
                      <StatusPill
                        label={card.telemetry.active ? 'Active' : 'Inactive'}
                        variant={card.telemetry.active ? 'success' : 'outline'}
                        icon={<Webhook className="h-3.5 w-3.5" />}
                      />
                    </div>
                    {card.key !== 'locations' || card.telemetry.active ? (
                      <>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <StatusPill label={card.telemetry.create ? 'CREATE' : 'CREATE off'} variant={card.telemetry.create ? 'success' : 'outline'} />
                          <StatusPill label={card.telemetry.update ? 'UPDATE' : 'UPDATE off'} variant={card.telemetry.update ? 'success' : 'outline'} />
                          <StatusPill label={card.telemetry.delete ? 'DELETE' : 'DELETE off'} variant={card.telemetry.delete ? 'success' : 'outline'} />
                        </div>
                        <div className="mt-3 space-y-1 text-sm text-cream-700">
                          <div>today · {formatNumberValue(card.telemetry.processed_last_24h, 'COUNT')} processed</div>
                          <div>{formatNumberValue(card.telemetry.failed_last_24h, 'COUNT')} failed</div>
                        </div>
                      </>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 px-4 py-5">
              <div className="text-sm font-semibold text-cream-900">Sync to Zoho</div>
              <p className="mt-1 text-sm leading-6 text-cream-700">
                Placeholder for outbound write-back rules. We&apos;ll use this space later to show which DealFlow changes are pushed into Zoho.
              </p>
            </div>

            {integration.id.startsWith('zoho_') ? (
              <FieldMappingsPanel tenantIntegrationId={ti.id} />
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            {activeJob ? <IntegrationJobLiveLog activeJob={activeJob} /> : null}

            {historicalMasters.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 px-4 py-6 text-sm text-cream-700">
                Sync history will appear here after the first import runs.
              </div>
            ) : (
              <div className="divide-y divide-cream-200 overflow-hidden rounded-2xl border border-cream-200 bg-white">
                {historicalMasters.map((job) => {
                  const phaseEntries = getPhaseEntriesForRun(job, sortedHistory).filter((phase) => phase.stat || phase.state !== 'Not Started');
                  const scopeLabel = labelize(job.job_type);
                  const sinceLabel = job.since_date
                    ? formatIntegrationDateTimeLabel(job.since_date)
                    : job.summary?.since
                      ? formatIntegrationDateTimeLabel(job.summary.since)
                      : 'All time';
                  const completedLabel = formatIntegrationDateTimeLabel(job.summary?.last_synced_at ?? getRunTime(job));
                  return (
                    <details key={job.id} className="group px-4 py-4">
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-cream-900">{labelize(job.job_type)}</span>
                            {job.run_origin ? (
                              <StatusPill
                                label={formatRunOrigin(job.run_origin) ?? 'Unknown'}
                                variant={job.run_origin === 'scheduled' ? 'success' : 'outline'}
                              />
                            ) : null}
                            <StatusPill label={labelize(job.status)} variant={getStatusVariant(job.status)} />
                          </div>
                          <p className="mt-1 text-sm text-cream-700">
                            {job.progress?.phase_label ?? job.summary?.note ?? 'No phase details reported yet.'}
                          </p>
                          <p className="mt-2 text-xs uppercase tracking-[0.12em] text-cream-600">
                            {scopeLabel} · Since {sinceLabel} · {completedLabel}
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
                          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                        </div>
                      </summary>

                      <div className="ml-4 border-cream-200 pt-4">
                        <div className="grid gap-3 xl:grid-cols-4">
                          {phaseEntries.length > 0 ? (
                            phaseEntries.map((phase) => (
                              <div key={`${job.id}-${phase.id}`} className="rounded-xl border border-cream-200 bg-cream-50 px-4 py-3">
                                <div className="text-sm font-medium text-cream-900">{phase.label}</div>
                                <div className="mt-1 text-xs text-cream-600">
                                  {phase.stat
                                    ? `${formatNumberValue(phase.stat.processed, 'COUNT')} synced · ${formatNumberValue(phase.stat.failed, 'COUNT')} failed · ${formatNumberValue(phase.stat.pages, 'COUNT')} pages`
                                    : 'No progress yet'}
                                </div>
                                <div className="mt-2">
                                  <StatusPill label={phase.state} variant={getPhaseStateVariant(phase.state)} />
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-xl border border-dashed border-cream-300 bg-cream-50 px-4 py-5 text-sm text-cream-700 xl:col-span-4">
                              No in-scope phases were reported for this run.
                            </div>
                          )}
                        </div>
                      </div>
                    </details>
                  );
                })}
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
