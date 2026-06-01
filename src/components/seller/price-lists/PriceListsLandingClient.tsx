'use client';

import { useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

import { FeatureGate } from '@/components/FeatureGate';
import {
  EntityAvatar,
  FilterBar,
  InsightStrip4,
  LandingTable,
  PageHeader,
  PageWrap,
  StatusTag,
  V3CalloutPanel,
} from '@/components/seller/layout';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { usePriceListsLanding, type PriceListLandingRow, type PriceListsLandingResponse } from '@/hooks/usePriceLists';
import { formatDate } from '@/lib/utils';

const CreatePriceListForm = dynamic(
  () => import('@/components/seller/price-lists/CreatePriceListForm').then((m) => m.CreatePriceListForm),
  { ssr: false },
);

type LandingChip = 'All' | 'Active' | 'Draft' | 'Expired';
type SortOption = 'Recently updated' | 'Name (A-Z)' | 'Products (high → low)' | 'Validity (latest end date)';

const CHIPS: LandingChip[] = ['All', 'Active', 'Draft', 'Expired'];
const SORT_OPTIONS: SortOption[] = ['Recently updated', 'Name (A-Z)', 'Products (high → low)', 'Validity (latest end date)'];

function PriceListsLandingSkeleton() {
  return (
    <PageWrap>
      <div className="space-y-5">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-[40rem]" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-[14px]" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-[14px]" />
          ))}
        </div>
        <Skeleton className="h-14 rounded-[14px]" />
        <Skeleton className="h-[30rem] rounded-[14px]" />
      </div>
    </PageWrap>
  );
}

function titleCaseStatus(status: PriceListLandingRow['status']): 'Active' | 'Draft' | 'Expired' {
  if (status === 'active') return 'Active';
  if (status === 'draft') return 'Draft';
  return 'Expired';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function toStatusTone(status: PriceListLandingRow['status']): 'success' | 'warning' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'draft') return 'warning';
  return 'neutral';
}

function entityHue(index: number): 'teal' | 'ember' | 'cream' {
  if (index % 3 === 0) return 'teal';
  if (index % 3 === 1) return 'ember';
  return 'cream';
}

function PriceListsLandingContent({ initialData }: { initialData: PriceListsLandingResponse | null }) {
  const router = useRouter();
  const { data, isLoading, isError, refetch } = usePriceListsLanding(initialData);

  const [search, setSearch] = useState('');
  const [activeChip, setActiveChip] = useState<LandingChip>('All');
  const [sortBy, setSortBy] = useState<SortOption>('Recently updated');
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneSourceId, setCloneSourceId] = useState<string>('');

  const allRows = data?.price_lists ?? [];

  const cloneSource = useMemo(
    () => allRows.find((row) => row.id === cloneSourceId) ?? null,
    [allRows, cloneSourceId],
  );

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    const statusFiltered = allRows.filter((row) => {
      if (activeChip === 'All') return true;
      if (activeChip === 'Active') return row.status === 'active';
      if (activeChip === 'Draft') return row.status === 'draft';
      return row.status === 'expired';
    });

    const searched = statusFiltered.filter((row) => {
      if (!query) return true;
      const cohorts = row.cohort_names.join(' ').toLowerCase();
      return row.name.toLowerCase().includes(query) || cohorts.includes(query);
    });

    return searched.sort((a, b) => {
      if (sortBy === 'Name (A-Z)') return a.name.localeCompare(b.name);
      if (sortBy === 'Products (high → low)') return b.product_count - a.product_count;
      if (sortBy === 'Validity (latest end date)') {
        return new Date(b.valid_to ?? 0).getTime() - new Date(a.valid_to ?? 0).getTime();
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [activeChip, allRows, search, sortBy]);

  if (isLoading) return <PriceListsLandingSkeleton />;

  if (isError) {
    return (
      <PageWrap>
        <ErrorState
          heading="Couldn't load price lists"
          description="There was a problem fetching your price lists. Please try again."
          onRetry={() => refetch()}
        />
      </PageWrap>
    );
  }

  return (
    <>
      <PageWrap>
        <PageHeader
          eyebrow="Pricing"
          title="Price Lists"
          subtitle="Custom pricing per cohort. Each list sets prices on a window — once it lapses, buyers fall back to base. Keep them fresh."
          horizon="This month"
          secondary={{ label: 'Clone a list', icon: <Copy size={13} />, onClick: () => setCloneDialogOpen(true) }}
          primary="New price list"
          onPrimaryClick={() => setNewDialogOpen(true)}
        />

        <InsightStrip4
          tiles={[
            {
              label: 'Active lists',
              value: `${data?.kpis.active_lists ?? 0}`,
              sub: `${data?.kpis.draft_lists ?? 0} in draft`,
            },
            {
              label: 'Cohorts covered',
              value: `${data?.kpis.cohorts_covered ?? 0}`,
              sub: `of ${data?.kpis.cohorts_total ?? 0} cohorts`,
            },
            {
              label: 'Expiring soon',
              value: `${data?.kpis.expiring_soon ?? 0}`,
              sub: 'renew before they lapse',
              tone: 'warn',
            },
            {
              label: 'Products with overrides',
              value: `${data?.kpis.products_with_overrides ?? 0}`,
              sub: 'custom priced SKUs',
            },
          ]}
        />

        <V3CalloutPanel
          items={[
            {
              kind: 'risk',
              eyebrow: 'Expiring soon',
              hint: `${data?.todays_read.expiring_soon.length ?? 0}`,
              rows: (data?.todays_read.expiring_soon ?? []).map((row, index) => ({
                initials: row.initials,
                hue: entityHue(index),
                name: row.name,
                reason: `Expires ${row.valid_until_label} · ${row.cohorts_count} cohort(s)`,
                trailing: <StatusTag label={titleCaseStatus(row.status)} tone={toStatusTone(row.status)} />,
              })),
            },
            {
              kind: 'info',
              eyebrow: 'Most coverage',
              hint: 'by products',
              rows: (data?.todays_read.most_coverage ?? []).map((row, index) => ({
                initials: row.initials,
                hue: entityHue(index),
                name: row.name,
                reason: `${row.product_count} products · valid until ${row.valid_until_label}`,
                trailing: row.product_count,
              })),
            },
            {
              kind: 'opportunity',
              eyebrow: 'Uncovered cohorts',
              hint: 'no active list',
              rows: (data?.todays_read.uncovered_cohorts ?? []).map((row, index) => ({
                initials: row.initials,
                hue: entityHue(index),
                name: row.name,
                reason: `${row.member_count} buyers · falling back to base price`,
                trailing: row.member_count,
              })),
            },
          ]}
        />

        <FilterBar
          count={`${filteredRows.length} price lists`}
          searchPlaceholder="Search price list or cohort…"
          chips={CHIPS}
          activeChip={activeChip}
          sortBy={sortBy}
          hideViewToggle
          searchValue={search}
          onSearchChange={setSearch}
          onChipChange={(chip) => setActiveChip(chip as LandingChip)}
          sortOptions={SORT_OPTIONS}
          onSortChange={(option) => setSortBy(option as SortOption)}
        />

        <LandingTable
          columns={[
            { label: 'Price list', width: 280, className: 'px-5' },
            { label: 'Cohort(s)', className: 'px-5' },
            { label: 'Products', className: 'px-5' },
            { label: 'Validity', className: 'px-5' },
            { label: 'Avg discount', className: 'px-5' },
            { label: 'Status', className: 'px-5' },
            { width: 40, className: 'px-4' },
          ]}
        >
          {filteredRows.map((row, index) => {
            const validity = `${formatDate(row.valid_from ?? row.created_at)} → ${row.valid_to ? formatDate(row.valid_to) : 'Open'}`;
            const cohortText = row.cohort_names.length <= 1
              ? row.cohort_names[0] ?? 'Unassigned'
              : `${row.cohort_names[0]} +${row.cohort_names.length - 1} more`;
            const isExpired = row.status === 'expired';

            return (
              <tr
                key={row.id}
                className="cursor-pointer border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
                onClick={() => router.push(`/price-lists/${row.id}`)}
              >
                <td className="px-5 py-3.5 text-[13px] text-cream-900">
                  <div className="ent flex items-center gap-3">
                    <EntityAvatar initials={getInitials(row.name)} hue="teal" size={38} />
                    <div className="min-w-0">
                      <p className="ent-name truncate text-[13.5px] font-medium text-cream-900">{row.name}</p>
                      <p className="ent-sub mt-0.5 text-[11px] uppercase tracking-[0.05em] text-cream-500">
                        Created by {row.created_by_label} · {row.product_count} SKUs
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-[12.5px] text-cream-800">
                  {cohortText}
                </td>
                <td className="px-5 py-3.5 font-mono text-[13px] font-semibold text-cream-900 tabular-nums">
                  {row.product_count}
                </td>
                <td className={`px-5 py-3.5 font-mono text-[12px] ${isExpired ? 'text-cream-500 line-through' : 'text-cream-900'}`}>
                  {validity}
                </td>
                <td className="px-5 py-3.5">
                  {row.avg_discount_pct != null ? (
                    <span className="font-mono text-[13px] font-semibold text-teal-700">-{row.avg_discount_pct}%</span>
                  ) : (
                    <span className="text-cream-400">—</span>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <StatusTag label={titleCaseStatus(row.status)} tone={toStatusTone(row.status)} />
                </td>
                <td className="chev px-4 py-3.5 pr-4 text-right text-[16px] text-cream-500">›</td>
              </tr>
            );
          })}
        </LandingTable>
      </PageWrap>

      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New price list</DialogTitle>
            <DialogDescription>Create a new pricing window for cohorts and buyers.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <CreatePriceListForm onSuccess={() => setNewDialogOpen(false)} onCancel={() => setNewDialogOpen(false)} />
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clone a list</DialogTitle>
            <DialogDescription>Select a source list to prefill a new one.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {!cloneSource ? (
              <div className="space-y-2">
                <p className="text-[12px] text-cream-700">Choose source list</p>
                <div className="max-h-[280px] space-y-2 overflow-y-auto">
                  {allRows.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className="w-full rounded-[10px] border border-cream-300 bg-white px-3 py-2 text-left hover:bg-cream-50"
                      onClick={() => setCloneSourceId(row.id)}
                    >
                      <p className="text-[13px] font-medium text-cream-900">{row.name}</p>
                      <p className="mt-0.5 text-[11px] text-cream-600">{row.product_count} products · {row.cohorts_count} cohorts</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  className="text-[12px] text-teal-700 underline"
                  onClick={() => setCloneSourceId('')}
                >
                  Change source
                </button>
                <CreatePriceListForm
                  onSuccess={() => {
                    setCloneDialogOpen(false);
                    setCloneSourceId('');
                  }}
                  onCancel={() => {
                    setCloneDialogOpen(false);
                    setCloneSourceId('');
                  }}
                  initialValues={{
                    name: `${cloneSource.name} (Copy)`,
                    currency: cloneSource.currency,
                    valid_from: cloneSource.valid_from ? new Date(cloneSource.valid_from) : new Date(),
                    valid_to: cloneSource.valid_to ? new Date(cloneSource.valid_to) : undefined,
                    priority: cloneSource.priority,
                  }}
                  submitLabel="Create cloned list"
                />
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PriceListsLandingClient({ initialData }: { initialData: PriceListsLandingResponse | null }) {
  return (
    <FeatureGate flag="PRICING_ENGINE">
      <PriceListsLandingContent initialData={initialData} />
    </FeatureGate>
  );
}
