'use client';

import { useMemo, useState } from 'react';
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar, LandingTable } from '@/components/seller/layout';
import type { BundleRecord } from './BundleEditorDialog';
import { RecommendationsTableIconButton } from './RecommendationsTableIconButton';

interface BundlesTableProps {
  bundles: BundleRecord[];
  deactivating: boolean;
  onCreateBundle: () => void;
  onEditBundle: (bundle: BundleRecord) => void;
  onDeactivateBundle: (bundle: BundleRecord) => void;
}

type BundleSort = 'Name (A → Z)' | 'Categories (most → few)' | 'Source';

const SORT_OPTIONS: BundleSort[] = ['Name (A → Z)', 'Categories (most → few)', 'Source'];

export function BundlesTable({
  bundles,
  deactivating,
  onCreateBundle,
  onEditBundle,
  onDeactivateBundle,
}: BundlesTableProps) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<BundleSort>('Name (A → Z)');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);

  const categoryOptions = useMemo(() => {
    const names = new Set<string>();
    for (const bundle of bundles) {
      for (const slot of bundle.slots) {
        const name = slot.category_name ?? slot.tenant_category_id;
        if (name) names.add(name);
      }
    }
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
  }, [bundles]);

  const filteredBundles = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = bundles.filter((bundle) => {
      const slotNames = bundle.slots.map((s) => s.category_name ?? s.tenant_category_id);
      const matchesSearch =
        !q
        || bundle.name.toLowerCase().includes(q)
        || (bundle.description ?? '').toLowerCase().includes(q)
        || slotNames.some((name) => name.toLowerCase().includes(q));
      const matchesCategory =
        categoryFilter.length === 0
        || categoryFilter.some((name) => slotNames.includes(name));
      return matchesSearch && matchesCategory;
    });

    const sorted = [...filtered];
    if (sortBy === 'Name (A → Z)') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'Categories (most → few)') {
      sorted.sort((a, b) => b.slots.length - a.slots.length);
    } else {
      sorted.sort((a, b) => (a.source ?? '').localeCompare(b.source ?? ''));
    }
    return sorted;
  }, [bundles, categoryFilter, search, sortBy]);

  if (bundles.length === 0) {
    return (
      <EmptyState
        icon={<Layers size={28} strokeWidth={1.5} />}
        heading="No bundles yet"
        description="Accept a suggestion above or create a bundle manually."
        action={
          <Button type="button" onClick={onCreateBundle}>
            <Plus className="mr-2 h-4 w-4" />
            Create bundle
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <FilterBar
        count={`Showing ${filteredBundles.length} of ${bundles.length} bundles`}
        searchPlaceholder="Search bundles or categories…"
        chips={[]}
        activeChip=""
        sortBy={sortBy}
        hideViewToggle
        searchValue={search}
        onSearchChange={setSearch}
        sortOptions={SORT_OPTIONS}
        onSortChange={(option) => setSortBy(option as BundleSort)}
        groups={
          categoryOptions.length > 0
            ? [
                {
                  key: 'category',
                  label: 'Category',
                  options: categoryOptions,
                  values: categoryFilter,
                  onChange: setCategoryFilter,
                },
              ]
            : undefined
        }
      />

      <LandingTable
        tableMinWidth={880}
        columns={[
          { label: 'Name', width: 180, minWidth: 180, maxWidth: 240, className: 'px-5' },
          { label: 'Categories', width: 300, minWidth: 260, maxWidth: 340, className: 'px-5' },
          { label: 'Actions', align: 'right', width: 100, className: 'px-5' },
        ]}
      >
        {filteredBundles.length === 0 ? (
          <tr>
            <td colSpan={3} className="px-5 py-16 text-center text-base text-cream-500">
              No bundles match your filters.
            </td>
          </tr>
        ) : (
          filteredBundles.map((bundle) => (
            <tr
              key={bundle.id}
              className="border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
            >
              <td className="px-5 py-3.5 align-middle">
                <div className="flex items-center gap-2">
                  <span className="text-base font-medium text-cream-900">{bundle.name}</span>
                  {bundle.source ? (
                    <Badge variant="outline" className="text-xs">
                      {bundle.source}
                    </Badge>
                  ) : null}
                </div>
                {bundle.description ? (
                  <p className="mt-0.5 text-sm text-cream-500">{bundle.description}</p>
                ) : null}
              </td>
              <td className="px-5 py-3.5 align-middle">
                <div className="flex flex-wrap gap-1.5">
                  {bundle.slots.length === 0 ? (
                    <span className="text-sm text-cream-500">No slots defined</span>
                  ) : (
                    bundle.slots.map((slot, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {slot.category_name ?? slot.tenant_category_id}
                        {!slot.is_required ? ' (optional)' : ''}
                      </Badge>
                    ))
                  )}
                </div>
              </td>
              <td className="px-5 py-3.5 text-right align-middle">
                <div className="flex items-center justify-end gap-1">
                  <RecommendationsTableIconButton
                    label="Edit bundle"
                    className="text-cream-600 hover:text-cream-900"
                    onClick={() => onEditBundle(bundle)}
                  >
                    <Pencil size={14} />
                  </RecommendationsTableIconButton>
                  <RecommendationsTableIconButton
                    label="Deactivate bundle"
                    className="text-cream-600 hover:text-danger-500"
                    disabled={deactivating}
                    onClick={() => onDeactivateBundle(bundle)}
                  >
                    <Trash2 size={14} />
                  </RecommendationsTableIconButton>
                </div>
              </td>
            </tr>
          ))
        )}
      </LandingTable>
    </div>
  );
}
