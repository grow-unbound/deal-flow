'use client';

import { useEffect, useRef, useState } from 'react';

import type { IntegrationSyncJob } from '@/hooks/useIntegrationsSettings';
import { formatIntegrationJobError } from '@/lib/integrations/job-error-log';
import { cn } from '@/lib/utils';

type LogEntryType = 'start' | 'snapshot' | 'error' | 'complete';

interface LogEntry {
  id: string;
  at: string;
  type: LogEntryType;
  title: string;
  detail?: string | null;
}

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return new Intl.DateTimeFormat('en-IN', { timeStyle: 'medium' }).format(date);
}

function labelize(value: string) {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildSnapshot(activeJob: IntegrationSyncJob) {
  const progress = activeJob.progress;
  const countParts =
    progress?.counts && Object.keys(progress.counts).length > 0
      ? Object.entries(progress.counts)
          .slice(0, 3)
          .map(([key, stat]) => `${labelize(key)} ${stat.processed}`)
      : [];

  const detailParts = [
    progress?.phase_label ?? null,
    progress?.note && progress.note !== progress?.phase_label ? progress.note : null,
    progress?.items_total != null
      ? `${progress.items_processed ?? 0} / ${progress.items_total} items`
      : countParts.length > 0
        ? countParts.join(' · ')
        : null,
    progress?.pages_processed != null ? `${progress.pages_processed} pages` : null,
    progress?.items_failed != null ? `${progress.items_failed} failed` : null,
  ].filter(Boolean);

  return {
    title:
      progress?.phase_label ??
      progress?.note ??
      (activeJob.status === 'completed'
        ? 'Sync completed'
        : activeJob.status === 'failed'
          ? 'Sync failed'
          : activeJob.status === 'queued'
            ? 'Queued for sync'
            : 'Sync running'),
    detail: detailParts.join(' · '),
  };
}

export function IntegrationJobLiveLog({
  activeJob,
  onJobUpdate,
}: {
  activeJob: IntegrationSyncJob;
  onJobUpdate?: () => void;
}) {
  const [log, setLog] = useState<LogEntry[]>([]);
  const lastJobIdRef = useRef<string | null>(null);
  const lastSignatureRef = useRef<string | null>(null);
  const seenErrorsRef = useRef(new Set<string>());

  // integration_sync_jobs realtime was decommissioned (Realtime consolidated onto a
  // single app.realtime_notifications table this backend-only job table was never
  // part of) — poll instead while this job is active. Same user-visible "live-ish"
  // progress, no realtime dependency.
  useEffect(() => {
    const tenantIntegrationId = (activeJob as { tenant_integration_id?: string }).tenant_integration_id;
    if (!tenantIntegrationId) return;
    if (activeJob.status === 'completed' || activeJob.status === 'failed') return;

    const interval = setInterval(() => {
      onJobUpdate?.();
    }, 4000);

    return () => clearInterval(interval);
  }, [(activeJob as { tenant_integration_id?: string }).tenant_integration_id, activeJob.status, onJobUpdate]);

  useEffect(() => {
    const signature = [
      activeJob.id,
      activeJob.status,
      activeJob.progress?.phase ?? '',
      activeJob.progress?.phase_label ?? '',
      activeJob.progress?.note ?? '',
      activeJob.progress?.items_processed ?? '',
      activeJob.progress?.items_failed ?? '',
      activeJob.progress?.pages_processed ?? '',
      activeJob.progress?.phase_current ?? '',
      activeJob.progress?.items_total ?? '',
      activeJob.progress?.phases_total ?? '',
      activeJob.progress?.updated_at ?? '',
      activeJob.summary?.last_synced_at ?? '',
      JSON.stringify(activeJob.progress?.counts ?? {}),
    ].join('|');

    if (activeJob.id !== lastJobIdRef.current) {
      lastJobIdRef.current = activeJob.id;
      lastSignatureRef.current = signature;
      seenErrorsRef.current = new Set();
      const snapshot = buildSnapshot(activeJob);
      setLog([
        {
          id: `start-${activeJob.id}`,
          at: activeJob.created_at,
          type: 'start',
          title: `${labelize(activeJob.job_type)} started`,
          detail: snapshot.detail,
        },
      ]);
      return;
    }

    if (signature === lastSignatureRef.current) {
      return;
    }

    lastSignatureRef.current = signature;
    const now = new Date().toISOString();
    const snapshot = buildSnapshot(activeJob);
    const nextEntries: LogEntry[] = [
      {
        id: `snapshot-${signature}`,
        at: activeJob.progress?.updated_at ?? activeJob.summary?.last_synced_at ?? now,
        type: activeJob.status === 'completed' ? 'complete' : 'snapshot',
        title: snapshot.title,
        detail: snapshot.detail,
      },
    ];

    for (const err of activeJob.error_log ?? []) {
      const key = `${err.timestamp ?? ''}:${err.entity_type ?? ''}:${err.external_id ?? ''}:${err.error ?? ''}`;
      if (seenErrorsRef.current.has(key)) continue;
      seenErrorsRef.current.add(key);
      nextEntries.push({
        id: `err-${key}`,
        at: err.timestamp ?? now,
        type: 'error',
        title: 'Error captured',
        detail: formatIntegrationJobError(err),
      });
    }

    setLog((prev) => [...prev, ...nextEntries].slice(-24));
  }, [
    activeJob.id,
    activeJob.job_type,
    activeJob.status,
    activeJob.created_at,
    activeJob.progress?.phase,
    activeJob.progress?.phase_label,
    activeJob.progress?.note,
    activeJob.progress?.items_processed,
    activeJob.progress?.items_failed,
    activeJob.progress?.items_total,
    activeJob.progress?.pages_processed,
    activeJob.progress?.phase_current,
    activeJob.progress?.phases_total,
    activeJob.progress?.updated_at,
    activeJob.summary?.last_synced_at,
    activeJob.progress?.counts,
    activeJob.error_log,
  ]);

  const latestEntry = log[log.length - 1] ?? null;

  return (
    <details className="overflow-hidden rounded-2xl border border-cream-200 bg-white">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-cream-900">Live sync log</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-info-50 px-2 py-0.5 text-xs font-medium text-info-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-info-500" />
              Live updates
            </span>
          </div>
          <p className="mt-1 text-sm text-cream-700">
            {latestEntry?.detail ?? activeJob.progress?.phase_label ?? 'Waiting for first update…'}
          </p>
        </div>
        <div className="shrink-0 text-right text-xs text-cream-600">
          <div>{labelize(activeJob.status)}</div>
          <div>{formatTime(latestEntry?.at ?? activeJob.created_at)}</div>
        </div>
      </summary>

      <div className="border-t border-cream-200 bg-cream-50 px-4 py-4">
        {log.length === 0 ? (
          <div className="rounded-xl border border-dashed border-cream-300 bg-white px-4 py-5 text-sm text-cream-700">
            Waiting for the first event...
          </div>
        ) : (
          <div className="space-y-3">
            {log.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-cream-200 bg-white px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex h-2 w-2 rounded-full',
                          entry.type === 'error'
                            ? 'bg-danger-500'
                            : entry.type === 'complete'
                              ? 'bg-success-500'
                              : 'bg-teal-500',
                        )}
                      />
                      <span className="text-sm font-semibold text-cream-900">{entry.title}</span>
                    </div>
                    {entry.detail ? <p className="mt-1 text-sm leading-6 text-cream-700">{entry.detail}</p> : null}
                  </div>
                  <span className="shrink-0 text-xs text-cream-500">{formatTime(entry.at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
