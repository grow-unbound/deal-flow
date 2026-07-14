'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDebounce } from '@/hooks/useDebounce';
import { apiFetch } from '@/lib/api-fetch';

interface Buyer {
  id: string;
  business_name: string;
}

interface CohortMemberSelectorProps {
  selected: string[];
  onChange: (ids: string[]) => void;
}

const BUYER_SEARCH_LIMIT = 8;

async function searchBuyers(query: string): Promise<Buyer[]> {
  const params = new URLSearchParams({ limit: String(BUYER_SEARCH_LIMIT) });
  if (query.trim()) params.set('q', query.trim());

  const res = await apiFetch(`/api/tenant/buyers/search?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to search buyers');
  const body = await res.json() as { buyers?: Buyer[] };
  return body.buyers ?? [];
}

export function CohortMemberSelector({ selected, onChange }: CohortMemberSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [buyerCache, setBuyerCache] = useState<Record<string, Buyer>>({});
  const debouncedQuery = useDebounce(query, 300);
  const buyersQuery = useQuery({
    queryKey: ['cohort-member-buyer-search', debouncedQuery.trim()],
    queryFn: () => searchBuyers(debouncedQuery),
    enabled: open,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
  const buyers = buyersQuery.data ?? [];

  useEffect(() => {
    if (buyers.length === 0) return;
    setBuyerCache((current) => {
      const next = { ...current };
      for (const buyer of buyers) next[buyer.id] = buyer;
      return next;
    });
  }, [buyers]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  function toggle(buyer: Buyer) {
    setBuyerCache((current) => ({ ...current, [buyer.id]: buyer }));
    if (selected.includes(buyer.id)) {
      onChange(selected.filter((id) => id !== buyer.id));
    } else {
      onChange([...selected, buyer.id]);
    }
  }

  function remove(id: string) {
    onChange(selected.filter((selectedId) => selectedId !== id));
  }

  const selectedBuyers = useMemo(
    () => selected.map((id) => buyerCache[id] ?? { id, business_name: `Buyer ${id.slice(0, 8)}` }),
    [buyerCache, selected],
  );
  const isUpdating = query.trim() !== debouncedQuery.trim() || buyersQuery.isFetching;

  return (
    <div className="space-y-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between bg-cream-50 border-cream-300 text-cream-800"
          >
            <span>
              {selected.length === 0
                ? 'Search and select buyers…'
                : `${selected.length} buyer${selected.length === 1 ? '' : 's'} selected`}
            </span>
            <ChevronsUpDown size={14} className="text-cream-500" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0 bg-cream-50" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search buyers…"
              className="bg-cream-50"
            />
            <CommandList>
              {buyersQuery.isError ? (
                <div className="px-3 py-6 text-center text-sm text-red-600">
                  Unable to search buyers.
                </div>
              ) : buyers.length === 0 && !isUpdating ? (
                <CommandEmpty>No buyers found.</CommandEmpty>
              ) : (
                <CommandGroup>
                  {buyers.map((buyer) => {
                    const isSelected = selected.includes(buyer.id);
                    return (
                      <CommandItem
                        key={buyer.id}
                        value={buyer.id}
                        onSelect={() => toggle(buyer)}
                        className="flex items-center justify-between cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center ${
                              isSelected
                                ? 'bg-teal-500 border-teal-500'
                                : 'border-cream-400 bg-cream-50'
                            }`}
                          >
                            {isSelected && <Check size={10} className="text-white" />}
                          </div>
                          <span className="text-sm text-cream-900">{buyer.business_name}</span>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
              {isUpdating && (
                <div className="flex items-center justify-center gap-2 px-3 py-2 text-xs text-cream-500">
                  <Loader2 size={12} className="animate-spin" />
                  Updating results…
                </div>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedBuyers.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedBuyers.map((buyer) => (
            <span
              key={buyer.id}
              className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 rounded-full px-2 py-0.5 text-xs font-medium"
            >
              {buyer.business_name}
              <button
                type="button"
                onClick={() => remove(buyer.id)}
                aria-label={`Remove ${buyer.business_name}`}
                className="ml-0.5 hover:text-teal-900 transition-colors"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
