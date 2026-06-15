'use client';

import { useMemo, useState } from 'react';
import { Plus, Search, Tag } from 'lucide-react';

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
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { useTenantCategories } from '@/hooks/useTenantCategories';
import { useRole } from '@/hooks/useRole';
import type { TenantCategory } from '@/types/tenant-categories';

import { CategoryFormSheet } from './CategoryFormSheet';
import { CategoriesTable } from './CategoriesTable';
import { SettingsSectionCard } from './SettingsSectionCard';

export function CategoriesSettingsClient() {
  const { isSellerAdmin } = useRole();
  const { data, isLoading, isError, error, refetch, deactivateCategory, updateCategory, isDeactivating } =
    useTenantCategories();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<TenantCategory | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<TenantCategory | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  const allCategories = data?.categories ?? [];
  const busy = isDeactivating;

  const categories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allCategories.filter((cat) => {
      if (statusFilter === 'Active' && cat.deleted_at) return false;
      if (statusFilter === 'Inactive' && !cat.deleted_at) return false;
      if (q && !cat.name.toLowerCase().includes(q) && !cat.slug?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allCategories, search, statusFilter]);

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

  return (
    <>
      <SettingsSectionCard
        title="Categories"
        subtitle="Product categories define the purchase journey for your buyers. Set display order to control the sequence shown in the buyer app."
        icon={Tag}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search categories…"
                className="pl-9 h-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(['All', 'Active', 'Inactive'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${statusFilter === s ? 'bg-cream-900 text-white' : 'border border-cream-300 bg-white text-cream-700 hover:bg-cream-50'}`}
                >
                  {s}
                </button>
              ))}
            </div>
            {isSellerAdmin ? (
              <Button type="button" size="sm" onClick={openAdd} className="ml-auto">
                <Plus className="mr-2 h-4 w-4" />
                Add category
              </Button>
            ) : null}
          </div>

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
          ) : categories.length === 0 ? (
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
            <CategoriesTable
              categories={categories}
              isAdmin={isSellerAdmin}
              isBusy={busy}
              onEdit={openEdit}
              onDeactivate={(cat) => setDeactivateTarget(cat)}
              onReactivate={(cat) => void handleReactivate(cat)}
            />
          )}
        </div>
      </SettingsSectionCard>

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
            <div className="rounded-md border border-warning-500/30 bg-warning-50 px-4 py-3 text-body-sm text-warning-800">
              <span className="font-medium text-warning-900">{deactivateTarget.name}</span>
              {deactivateTarget.slug ? (
                <span className="ml-2 font-mono text-xs text-warning-700/90">{deactivateTarget.slug}</span>
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
