'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Pencil, Plus, RotateCcw, Tag, UserX } from 'lucide-react';

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
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FilterBar, LandingTable, StatusTag } from '@/components/seller/layout';
import { useTenantCategories } from '@/hooks/useTenantCategories';
import { useRole } from '@/hooks/useRole';
import { r2Url } from '@/lib/r2-url';
import { cn } from '@/lib/utils';
import type { TenantCategory } from '@/types/tenant-categories';

import { CategoryFormSheet } from './CategoryFormSheet';

type StatusChip = 'All' | 'Active' | 'Inactive';
type CategorySort = 'Display order' | 'Name (A → Z)';

const STATUS_CHIPS: StatusChip[] = ['All', 'Active', 'Inactive'];
const SORT_OPTIONS: CategorySort[] = ['Display order', 'Name (A → Z)'];

export function CategoriesSettingsClient() {
  const { isSellerAdmin } = useRole();
  const { data, isLoading, isError, error, refetch, deactivateCategory, updateCategory, isDeactivating } =
    useTenantCategories();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<TenantCategory | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<TenantCategory | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusChip>('All');
  const [sortBy, setSortBy] = useState<CategorySort>('Display order');

  const allCategories = data?.categories ?? [];
  const busy = isDeactivating;

  const categories = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = allCategories.filter((cat) => {
      if (statusFilter === 'Active' && cat.deleted_at) return false;
      if (statusFilter === 'Inactive' && !cat.deleted_at) return false;
      if (q && !cat.name.toLowerCase().includes(q) && !cat.slug?.toLowerCase().includes(q)) return false;
      return true;
    });
    const sorted = [...filtered];
    if (sortBy === 'Name (A → Z)') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      sorted.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    }
    return sorted;
  }, [allCategories, search, statusFilter, sortBy]);

  function openAdd() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(cat: TenantCategory) {
    setEditing(cat);
    setSheetOpen(true);
  }

  async function handleReactivate(cat: TenantCategory) {
    await updateCategory({ id: cat.id, patch: { reactivate: true } });
  }

  const addAction = isSellerAdmin ? (
    <Button type="button" onClick={openAdd} className="flex items-center gap-2">
      <Plus size={16} />
      Add category
    </Button>
  ) : null;

  const columnCount = isSellerAdmin ? 4 : 3;

  return (
    <>
      <SellerTopbar
        eyebrow="Settings"
        title="Categories"
        subtitle="Organise products and guide buyers through a structured purchase journey."
        action={addAction}
      />

      {isLoading ? (
        <div className="space-y-2" aria-busy>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-md border border-cream-100 bg-cream-50" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          heading="Could not load categories"
          description={error instanceof Error ? error.message : 'Something went wrong.'}
          onRetry={() => void refetch()}
        />
      ) : allCategories.length === 0 ? (
        <EmptyState
          icon={<Tag className="h-7 w-7" strokeWidth={1.5} />}
          heading="No categories yet"
          description="Add categories to organise your products and create a guided purchase journey for buyers."
          action={
            isSellerAdmin ? (
              <Button type="button" onClick={openAdd}>
                <Plus className="mr-2 h-4 w-4" />
                Add category
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <FilterBar
            count={`Showing ${categories.length} of ${allCategories.length} categories`}
            searchPlaceholder="Search categories…"
            chips={STATUS_CHIPS}
            activeChip={statusFilter}
            sortBy={sortBy}
            hideViewToggle
            searchValue={search}
            onSearchChange={setSearch}
            onChipChange={(chip) => setStatusFilter(chip as StatusChip)}
            sortOptions={SORT_OPTIONS}
            onSortChange={(option) => setSortBy(option as CategorySort)}
          />
          <LandingTable
            columns={[
              { label: 'Name', width: 320, className: 'px-4' },
              { label: 'Order', className: 'px-4' },
              { label: 'Status', className: 'px-4' },
              ...(isSellerAdmin ? [{ label: 'Actions', align: 'right' as const, className: 'px-4' }] : []),
            ]}
          >
            {categories.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-4 py-16 text-center text-base text-cream-500">
                  No categories match your filters.
                </td>
              </tr>
            ) : (
              categories.map((cat) => {
                const inactive = Boolean(cat.deleted_at);
                const thumbUrl = r2Url(cat.r2_image_thumb_key);
                return (
                  <tr
                    key={cat.id}
                    className={cn(
                      'border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50',
                      inactive && 'bg-cream-50/80 text-cream-600',
                    )}
                  >
                    <td className="px-4 py-3.5 align-middle">
                      <div className="flex items-center gap-3">
                        {thumbUrl ? (
                          <Image
                            src={thumbUrl}
                            alt=""
                            width={32}
                            height={32}
                            unoptimized
                            className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-cream-200"
                          />
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cream-100 text-cream-500">
                            <Tag className="h-4 w-4" aria-hidden />
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="font-medium text-cream-900">{cat.name}</span>
                          <p className="mt-0.5 truncate font-mono text-sm text-cream-500">{cat.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 align-middle">
                      <span className="font-mono text-sm tabular-nums text-cream-700">{cat.display_order}</span>
                    </td>
                    <td className="px-4 py-3.5 align-middle">
                      {inactive ? (
                        <StatusTag label="Inactive" tone="neutral" />
                      ) : (
                        <StatusTag label="Active" tone="success" />
                      )}
                    </td>
                    {isSellerAdmin ? (
                      <td className="px-4 py-3.5 text-right align-middle">
                        <div className="flex justify-end gap-1">
                          {inactive ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-cream-700 hover:text-teal-700"
                              disabled={busy}
                              onClick={() => void handleReactivate(cat)}
                              title="Reactivate category"
                            >
                              <RotateCcw className="h-4 w-4" />
                              <span className="sr-only">Reactivate</span>
                            </Button>
                          ) : (
                            <>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-cream-600 hover:text-cream-900"
                                disabled={busy}
                                onClick={() => openEdit(cat)}
                                title="Edit category"
                              >
                                <Pencil className="h-4 w-4" />
                                <span className="sr-only">Edit</span>
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-cream-600 hover:text-danger-500"
                                disabled={busy}
                                onClick={() => setDeactivateTarget(cat)}
                                title="Deactivate category"
                              >
                                <UserX className="h-4 w-4" />
                                <span className="sr-only">Deactivate</span>
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </LandingTable>
        </>
      )}

      <CategoryFormSheet open={sheetOpen} onOpenChange={setSheetOpen} editingCategory={editing} />

      <AlertDialog
        open={Boolean(deactivateTarget)}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
      >
        <AlertDialogContent className="border-cream-200 bg-cream-50">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-cream-900">Deactivate category?</AlertDialogTitle>
            <AlertDialogDescription className="text-cream-700">
              The category will be hidden from products and the buyer app. You cannot deactivate a category while
              products are still assigned to it — reassign those products first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deactivateTarget ? (
            <div className="rounded-md border border-warning-500/30 bg-warning-50 px-4 py-3 text-base text-warning-800">
              <span className="font-medium text-warning-900">{deactivateTarget.name}</span>
              {deactivateTarget.slug ? (
                <span className="ml-2 font-mono text-sm text-warning-700/90">{deactivateTarget.slug}</span>
              ) : null}
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger-500 text-white hover:bg-danger-600"
              disabled={!deactivateTarget || busy}
              onClick={(e) => {
                e.preventDefault();
                if (!deactivateTarget) return;
                void deactivateCategory(deactivateTarget.id).then(() => setDeactivateTarget(null));
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
