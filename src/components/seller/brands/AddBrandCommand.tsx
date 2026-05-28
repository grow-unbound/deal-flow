'use client';

import { useState, useCallback, useMemo } from 'react';
import { Plus, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useSearchMasterBrands, useAddBrandToTenant, useCreateCustomBrand, useTenantBrands } from '@/hooks/useBrands';
import type { MasterBrand } from '@/hooks/useBrands';
import { CreateBrandSchema, type CreateBrandInput } from '@/lib/zod';

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

interface AddBrandCommandProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function AddBrandCommand({ open: controlledOpen, onOpenChange, hideTrigger = false }: AddBrandCommandProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [tab, setTab] = useState<'import' | 'create'>('import');
  const [search, setSearch] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);
  const isControlled = typeof controlledOpen === 'boolean';
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (nextOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  const { data: tenantBrandsData } = useTenantBrands();
  const { data: searchData, isLoading: isSearching } = useSearchMasterBrands(search);
  const addBrand = useAddBrandToTenant();
  const createBrand = useCreateCustomBrand();

  const createForm = useForm<CreateBrandInput>({
    resolver: zodResolver(CreateBrandSchema),
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      logo_url: '',
    },
  });

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

  async function onCreateSubmit(values: CreateBrandInput) {
    try {
      await createBrand.mutateAsync(values);
      toast.success('Custom brand created successfully');
      createForm.reset();
      setOpen(false);
      setTab('import');
      setSearch('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create custom brand';
      toast.error(msg);
    }
  }

  return (
    <>
      {!hideTrigger ? (
        <Button
          onClick={() => setOpen(true)}
          className="bg-teal-500 hover:bg-teal-600 text-cream-50 flex items-center gap-2"
        >
          <Plus size={16} />
          Add Brand
        </Button>
      ) : null}

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setSearch('');
            setTab('import');
            createForm.reset();
          }
        }}
      >
        <DialogContent className="max-w-2xl overflow-hidden p-0">
          <DialogHeader>
            <DialogTitle className="font-display">Add a brand</DialogTitle>
            <DialogDescription>
              Import from the master catalog or create a custom private brand.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <Tabs value={tab} onValueChange={(next) => setTab(next as 'import' | 'create')}>
              <TabsList className="bg-cream-100">
                <TabsTrigger value="import">Import from catalog</TabsTrigger>
                <TabsTrigger value="create">Create custom brand</TabsTrigger>
              </TabsList>

              <TabsContent value="import" className="mt-4">
                <Command shouldFilter={false} className="rounded-md border border-cream-200 shadow-none">
                  <CommandInput
                    placeholder="Search brands..."
                    value={search}
                    onValueChange={setSearch}
                  />
                  <CommandList className="max-h-80">
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
                              className="flex cursor-pointer items-center gap-3 py-2"
                            >
                              <BrandAvatar brand={brand} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-cream-900">{brand.name}</p>
                                <p className="truncate text-xs text-cream-600">{brand.slug}</p>
                              </div>
                              {alreadyLinked ? (
                                <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-teal-600">
                                  <Check size={12} />
                                  Already in catalog
                                </span>
                              ) : isAdding ? (
                                <span className="shrink-0 text-xs text-cream-500">Adding...</span>
                              ) : (
                                <span className="shrink-0 text-xs font-medium text-teal-600">Use this brand</span>
                              )}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </TabsContent>

              <TabsContent value="create" className="mt-4">
                <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="create-brand-name" className="text-xs font-medium text-cream-800">Brand Name</label>
                      <Input id="create-brand-name" {...createForm.register('name')} placeholder="e.g. Sunrise Electronics" />
                      {createForm.formState.errors.name && (
                        <p className="text-xs text-danger-500">{createForm.formState.errors.name.message}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="create-brand-slug" className="text-xs font-medium text-cream-800">Slug</label>
                      <Input id="create-brand-slug" {...createForm.register('slug')} placeholder="e.g. sunrise-electronics" />
                      {createForm.formState.errors.slug && (
                        <p className="text-xs text-danger-500">{createForm.formState.errors.slug.message}</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="create-brand-description" className="text-xs font-medium text-cream-800">Description (optional)</label>
                    <Textarea id="create-brand-description" {...createForm.register('description')} rows={3} placeholder="Short description of the brand" />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="create-brand-logo-url" className="text-xs font-medium text-cream-800">Logo URL (optional)</label>
                    <Input id="create-brand-logo-url" {...createForm.register('logo_url')} type="url" placeholder="https://example.com/logo.png" />
                  </div>

                  <DialogFooter className="px-0 pb-0 pt-2">
                    <Button
                      type="submit"
                      disabled={createBrand.isPending}
                      className="bg-teal-500 text-cream-50 hover:bg-teal-600"
                    >
                      {createBrand.isPending ? 'Creating…' : 'Create brand'}
                    </Button>
                  </DialogFooter>
                </form>
              </TabsContent>
            </Tabs>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
