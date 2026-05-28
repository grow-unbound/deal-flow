'use client';

import { useState, useEffect } from 'react';
import { Check, X, ChevronsUpDown } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase-browser';
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

interface Buyer {
  id: string;
  business_name: string;
  tier: string | null;
  is_active: boolean;
}

interface CohortMemberSelectorProps {
  selected: string[];
  onChange: (ids: string[]) => void;
}

async function loadBuyers(): Promise<Buyer[]> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  const headers: Record<string, string> = {};
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
  const res = await fetch('/api/customers', { headers });
  if (!res.ok) return [];
  const body = await res.json();
  return (body.buyers ?? []).filter((b: Buyer) => b.is_active);
}

export function CohortMemberSelector({ selected, onChange }: CohortMemberSelectorProps) {
  const [open, setOpen] = useState(false);
  const [buyers, setBuyers] = useState<Buyer[]>([]);

  useEffect(() => {
    loadBuyers().then(setBuyers);
  }, []);

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  function remove(id: string) {
    onChange(selected.filter((s) => s !== id));
  }

  const selectedBuyers = buyers.filter((b) => selected.includes(b.id));

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
          <Command>
            <CommandInput placeholder="Search buyers…" className="bg-cream-50" />
            <CommandList>
              <CommandEmpty>No buyers found.</CommandEmpty>
              <CommandGroup>
                {buyers.map((buyer) => {
                  const isSelected = selected.includes(buyer.id);
                  return (
                    <CommandItem
                      key={buyer.id}
                      value={buyer.business_name}
                      onSelect={() => {
                        toggle(buyer.id);
                      }}
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
                      {buyer.tier && (
                        <span className="text-xs bg-cream-200 text-cream-700 rounded px-1.5 py-0.5">
                          Tier {buyer.tier}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected buyer chips */}
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
