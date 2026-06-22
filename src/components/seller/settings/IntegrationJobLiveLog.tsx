'use client';

import { useEffect, useRef, useState } from 'react';
import type { IntegrationSyncJob } from '@/hooks/useIntegrationsSettings';

type LogEntryType = 'start' | 'phase' | 'error' | 'complete';

interface LogEntry {
  id: string;
  at: string;
  type: LogEntryType;
  message: string;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return new Intl.DateTimeFormat('en-IN', { timeStyle: 'medium' }).format(d);
}

export function IntegrationJobLiveLog({ activeJob }: { activeJob: IntegrationSyncJob }) {
  const [log, setLog] = useState<LogEntry[]>([]);
  const lastPhaseRef = useRef<string | null>(null);
  const seenErrorsRef = useRef(new Set<string>());
  const lastJobIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset when a new job starts
    if (activeJob.id !== lastJobIdRef.current) {
      lastJobIdRef.current = activeJob.id;
      lastPhaseRef.current = null;
      seenErrorsRef.current = new Set();
      setLog([
        {
          id: `start-${activeJob.id}`,
          at: activeJob.created_at,
          type: 'start',
          message: `Job queued · ${activeJob.job_type.replace(/_/g, ' ')}`,
        },
      ]);
      return;
    }

    const newEntries: LogEntry[] = [];

    const label = activeJob.progress?.phase_label;
    if (label && label !== lastPhaseRef.current) {
      lastPhaseRef.current = label;
      newEntries.push({
        id: `phase-${label}-${activeJob.progress?.phase_current ?? 0}`,
        at: new Date().toISOString(),
        type: activeJob.status === 'completed' ? 'complete' : 'phase',
        message: label,
      });
    }

    for (const err of activeJob.error_log ?? []) {
      const key = `${err.external_id ?? ''}:${err.error ?? ''}`;
      if (!seenErrorsRef.current.has(key)) {
        seenErrorsRef.current.add(key);
        newEntries.push({
          id: `err-${key}`,
          at: err.timestamp ?? new Date().toISOString(),
          type: 'error',
          message: [
            err.entity_type ? `[${err.entity_type}]` : null,
            err.external_id ? `${err.external_id}:` : null,
            err.error ?? 'Unknown error',
          ]
            .filter(Boolean)
            .join(' '),
        });
      }
    }

    if (newEntries.length > 0) {
      setLog((prev) => [...prev, ...newEntries].slice(-100));
    }
  }, [
    activeJob.id,
    activeJob.job_type,
    activeJob.created_at,
    activeJob.status,
    activeJob.progress?.phase_label,
    activeJob.progress?.phase_current,
    activeJob.error_log,
  ]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [log]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Live activity</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-info-50 px-2 py-0.5 text-xs font-medium text-info-700">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-info-500" />
          Polling
        </span>
      </div>
      <div
        ref={scrollRef}
        className="h-40 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-xs leading-6"
      >
        {log.length === 0 ? (
          <span className="text-slate-500">Waiting for first event…</span>
        ) : (
          log.map((entry) => (
            <div key={entry.id} className="flex gap-2">
              <span className="shrink-0 select-none text-slate-500">[{formatTime(entry.at)}]</span>
              <span
                className={
                  entry.type === 'error'
                    ? 'text-red-400'
                    : entry.type === 'complete'
                      ? 'text-emerald-400'
                      : entry.type === 'start'
                        ? 'text-teal-400'
                        : 'text-slate-200'
                }
              >
                {entry.type === 'error' ? '✗ ' : entry.type === 'complete' ? '✓ ' : '  '}
                {entry.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
