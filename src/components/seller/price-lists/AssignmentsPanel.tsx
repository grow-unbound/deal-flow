'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Globe, Loader2, User, Users, X } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { MutationButton } from '@/components/ui/mutation-button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { LandingTable, LANDING_TABLE_CELL_CLASS } from '@/components/seller/layout/LandingTable';
import { useDebounce } from '@/hooks/useDebounce';
import { apiFetch } from '@/lib/api-fetch';
import { useCohortComposerBuyers, type CohortComposerBuyer } from '@/hooks/useCohorts';
import { BuyerRowContent } from '@/components/seller/shared/BuyerPickerRow';
import {
  usePriceListAssignments,
  useAddAssignment,
  useDeleteAssignment,
  type PriceListAssignment,
} from '@/hooks/usePriceLists';

interface AssignmentsPanelProps {
  priceListId: string;
}

type TargetType = 'cohort' | 'buyer' | 'all_buyers';

type Buyer = CohortComposerBuyer;

interface Cohort {
  id: string;
  name: string;
}

const BUYER_SEARCH_LIMIT = 8;

function useCohorts() {
  return useQuery({
    queryKey: ['cohorts-list'],
    queryFn: async (): Promise<{ cohorts: Cohort[] }> => {
      const res = await apiFetch('/api/cohorts');
      if (!res.ok) {
        // cohorts API may not be implemented yet — return empty gracefully
        return { cohorts: [] };
      }
      return res.json();
    },
    retry: false,
  });
}

const TARGET_TYPE_LABELS: Record<TargetType, string> = {
  cohort: 'Customer group',
  buyer: 'Buyer',
  all_buyers: 'Default pricelist',
};

function AssignmentIcon({ type }: { type: TargetType }) {
  if (type === 'cohort') return <Users size={14} />;
  if (type === 'buyer') return <User size={14} />;
  return <Globe size={14} />;
}

function assignmentName(assignment: PriceListAssignment): string {
  if (assignment.target_type === 'all_buyers') return 'All buyers without a specific pricelist';
  if (assignment.label) return assignment.label;
  if (assignment.target_id) return assignment.target_id.slice(0, 8);
  return 'Unassigned target';
}

function assignmentCoverage(assignment: PriceListAssignment): string {
  if (assignment.target_type === 'all_buyers') return 'All buyers';
  if (assignment.members != null) return `${assignment.members} ${assignment.members === 1 ? 'buyer' : 'buyers'}`;
  if (assignment.target_type === 'buyer') return '1 buyer';
  return 'Customer group';
}

function formatAssignedDate(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function AssignmentsPanel({ priceListId }: AssignmentsPanelProps) {
  const [targetType, setTargetType] = useState<TargetType>('cohort');
  const [targetId, setTargetId] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [buyerPickerOpen, setBuyerPickerOpen] = useState(false);
  const [buyerSearch, setBuyerSearch] = useState('');
  const [buyerCache, setBuyerCache] = useState<Record<string, Buyer>>({});
  const debouncedBuyerSearch = useDebounce(buyerSearch, 300);

  const { data: assignmentsData, isLoading: assignmentsLoading } =
    usePriceListAssignments(priceListId);
  const buyersQuery = useCohortComposerBuyers({
    query: debouncedBuyerSearch,
    limit: BUYER_SEARCH_LIMIT,
    enabled: targetType === 'buyer' && buyerPickerOpen,
  });
  const { data: cohortsData } = useCohorts();
  const addAssignment = useAddAssignment(priceListId);
  const deleteAssignment = useDeleteAssignment(priceListId);

  const assignments = assignmentsData?.assignments ?? [];
  const buyers = buyersQuery.data?.pages[0]?.buyers ?? [];
  const cohorts = cohortsData?.cohorts ?? [];
  const hasDefaultAssignment = assignments.some((assignment) => assignment.target_type === 'all_buyers');
  const selectedBuyer = targetId ? buyerCache[targetId] : undefined;
  const buyerResultsUpdating = buyerSearch.trim() !== debouncedBuyerSearch.trim()
    || buyersQuery.isFetching;

  useEffect(() => {
    if (buyers.length === 0) return;
    setBuyerCache((current) => {
      const next = { ...current };
      for (const buyer of buyers) next[buyer.id] = buyer;
      return next;
    });
  }, [buyers]);

  useEffect(() => {
    if (!buyerPickerOpen) setBuyerSearch('');
  }, [buyerPickerOpen]);

  function handleTypeChange(val: string) {
    setTargetType(val as TargetType);
    setTargetId('');
    setBuyerPickerOpen(false);
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const payload =
      targetType === 'all_buyers'
        ? { target_type: 'all_buyers' as const }
        : { target_type: targetType, target_id: targetId };

    try {
      await addAssignment.mutateAsync(payload);
      setTargetId('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add assignment';
      setFormError(msg);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[14px] border border-cream-300 bg-white p-5">
        <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-cream-950">Assignment Details</h2>
            <p className="mt-1 text-sm text-cream-600">
              {hasDefaultAssignment
                ? 'This pricelist is the default fallback unless a buyer or customer group has a more specific pricelist.'
                : 'Assign this pricelist to a customer group, buyer, or make it the default fallback.'}
            </p>
          </div>
          <span className="w-fit rounded-full border border-cream-200 bg-cream-50 px-3 py-1 text-sm font-medium text-cream-700">
            {assignments.length} {assignments.length === 1 ? 'assignment' : 'assignments'}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4 xl:grid-cols-[1.15fr_1fr_auto] xl:items-end">
          <div>
            <p className="mb-2 text-sm font-medium text-cream-800">Assign to</p>
          <RadioGroup
            value={targetType}
            onValueChange={handleTypeChange}
              className="flex flex-wrap gap-x-6 gap-y-3"
          >
            {(['cohort', 'buyer', 'all_buyers'] as TargetType[]).map((type) => (
              <div key={type} className="flex items-center gap-2">
                <RadioGroupItem value={type} id={`radio-${type}`} />
                <Label htmlFor={`radio-${type}`} className="cursor-pointer text-sm text-cream-700">
                  {TARGET_TYPE_LABELS[type]}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        {targetType === 'cohort' && (
          <div>
            <Label className="text-sm text-cream-700 mb-1 block">Customer group</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={cohorts.length === 0 ? 'No cohorts available' : 'Select cohort'} />
              </SelectTrigger>
              <SelectContent>
                {cohorts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
                {cohorts.length === 0 && (
                  <div className="px-3 py-2 text-sm text-cream-500">No cohorts available</div>
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        {targetType === 'buyer' && (
          <div>
            <Label className="text-sm text-cream-700 mb-1 block">Buyer</Label>
            <Popover open={buyerPickerOpen} onOpenChange={setBuyerPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={buyerPickerOpen}
                  className="w-full justify-between font-normal"
                >
                  <span className={selectedBuyer ? 'text-cream-900' : 'text-cream-500'}>
                    {selectedBuyer?.business_name ?? 'Search and select buyer'}
                  </span>
                  <ChevronsUpDown size={14} className="text-cream-500" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    value={buyerSearch}
                    onValueChange={setBuyerSearch}
                    placeholder="Search buyers…"
                  />
                  <CommandList>
                    {buyersQuery.isError ? (
                      <div className="px-3 py-6 text-center text-sm text-red-600">
                        Unable to search buyers.
                      </div>
                    ) : buyers.length === 0 && !buyerResultsUpdating ? (
                      <CommandEmpty>No buyers found.</CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {buyers.map((buyer) => (
                          <CommandItem
                            key={buyer.id}
                            value={buyer.id}
                            onSelect={() => {
                              setBuyerCache((current) => ({ ...current, [buyer.id]: buyer }));
                              setTargetId(buyer.id);
                              setBuyerPickerOpen(false);
                            }}
                            className="flex cursor-pointer items-center justify-between gap-2"
                          >
                            <BuyerRowContent buyer={buyer} size="compact" />
                            {targetId === buyer.id && <Check size={14} className="shrink-0 text-teal-600" />}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                    {buyerResultsUpdating && (
                      <div className="flex items-center justify-center gap-2 px-3 py-2 text-xs text-cream-500">
                        <Loader2 size={12} className="animate-spin" />
                        Updating results…
                      </div>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        )}

          {targetType === 'all_buyers' && (
            <div className="rounded-[10px] border border-cream-200 bg-cream-50 px-4 py-3 text-sm text-cream-700">
              This becomes the only default pricelist. Any previous default will be replaced.
            </div>
          )}

        {formError && (
            <p className="text-sm text-red-600 xl:col-span-3">{formError}</p>
        )}

        <MutationButton
          type="submit"
          isPending={addAssignment.isPending}
          pendingLabel="Assigning…"
          disabled={
            (targetType !== 'all_buyers' && !targetId)
          }
            className="w-fit bg-teal-500 text-cream-50 hover:bg-teal-600"
        >
          Assign
        </MutationButton>
      </form>
      </section>

      <section className="rounded-[14px] border border-cream-300 bg-white">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-cream-950">Current Assignments</h3>
            <p className="text-sm text-cream-600">The most specific matching assignment wins during price resolution.</p>
          </div>
        </div>
        {assignmentsLoading ? (
          <div className="space-y-2 border-t border-cream-200 p-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-14 rounded-[10px]" />
            ))}
          </div>
        ) : (
          <LandingTable
            columns={[
              { label: 'Type', width: 190 },
              { label: 'Assignment', minWidth: 280 },
              { label: 'Coverage', width: 150 },
              { label: 'Assigned', width: 150 },
              { label: '', width: 88, align: 'right' },
            ]}
            horizontalScrollOnly
            tableMinWidth={860}
            showEmptyState={assignments.length === 0}
            emptyState={(
              <div className="px-5 py-8 text-sm text-cream-500">
                No assignments yet.
              </div>
            )}
          >
            {assignments.map((assignment) => (
              <tr key={assignment.id} className="border-b border-cream-200 last:border-b-0">
                <td className={LANDING_TABLE_CELL_CLASS}>
                  <span className="inline-flex items-center gap-2 rounded-full bg-cream-100 px-3 py-1 text-sm font-medium text-cream-800">
                    <AssignmentIcon type={assignment.target_type} />
                    {TARGET_TYPE_LABELS[assignment.target_type]}
                  </span>
                </td>
                <td className={LANDING_TABLE_CELL_CLASS}>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-cream-950">{assignmentName(assignment)}</p>
                    {assignment.target_id ? (
                      <p className="truncate text-xs text-cream-500">{assignment.target_id}</p>
                    ) : null}
                  </div>
                </td>
                <td className={`${LANDING_TABLE_CELL_CLASS} text-cream-700`}>
                  {assignmentCoverage(assignment)}
                </td>
                <td className={`${LANDING_TABLE_CELL_CLASS} text-cream-700`}>
                  {formatAssignedDate(assignment.created_at)}
                </td>
                <td className={`${LANDING_TABLE_CELL_CLASS} text-right`}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteAssignment.mutate(assignment.id)}
                    disabled={deleteAssignment.isPending}
                    aria-label="Remove assignment"
                  >
                    <X size={16} />
                  </Button>
                </td>
              </tr>
            ))}
          </LandingTable>
        )}
      </section>
    </div>
  );
}
