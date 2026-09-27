'use client';

import { useCallback, useState } from 'react';
import type { InboxEntry, InboxEntryStatus } from './inbox-types';

export interface LocalEntryEvent {
  id: string;
  entry_id: string;
  entry_type: string;
  action: string;
  from_status: string;
  to_status: string;
  note: string | null;
  created_at: string;
  synced: false;
}

export interface LocalEntryOverride {
  status?: InboxEntryStatus;
  summary?: string;
  allowed_actions?: string[];
}

let localEventCounter = 0;

export function useLocalEntryActions() {
  const [overrides, setOverrides] = useState<Record<string, LocalEntryOverride>>({});
  const [localEvents, setLocalEvents] = useState<LocalEntryEvent[]>([]);

  const applyLocalAction = useCallback(
    (
      entry: InboxEntry,
      action: string,
      opts?: { note?: string; nextStatus?: InboxEntryStatus; nextSummary?: string; nextAllowedActions?: string[] },
    ) => {
      const toStatus = opts?.nextStatus ?? entry.status;
      setOverrides((prev) => ({
        ...prev,
        [entry.id]: {
          status: toStatus,
          summary: opts?.nextSummary ?? prev[entry.id]?.summary,
          allowed_actions: opts?.nextAllowedActions ?? prev[entry.id]?.allowed_actions,
        },
      }));
      localEventCounter += 1;
      const event: LocalEntryEvent = {
        id: `local-${localEventCounter}`,
        entry_id: entry.id,
        entry_type: entry.entry_type,
        action,
        from_status: entry.status,
        to_status: toStatus,
        note: opts?.note ?? null,
        created_at: new Date().toISOString(),
        synced: false,
      };
      setLocalEvents((prev) => [...prev, event]);
    },
    [],
  );

  const getLocalEventsForEntry = useCallback(
    (entryId: string) => localEvents.filter((e) => e.entry_id === entryId),
    [localEvents],
  );

  return { overrides, localEvents, applyLocalAction, getLocalEventsForEntry };
}
