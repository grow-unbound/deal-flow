'use client';

import { useState } from 'react';
import {
  BookCheck,
  Boxes,
  Building2,
  Cable,
  CheckCircle2,
  DatabaseZap,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DetailTabs } from '@/components/seller/detail/DetailTabs';
import type { IntegrationCatalogItem, IntegrationSyncJob } from '@/hooks/useIntegrationsSettings';
import { cn } from '@/lib/utils';
import { IntegrationJobLiveLog } from './IntegrationJobLiveLog';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function labelize(value: string) {
  return value
    .split('_')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function formatDate(value?: string | null, withTime = false) {
  if (!value) return withTime ? 'Not yet' : 'Not set';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return withTime ? 'Not yet' : 'Not set';
  return new Intl.DateTimeFormat('en-IN', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(d);
}

function getStatusVariant(status: string) {
  switch (status) {
    case 'connected':
    case 'completed':
    case 'ok':
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

function getProgressPercent(job?: IntegrationSyncJob | null) {
  if (!job?.progress) return 0;
  const total = job.progress.items_total ?? 0;
  const processed = job.progress.items_processed ?? 0;
  if (total > 0) return Math.max(4, Math.min(100, Math.round((processed / total) * 100)));
  const phasesTotal = job.progress.phases_total ?? 0;
  const phaseCurrent = job.progress.phase_current ?? 0;
  if (phasesTotal > 0) return Math.max(4, Math.min(100, Math.round((phaseCurrent / phasesTotal) * 100)));
  return job.status === 'queued' ? 8 : 18;
}

function getIntegrationIcon(integration: IntegrationCatalogItem) {
  if (integration.connectivity_mode === 'local') return Cable;
  if (integration.id.includes('inventory')) return Boxes;
  if (integration.id.includes('books')) return BookCheck;
  return ServerCog;
}

function getImportScopes(integration: IntegrationCatalogItem) {
  return [
    ...(integration.capabilities?.inbound_reference ?? []),
    ...(integration.capabilities?.inbound_transactional ?? []),
  ];
}

function getSummaryIcon(key: string) {
  if (key === 'brands') return Building2;
  if (key === 'products') return Boxes;
  if (key === 'customers') return BookCheck;
  return DatabaseZap;
}

// ─── Component ───────────────────────────────────────────────────────────────

type TabId = 'overview' | 'flows' | 'history';

interface ConnectedIntegrationCardProps {
  integration: IntegrationCatalogItem;
  available: boolean;
  isSellerAdmin: boolean;
  onOpenWizard: () => void;
}

export function ConnectedIntegrationCard({
  integration,
  available,
  isSellerAdmin,
  onOpenWizard,
}: ConnectedIntegrationCardProps) {
  const [tab, setTab] = useState<TabId>('overview');

  const ti = integration.tenant_integration!;
  const activeJob = ti.active_job ?? null;
  const latestCompleted = ti.sync_history.find((j) => j.status === 'completed') ?? null;
  const summaryEntries = Object.entries(latestCompleted?.summary ?? {});

  // Derive display status
  const displayStatus = (() => {
    if (!available) return { label: 'Gated', variant: 'outline' as const };
    const jobStatus = activeJob?.status;
    if (jobStatus === 'running') return { label: 'Syncing', variant: 'info' as const };
    if (jobStatus === 'queued') return { label: 'Queued', variant: 'info' as const };
    const health = ti.health_status;
    if (health === 'expired' || health === 'invalid') return { label: 'Needs attention', variant: 'warning' as const };
    if (ti.status === 'sync_failed') return { label: 'Sync failed', variant: 'warning' as const };
    if (ti.status === 'disconnected') return { label: 'Disconnected', variant: 'outline' as const };
    if (ti.status === 'connected') return { label: 'Connected', variant: 'success' as const };
    return { label: labelize(ti.status), variant: getStatusVariant(ti.status) };
  })();

  const needsReconnect =
    ti.status === 'sync_failed' ||
    ti.status === 'disconnected' ||
    ti.health_status === 'expired' ||
    ti.health_status === 'invalid';

  const Icon = getIntegrationIcon(integration);

  return (
    <section className="overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-xs">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-cream-200 bg-cream-50 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cream-200 bg-white text-teal-700 shadow-sm">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg text-cream-900">{integration.display_name}</h2>
              <p className="text-sm text-cream-600">{integration.description}</p>
            </div>
          </div>
          <Badge variant={displayStatus.variant} className="shrink-0">
            {displayStatus.label}
          </Badge>
        </div>
      </header>

      <div className="space-y-5 px-5 py-5">
        {/* ── Metric strip ───────────────────────────────────────────────── */}
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
            <div className="mt-2 text-sm text-cream-700">
              Checked {formatDate(ti.last_health_check_at, true)}
            </div>
          </div>

          <div className="rounded-2xl border border-cream-200 bg-cream-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Connected</div>
            <div className="mt-3 text-lg font-semibold text-cream-900">{formatDate(ti.connected_at)}</div>
            <div className="mt-2 text-sm text-cream-700">First successful handshake for this tenant.</div>
          </div>

          <div className="rounded-2xl border border-cream-200 bg-cream-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Latest sync</div>
            <div className="mt-3 text-lg font-semibold text-cream-900">
              {formatDate(latestCompleted?.completed_at, true)}
            </div>
            <div className="mt-2 text-sm text-cream-700">
              {activeJob ? 'Polling every 3 seconds while active.' : 'Updates after every completed run.'}
            </div>
          </div>
        </div>

        {/* ── Active job progress ────────────────────────────────────────── */}
        {activeJob ? (
          <div className="space-y-4 rounded-2xl border border-cream-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-cream-900">{labelize(activeJob.job_type)}</span>
                <Badge variant={getStatusVariant(activeJob.status)}>{labelize(activeJob.status)}</Badge>
              </div>
              <div className="text-sm text-cream-600">
                Phase {activeJob.progress?.phase_current ?? 0} of {activeJob.progress?.phases_total ?? 0}
                {' · '}
                {activeJob.progress?.items_processed ?? 0} / {activeJob.progress?.items_total ?? 0} items
                {' · '}
                {activeJob.progress?.items_failed ?? 0} errors
              </div>
            </div>

            <div className="h-2.5 overflow-hidden rounded-full bg-cream-200">
              <div
                className="h-full rounded-full bg-teal-500 transition-[width] duration-700"
                style={{ width: `${getProgressPercent(activeJob)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-sm text-cream-700">
              <span>{getProgressPercent(activeJob)}% complete</span>
              <span>{activeJob.progress?.phase_label ?? 'Waiting for worker…'}</span>
            </div>
          </div>
        ) : summaryEntries.length > 0 ? (
          /* ── Last import summary ────────────────────────────────────────── */
          <div className="rounded-2xl border border-cream-200 bg-white p-4">
            <div className="text-sm font-semibold text-cream-900">Latest import summary</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {summaryEntries.map(([key, count]) => {
                const SummaryIcon = getSummaryIcon(key);
                return (
                  <div key={key} className="rounded-xl border border-cream-200 bg-cream-50 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-teal-700 ring-1 ring-cream-200">
                        <SummaryIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">
                          {labelize(key)}
                        </div>
                        <div className="text-lg font-semibold text-cream-900">{count}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* ── Action row ─────────────────────────────────────────────────── */}
        {isSellerAdmin && available ? (
          <div className="flex items-center gap-2">
            {needsReconnect ? (
              <Button type="button" variant="outline" size="sm" onClick={onOpenWizard}>
                Reconnect
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-danger-700 hover:bg-danger-50 hover:text-danger-800"
                onClick={onOpenWizard}
              >
                Disconnect
              </Button>
            )}
          </div>
        ) : null}

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
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

        {/* ── Tab content ────────────────────────────────────────────────── */}
        {tab === 'overview' ? (
          <div className="space-y-4">
            {activeJob ? (
              <IntegrationJobLiveLog activeJob={activeJob} />
            ) : (
              <>
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

                {getImportScopes(integration).length > 0 ? (
                  <div className="rounded-2xl border border-cream-200 bg-cream-50 px-4 py-4">
                    <div className="text-sm font-semibold text-cream-900">Import coverage</div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {getImportScopes(integration).map((scope) => (
                        <div key={scope} className="rounded-xl border border-cream-200 bg-white px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-teal-600" />
                            <span className="text-sm font-medium text-cream-900">{labelize(scope)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : tab === 'flows' ? (
          <div>
            {ti.data_flows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 px-4 py-6 text-sm text-cream-700">
                Data flows will unlock after the first import completes.
              </div>
            ) : (
              <div className="space-y-3">
                {ti.data_flows.map((flow) => (
                  <div key={flow.id} className="rounded-2xl border border-cream-200 bg-white px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-cream-900">{labelize(flow.entity_type)}</span>
                      <Badge variant={flow.is_active ? 'success' : 'outline'}>
                        {flow.is_active ? 'Active' : 'Paused'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-cream-700">
                      {labelize(flow.direction)} via {labelize(flow.trigger_type)}
                      {flow.schedule ? ` · ${flow.schedule}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            {ti.sync_history.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 px-4 py-6 text-sm text-cream-700">
                Sync history will appear here after the first import runs.
              </div>
            ) : (
              <div className="space-y-3">
                {ti.sync_history.map((job) => (
                  <div key={job.id} className="rounded-2xl border border-cream-200 bg-white px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-cream-900">{labelize(job.job_type)}</span>
                          <Badge variant={getStatusVariant(job.status)}>{labelize(job.status)}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-cream-700">
                          {job.progress?.phase_label ?? 'No phase details reported yet.'}
                        </p>
                      </div>
                      <div className="text-right text-xs text-cream-600">
                        {formatDate(job.completed_at ?? job.started_at ?? job.created_at, true)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
