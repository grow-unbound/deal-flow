'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Bell, ChevronDown, Loader2, Send, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useApplyGenericEntryAction, useSendCollectionReminder, type EntryHistoryEvent } from '@/hooks/useInboxEntries';
import { cn, formatDate } from '@/lib/utils';
import type { LocalEntryEvent } from '@/lib/inbox/inbox-local-actions';
import type { InboxDetailGroup } from '@/lib/inbox/inbox-detail-groups';
import { InboxInlineNote } from './InboxInlineNote';

interface InboxCollectionGroupCardProps {
  group: InboxDetailGroup;
  buyerId: string;
  historyEvents?: EntryHistoryEvent[];
  localEvents?: LocalEntryEvent[];
  expanded: boolean;
  onToggle: () => void;
}

const REMIND_OPTIONS = [
  { label: 'Tomorrow', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
];

export function InboxCollectionGroupCard({ group, buyerId, historyEvents, localEvents, expanded, onToggle }: InboxCollectionGroupCardProps) {
  const sendReminder = useSendCollectionReminder();
  const genericAction = useApplyGenericEntryAction();
  const [noteOpen, setNoteOpen] = useState(false);
  const summary = group.summary;
  const rowsByAging = group.rowsByAging ?? [];

  async function handleSendReminder() {
    if (!summary) return;
    try {
      await sendReminder.mutateAsync({ buyerId, entryIds: summary.entryIds });
      toast.success('Reminder sent');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send reminder');
    }
  }

  async function remindLater(days: number) {
    const remindAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    try {
      await Promise.all(group.entries.map((entry) => genericAction.mutateAsync({
        entryId: entry.id,
        action: 'remind_later',
        remind_at: remindAt,
      })));
      toast.success(`Snoozed until ${formatDate(remindAt)}`);
      document.getElementById('inbox-dues-group')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not set reminder');
    }
  }

  const invoiceCount = summary?.entryIds.length ?? 0;
  const invoiceLabel = `${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'}`;
  const title = summary ? `${summary.totalAmountLabel} upcoming dues or overdue` : 'Dues';
  const subtitle = summary
    ? invoiceCount > 0 && summary.overdueCount === invoiceCount
      ? `${invoiceLabel} overdue`
      : [invoiceLabel, summary.overdueCount > 0 ? `${summary.overdueCount} overdue` : null].filter(Boolean).join(' · ')
    : '';

  return (
    <section id="inbox-dues-group" className="relative overflow-hidden rounded-[14px] border border-cream-300 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className={cn('flex w-full items-start justify-between gap-4 px-6 py-5 text-left', expanded ? 'border-b border-cream-200' : undefined)}
      >
        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-[-0.015em] text-cream-950">{title}</h3>
          {subtitle ? <p className="mt-1 text-sm text-cream-600">{subtitle}</p> : null}
        </div>
        <ChevronDown
          size={16}
          className={cn('mt-1 shrink-0 text-cream-500 transition-transform duration-200', expanded && 'rotate-180')}
          aria-hidden
        />
      </button>

      {expanded ? (
        <div className="space-y-6 px-6 py-6">
          <div className="space-y-7">
            {rowsByAging.map((section) => (
              <div key={section.key} className="space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.06em] text-cream-800">
                    {section.label} <span className="font-medium text-cream-500">({section.count})</span>
                  </p>
                  <p className="font-mono text-base font-bold tabular-nums text-cream-950">{section.totalAmountLabel}</p>
                </div>
                <div className="divide-y divide-cream-200 rounded-[10px] border border-cream-200">
                  {section.rows.map((row) => (
                    <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-x-3 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7.5rem]">
                      <Link
                        href={`/invoices/${row.invoiceId}`}
                        className="min-w-0 truncate font-mono text-sm font-semibold text-cream-950 underline-offset-4 hover:underline"
                      >
                        {row.invoiceNumber}
                      </Link>
                      <p className="min-w-0 truncate text-sm text-cream-600 max-sm:col-start-1 max-sm:row-start-2">{row.dateLabel}</p>
                      <p className="text-right font-mono text-sm font-semibold tabular-nums text-cream-900 max-sm:col-start-2 max-sm:row-span-2 max-sm:row-start-1 max-sm:self-center">{row.amountLabel}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="sticky bottom-0 -mx-5 -mb-4 flex items-center justify-between gap-3 border-t border-cream-200 bg-white/95 px-5 py-3 backdrop-blur md:static md:m-0 md:border-t-0 md:bg-transparent md:p-0 md:backdrop-blur-0">
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                title="Add note"
                aria-label="Add note"
                onClick={() => setNoteOpen((open) => !open)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-cream-600 transition-colors hover:bg-cream-100 hover:text-cream-900 active:scale-[var(--yk-press-scale)]"
              >
                <StickyNote className="h-4 w-4" aria-hidden />
              </button>
              <div className="group/remind relative">
                <button
                  type="button"
                  title="Remind later"
                  aria-label="Remind later"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-cream-600 transition-colors hover:bg-cream-100 hover:text-cream-900 active:scale-[var(--yk-press-scale)]"
                >
                  <Bell className="h-4 w-4" aria-hidden />
                </button>
                <div className="invisible absolute bottom-full left-0 z-10 mb-2 flex min-w-36 flex-col rounded-[10px] border border-cream-200 bg-white p-1 opacity-0 shadow-lg transition group-hover/remind:visible group-hover/remind:opacity-100 group-focus-within/remind:visible group-focus-within/remind:opacity-100">
                  <p className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-cream-500">Remind later</p>
                  {REMIND_OPTIONS.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => void remindLater(option.days)}
                      className="rounded-[8px] px-3 py-2 text-left text-sm text-cream-800 hover:bg-cream-100"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <Button type="button" size="sm" onClick={handleSendReminder} disabled={sendReminder.isPending}>
              {sendReminder.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              Send reminder
            </Button>
          </div>

          {group.entries[0] ? (
            <InboxInlineNote
              entryIds={group.entries.map((entry) => entry.id)}
              primaryEntryId={group.entries[0].id}
              historyEvents={historyEvents}
              localEvents={localEvents}
              open={noteOpen}
              onOpenChange={setNoteOpen}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
