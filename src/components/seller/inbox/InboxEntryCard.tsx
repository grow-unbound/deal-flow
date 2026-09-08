import { StatusPill } from '@/components/ui/status-pill';
import { InboxActionBar } from './InboxActionBar';
import { isPinnedEntry } from '@/lib/inbox/inbox-grouping';
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

  return (
    <div className="relative rounded-[16px] border border-cream-200 bg-white px-5 py-4">
      {isPinnedEntry(entry) ? (
        <span className="absolute right-4 top-4 h-2 w-2 rounded-full bg-ember-400" aria-label="Pinned — needs attention first" />
      ) : null}
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 text-left">
        <div>
          <p className="text-base font-medium text-cream-900">{entry.summary}</p>
          {agingTier ? <StatusPill label={agingTier} tone={AGING_TONE[agingTier] ?? 'neutral'} className="mt-2" /> : null}
        </div>
      </button>
      {expanded ? (
        <div className="mt-4 space-y-4 border-t border-cream-100 pt-4">
          {entry.metadata.last_reminder_at ? (
            <p className="text-sm leading-relaxed text-cream-600">
              Last reminder sent {new Date(String(entry.metadata.last_reminder_at)).toLocaleDateString()}.
            </p>
          ) : null}
          <InboxActionBar entry={entry} tenantId={tenantId} applyLocalAction={applyLocalAction} />
        </div>
      ) : null}
    </div>
  );
}
