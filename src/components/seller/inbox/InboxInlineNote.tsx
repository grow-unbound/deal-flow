'use client';

import { useMemo, useState } from 'react';
import { Loader2, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useApplyGenericEntryAction, type EntryHistoryEvent } from '@/hooks/useInboxEntries';
import type { LocalEntryEvent } from '@/lib/inbox/inbox-local-actions';

type NoteEvent = (EntryHistoryEvent & { synced?: true }) | LocalEntryEvent;

interface InboxInlineNoteProps {
  entryIds: string[];
  primaryEntryId: string;
  localEvents?: LocalEntryEvent[];
  historyEvents?: EntryHistoryEvent[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function noteEventsForEntries(
  entryIds: string[],
  historyEvents: EntryHistoryEvent[] = [],
  localEvents: LocalEntryEvent[] = [],
): NoteEvent[] {
  const allowed = new Set(entryIds);
  const real = historyEvents
    .filter((event) => allowed.has(event.entry_id) && event.action === 'add_note' && event.note)
    .map((event) => ({ ...event, synced: true as const }));
  const local = localEvents.filter((event) => allowed.has(event.entry_id) && event.action === 'add_note' && event.note);
  return [...real, ...local].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function InboxInlineNote({
  entryIds,
  primaryEntryId,
  localEvents = [],
  historyEvents = [],
  open,
  onOpenChange,
}: InboxInlineNoteProps) {
  const [note, setNote] = useState('');
  const action = useApplyGenericEntryAction();
  const previousNotes = useMemo(
    () => noteEventsForEntries(entryIds, historyEvents, localEvents).slice(0, 3),
    [entryIds, historyEvents, localEvents],
  );
  const canSubmit = note.trim().length > 0;

  async function submit() {
    if (!canSubmit) return;
    try {
      await action.mutateAsync({ entryId: primaryEntryId, action: 'add_note', note: note.trim() });
      toast.success('Note added');
      setNote('');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add note');
    }
  }

  if (!open && previousNotes.length === 0) return null;

  return (
    <div className="rounded-[12px] border border-cream-200 bg-cream-50 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-cream-800">
        <StickyNote className="h-4 w-4 text-cream-500" aria-hidden />
        Notes
      </div>
      {previousNotes.length > 0 ? (
        <div className="mt-2 space-y-2">
          {previousNotes.map((event) => (
            <div key={event.id} className="rounded-[10px] bg-white px-3 py-2 text-sm text-cream-700">
              <p>{event.note}</p>
              <p className="mt-1 text-xs text-cream-400">
                {new Date(event.created_at).toLocaleString('en-IN')}
                {'synced' in event && event.synced === false ? ' · not yet synced' : ''}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {open ? (
        <div className="mt-3 space-y-2">
          <Textarea
            label="Add note"
            placeholder="Type a short note for this item"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={2000}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => { setNote(''); onOpenChange(false); }}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={submit} disabled={!canSubmit || action.isPending}>
              {action.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Add note
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
