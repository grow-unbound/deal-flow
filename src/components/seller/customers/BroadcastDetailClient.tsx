'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, MessageCircle, RefreshCw } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { FilterBar, InsightStrip4, LandingTable, PageWrap } from '@/components/seller/layout';
import { LandingTableRowsSkeleton } from '@/components/seller/layout/LandingTableRowsSkeleton';
import { Switch } from '@/components/ui/switch';
import { useRole } from '@/hooks/useRole';
import {
  useBroadcastMessages,
  useRetargetBroadcast,
  type BroadcastMessageRow,
  type BroadcastMessageStatusBucket,
} from '@/hooks/useWhatsAppBroadcasts';
import { formatDate, formatNumberValue } from '@/lib/utils';

const CHIP_LABELS = ['All', 'Notified', 'Not notified', 'Failed', 'Opted out'] as const;
type ChipLabel = (typeof CHIP_LABELS)[number];

const CHIP_TO_BUCKET: Record<ChipLabel, BroadcastMessageStatusBucket> = {
  All: 'all',
  Notified: 'notified',
  'Not notified': 'not_notified',
  Failed: 'failed',
  'Opted out': 'opted_out',
};

function statusBadgeLabel(status: string): string {
  switch (status) {
    case 'sent': return 'Sent';
    case 'delivered': return 'Delivered';
    case 'read': return 'Read';
    case 'queued': return 'Not notified yet';
    case 'failed': return 'Failed';
    case 'blocked_by_recipient': return 'Blocked';
    case 'opted_out': return 'Opted out';
    default: return status;
  }
}

function formatRecipientTimestamp(row: BroadcastMessageRow): string {
  const at = row.read_at ?? row.delivered_at ?? row.sent_at;
  return at ? formatDate(at) : '—';
}

export function BroadcastDetailClient({ broadcastId }: { broadcastId: string }) {
  const { isSellerAssistant } = useRole();
  const [activeChip, setActiveChip] = useState<ChipLabel>('All');
  const [retargetOpen, setRetargetOpen] = useState(false);
  const [includeFailed, setIncludeFailed] = useState(false);

  const bucket = CHIP_TO_BUCKET[activeChip];
  const { data, isLoading, isError } = useBroadcastMessages(broadcastId, bucket);
  const retarget = useRetargetBroadcast(broadcastId);

  const counts = data?.bucket_counts;
  const notNotifiedCount = counts?.not_notified ?? 0;
  const failedCount = counts?.failed ?? 0;

  const chips = useMemo(() => [...CHIP_LABELS], []);

  const tiles = useMemo(() => [
    { label: 'Total recipients', value: formatNumberValue(counts?.all ?? 0, 'COUNT') },
    { label: 'Notified', value: formatNumberValue(counts?.notified ?? 0, 'COUNT') },
    { label: 'Not notified yet', value: formatNumberValue(notNotifiedCount, 'COUNT') },
    { label: 'Failed / opted out', value: formatNumberValue(failedCount + (counts?.opted_out ?? 0), 'COUNT') },
  ], [counts, failedCount, notNotifiedCount]);

  const messages = data?.messages ?? [];

  if (isError) {
    return (
      <PageWrap className="pt-7">
        <ErrorState
          heading="Couldn't load this broadcast"
          description="There was a problem fetching recipient status. Please try again."
        />
      </PageWrap>
    );
  }

  return (
    <PageWrap className="pt-7">
      <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <nav className="mb-4 flex items-center gap-1.5 text-sm text-cream-600">
            <Link href="/customers" className="hover:text-cream-900">Customers</Link>
            <span className="text-cream-400">›</span>
            <Link href="/customers/broadcasts" className="hover:text-cream-900">Manage Broadcasts</Link>
            <span className="text-cream-400">›</span>
            <span className="font-medium text-cream-900">{data?.broadcast_name ?? 'Broadcast'}</span>
          </nav>
          <h1 className="font-display text-lg md:text-xl font-extrabold tracking-[-0.025em] text-cream-950">
            {data?.broadcast_name ?? 'Broadcast'}
          </h1>
          <p className="mt-[10px] max-w-[64ch] text-md leading-[1.55] text-cream-700">
            See who was notified and quickly re-target anyone still waiting.
          </p>
        </div>
        <Button
          type="button"
          className="shrink-0 sm:self-end"
          onClick={() => setRetargetOpen(true)}
          disabled={isSellerAssistant || notNotifiedCount === 0}
          title={
            isSellerAssistant
              ? 'Only admins can send broadcasts'
              : notNotifiedCount === 0
                ? 'Everyone has already been notified'
                : undefined
          }
        >
          <RefreshCw size={16} className="mr-2" />
          Re-target not notified
        </Button>
      </header>

      <InsightStrip4 className="mt-6" tiles={tiles} />

      <FilterBar
        count={`Showing ${messages.length} of ${counts?.[bucket] ?? messages.length}`}
        searchPlaceholder="Search not available on this view"
        chips={chips}
        activeChip={activeChip}
        sortBy=""
        hideViewToggle
        onChipChange={(chip) => setActiveChip(chip as ChipLabel)}
      />

      {isLoading ? (
        <LandingTableRowsSkeleton columns={4} tableMinWidth={900} />
      ) : (
        <LandingTable
          showEmptyState={messages.length === 0}
          emptyState={
            <EmptyState
              icon={<MessageCircle size={28} strokeWidth={1.5} />}
              heading="No recipients in this view"
              description="Try a different status filter."
            />
          }
          columns={[
            { label: 'Buyer', minWidth: 220, className: 'px-5' },
            { label: 'Phone', minWidth: 160, className: 'px-5' },
            { label: 'Status', minWidth: 160, className: 'px-5' },
            { label: 'Last update', minWidth: 160, className: 'px-5' },
          ]}
          tableMinWidth={900}
        >
          {messages.map((row) => (
            <tr key={row.id} className="border-b border-cream-300 bg-white">
              <td className="px-3 py-3 text-sm font-medium text-cream-900">{row.buyer_name ?? '—'}</td>
              <td className="px-3 py-3 text-sm text-cream-800">{row.recipient_phone}</td>
              <td className="px-3 py-3 text-sm text-cream-800">
                {statusBadgeLabel(row.status)}
                {row.status === 'failed' && row.failure_reason ? (
                  <span className="ml-1.5 text-xs text-cream-500">({row.failure_reason})</span>
                ) : null}
              </td>
              <td className="px-3 py-3 text-sm text-cream-800">{formatRecipientTimestamp(row)}</td>
            </tr>
          ))}
        </LandingTable>
      )}

      <AlertDialog open={retargetOpen} onOpenChange={setRetargetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-target not-notified buyers?</AlertDialogTitle>
            <AlertDialogDescription>
              This creates a new broadcast to the {notNotifiedCount} buyer{notNotifiedCount === 1 ? '' : 's'} still
              waiting to be notified from this broadcast{failedCount > 0 ? `, plus optionally the ${failedCount} that failed` : ''}.
              Opted-out buyers are never included.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {failedCount > 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-[10px] border border-cream-300 bg-cream-50 px-3.5 py-3">
              <div>
                <p className="text-sm font-medium text-cream-900">Also include failed sends</p>
                <p className="text-xs text-cream-600">{failedCount} buyer{failedCount === 1 ? '' : 's'} had a real delivery failure</p>
              </div>
              <Switch checked={includeFailed} onCheckedChange={setIncludeFailed} />
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                retarget.mutate(includeFailed, { onSuccess: () => setRetargetOpen(false) });
              }}
              disabled={retarget.isPending}
            >
              <CheckCircle2 size={14} className="mr-1.5" />
              {retarget.isPending ? 'Creating…' : 'Create follow-up broadcast'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageWrap>
  );
}
