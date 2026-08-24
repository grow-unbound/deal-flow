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
  all_buyers: 'All Buyers',
};

function AssignmentIcon({ type }: { type: TargetType }) {
  if (type === 'cohort') return <Users size={14} />;
  if (type === 'buyer') return <User size={14} />;
  return <Globe size={14} />;
}

function chipLabel(assignment: PriceListAssignment): string {
  const typeName = TARGET_TYPE_LABELS[assignment.target_type] ?? assignment.target_type;
  if (!assignment.target_id) return typeName;
  return `${typeName}: ${assignment.target_id.slice(0, 8)}`;
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
    <div className="space-y-6 max-w-lg">
      {/* Assignment form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="text-sm font-medium text-cream-800 mb-2">Assign to</p>
          <RadioGroup
            value={targetType}
            onValueChange={handleTypeChange}
            className="flex gap-6"
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

        {formError && (
          <p className="text-sm text-red-600">{formError}</p>
        )}

        <MutationButton
          type="submit"
          isPending={addAssignment.isPending}
          pendingLabel="Assigning…"
          disabled={
            (targetType !== 'all_buyers' && !targetId)
          }
          className="bg-teal-500 text-cream-50 hover:bg-teal-600"
        >
          Assign
        </MutationButton>
      </form>

      {/* Assignments list */}
      <div>
        <p className="text-sm font-medium text-cream-800 mb-3">Current Assignments</p>
        {assignmentsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-56 rounded-full" />
            <Skeleton className="h-8 w-48 rounded-full" />
            <Skeleton className="h-8 w-64 rounded-full" />
          </div>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-cream-500">No assignments yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {assignments.map((a) => (
              <span
                key={a.id}
                className="flex items-center gap-1.5 bg-teal-50 text-teal-700 rounded-full px-3 py-1 text-sm"
              >
                <AssignmentIcon type={a.target_type} />
                {chipLabel(a)}
                <button
                  type="button"
                  onClick={() => deleteAssignment.mutate(a.id)}
                  disabled={deleteAssignment.isPending}
                  aria-label="Remove assignment"
                >
                  <X size={12} className="ml-1 cursor-pointer hover:text-teal-900" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
