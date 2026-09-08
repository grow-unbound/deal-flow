import { ChevronDown } from 'lucide-react';
import { StatusPill } from '@/components/ui/status-pill';
import { cn } from '@/lib/utils';
import { InboxActionBar } from './InboxActionBar';
import { isPinnedEntry } from '@/lib/inbox/inbox-grouping';
import { ENTRY_TYPE_LABEL, buildEntryAmountLabel } from '@/lib/inbox/inbox-entry-copy';
import type { InboxEntry, InboxEntryStatus } from '@/lib/inbox/inbox-types';

const AGING_TONE: Record<string, 'neutral' | 'warning' | 'danger'> = {
  due_soon: 'neutral',
  '1-7d': 'warning',
  '8-15d': 'warning',
  '16-30d': 'danger',
  '30d+': 'danger',
};

interface InboxEntryCardProps {
  entry: InboxEntry;
  expanded: boolean;
  onToggle: () => void;
  tenantId: string;
  applyLocalAction: (
    entry: InboxEntry,
    action: string,
    opts?: { note?: string; nextStatus?: InboxEntryStatus; nextSummary?: string },
  ) => void;
}

export function InboxEntryCard({ entry, expanded, onToggle, tenantId, applyLocalAction }: InboxEntryCardProps) {
  const agingTier = typeof entry.metadata.aging_tier === 'string' ? entry.metadata.aging_tier : null;
  const amountLabel = buildEntryAmountLabel(entry);
  const title = ENTRY_TYPE_LABEL[entry.entry_type] ?? entry.entry_type;

  return (
    <section className="relative overflow-hidden rounded-[14px] border border-cream-300 bg-white">
      {isPinnedEntry(entry) ? (
        <span className="absolute right-4 top-4 h-2 w-2 rounded-full bg-ember-400" aria-label="Pinned — needs attention first" />
      ) : null}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex w-full items-start justify-between gap-4 px-5 py-4 text-left',
          expanded ? 'border-b border-cream-200' : undefined,
        )}
      >
        <div className="min-w-0">
          <h3 className="font-display text-md text-cream-900">{title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {amountLabel ? <p className="text-sm text-cream-600">{amountLabel}</p> : null}
            {agingTier ? <StatusPill label={agingTier} tone={AGING_TONE[agingTier] ?? 'neutral'} /> : null}
          </div>
        </div>
        <ChevronDown
          size={16}
          className={cn('mt-1 shrink-0 text-cream-500 transition-transform duration-200', expanded && 'rotate-180')}
          aria-hidden
        />
      </button>
      {expanded ? (
        <div className="space-y-4 px-5 py-4">
          {entry.metadata.last_reminder_at ? (
            <p className="text-sm leading-relaxed text-cream-600">
              Last reminder sent {new Date(String(entry.metadata.last_reminder_at)).toLocaleDateString()}.
            </p>
          ) : null}
          <InboxActionBar entry={entry} tenantId={tenantId} applyLocalAction={applyLocalAction} />
        </div>
      ) : null}
    </section>
  );
}
