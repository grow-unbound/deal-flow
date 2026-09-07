'use client';

import { useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useEntryHistory, type EntryHistoryEvent } from '@/hooks/useInboxEntries';
import type { LocalEntryEvent } from '@/lib/inbox/inbox-local-actions';
import { ACTION_LABELS } from './InboxActionBar';

interface InboxHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyerId: string;
  buyerName: string;
  localEvents: LocalEntryEvent[];
}

type MergedEvent = (EntryHistoryEvent & { synced: true }) | LocalEntryEvent;

export function InboxHistorySheet({ open, onOpenChange, buyerId, buyerName, localEvents }: InboxHistorySheetProps) {
  const { data, isLoading } = useEntryHistory(open ? buyerId : null);

  const merged = useMemo<MergedEvent[]>(() => {
    const real: MergedEvent[] = (data?.events ?? []).map((e) => ({ ...e, synced: true as const }));
    const relevantLocal = localEvents.filter((e) => real.every((r) => r.entry_id !== e.entry_id || r.action !== e.action));
    return [...real, ...relevantLocal].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [data?.events, localEvents]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="max-w-md">
        <SheetHeader className="border-b border-cream-200 px-6 py-5">
          <SheetTitle>{buyerName}</SheetTitle>
          <p className="text-sm text-cream-500">Activity across every item for this customer</p>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <p className="text-sm text-cream-500">Loading…</p>
          ) : merged.length === 0 ? (
            <p className="text-sm text-cream-500">No activity yet.</p>
          ) : (
            <ol className="space-y-4">
              {merged.map((event) => (
                <li key={event.id} className="border-l-2 border-cream-200 pl-4">
                  <p className="text-sm font-medium text-cream-800">
                    {ACTION_LABELS[event.action] ?? event.action}
                    {!event.synced ? <span className="ml-2 text-xs font-normal text-warning-700">not yet synced</span> : null}
                  </p>
                  {event.note ? <p className="mt-0.5 text-sm text-cream-600">{event.note}</p> : null}
                  <p className="mt-0.5 text-xs text-cream-400">{new Date(event.created_at).toLocaleString()}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
