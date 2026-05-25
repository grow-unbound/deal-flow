'use client';

import { useState, useCallback, useMemo } from 'react';
import { Plus, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useSearchMasterBrands, useAddBrandToTenant, useTenantBrands } from '@/hooks/useBrands';
import type { MasterBrand } from '@/hooks/useBrands';

function BrandAvatar({ brand }: { brand: MasterBrand }) {
  if (brand.logo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={brand.logo_url}
        alt={brand.name}
        className="w-8 h-8 rounded object-contain"
      />
    );
  }
  const initials = brand.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span className="w-8 h-8 rounded bg-teal-100 text-teal-700 font-display text-xs font-semibold flex items-center justify-center">
      {initials}
    </span>
  );
}

export function AddBrandCommand() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);

  const { data: tenantBrandsData } = useTenantBrands();
  const { data: searchData, isLoading: isSearching } = useSearchMasterBrands(search);
  const addBrand = useAddBrandToTenant();

  const linkedBrandIds = useMemo(
    () => new Set((tenantBrandsData?.brands ?? []).map((b) => b.master_brand_id)),
    [tenantBrandsData?.brands]
  );

  const handleSelect = useCallback(
    async (brand: MasterBrand) => {
      if (linkedBrandIds.has(brand.id)) return;
      setAddingId(brand.id);
      try {
        await addBrand.mutateAsync({ master_brand_id: brand.id });
        setOpen(false);
        setSearch('');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to add brand';
        toast.error(msg);
      } finally {
        setAddingId(null);
      }
    },
    [addBrand, linkedBrandIds]
  );

  const results = searchData?.brands ?? [];

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="bg-teal-500 hover:bg-teal-600 text-cream-50 flex items-center gap-2"
      >
        <Plus size={16} />
        Add Brand
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(''); }}>
        <DialogContent className="p-0 overflow-hidden max-w-md">
          <DialogHeader className="px-4 pt-4 pb-0">
            <DialogTitle className="font-display text-cream-900">Add Brand from Catalog</DialogTitle>
          </DialogHeader>
          <Command shouldFilter={false} className="border-none shadow-none">
            <CommandInput
              placeholder="Search brands..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList className="max-h-72">
              {search.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Start typing to search for brands
                </div>
              )}
              {search.length >= 1 && isSearching && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Searching...
                </div>
              )}
              {search.length >= 1 && !isSearching && results.length === 0 && (
                <CommandEmpty>No brands found for &quot;{search}&quot;</CommandEmpty>
              )}
              {results.length > 0 && (
                <CommandGroup heading="Master Catalog">
                  {results.map((brand) => {
                    const alreadyLinked = linkedBrandIds.has(brand.id);
                    const isAdding = addingId === brand.id;
                    return (
                      <CommandItem
                        key={brand.id}
                        value={brand.id}
                        onSelect={() => handleSelect(brand)}
                        disabled={alreadyLinked || isAdding}
                        className="flex items-center gap-3 py-2 cursor-pointer"
                      >
                        <BrandAvatar brand={brand} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-cream-900 truncate">{brand.name}</p>
                          <p className="text-xs text-cream-600 truncate">{brand.slug}</p>
                        </div>
                        {alreadyLinked ? (
                          <span className="flex items-center gap-1 text-xs text-teal-600 font-medium shrink-0">
                            <Check size={12} />
                            Already in catalog
                          </span>
                        ) : isAdding ? (
                          <span className="text-xs text-cream-500 shrink-0">Adding...</span>
                        ) : (
                          <span className="text-xs text-teal-600 font-medium shrink-0">Use this brand</span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
