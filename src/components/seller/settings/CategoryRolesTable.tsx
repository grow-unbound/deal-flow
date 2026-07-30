'use client';

import { useMemo, useState } from 'react';
import { Tag } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar, LandingTable, EntityAvatar } from '@/components/seller/layout';
import { r2Url } from '@/lib/r2-url';

function categoryInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2) || '?';
}

export interface CategoryRoleRow {
  category_id: string;
  category_name: string;
  override_role: string | null;
  computed_role: string | null;
  resolved_role: string;
  is_auto: boolean;
  weighted_event_count: number;
  r2_image_thumb_key?: string | null;
}

interface CategoryRolesTableProps {
  initialCategories: CategoryRoleRow[];
}

type RoleChip = 'All roles' | 'Anchor' | 'Companion' | 'Exclude' | 'Overridden';
type CategoryRoleSort = 'Name (A → Z)' | 'Events (high → low)' | 'Events (low → high)';

const ROLE_CHIPS: RoleChip[] = ['All roles', 'Anchor', 'Companion', 'Exclude', 'Overridden'];
const SORT_OPTIONS: CategoryRoleSort[] = ['Name (A → Z)', 'Events (high → low)', 'Events (low → high)'];

const ROLE_LABELS: Record<string, string> = {
  anchor: 'Anchor',
  companion: 'Companion',
  exclude: 'Exclude',
};

const ROLE_BADGE_VARIANT: Record<string, 'default' | 'teal' | 'danger' | 'outline'> = {
  anchor: 'teal',
  companion: 'default',
  exclude: 'danger',
};

export function CategoryRolesTable({ initialCategories }: CategoryRolesTableProps) {
  const [categories, setCategories] = useState<CategoryRoleRow[]>(initialCategories);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeChip, setActiveChip] = useState<RoleChip>('All roles');
  const [sortBy, setSortBy] = useState<CategoryRoleSort>('Name (A → Z)');

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = categories.filter((cat) => {
      if (q && !cat.category_name.toLowerCase().includes(q)) return false;
      if (activeChip === 'Anchor' && cat.resolved_role !== 'anchor') return false;
      if (activeChip === 'Companion' && cat.resolved_role !== 'companion') return false;
      if (activeChip === 'Exclude' && cat.resolved_role !== 'exclude') return false;
      if (activeChip === 'Overridden' && cat.is_auto) return false;
      return true;
    });

    const sorted = [...filtered];
    if (sortBy === 'Name (A → Z)') {
      sorted.sort((a, b) => a.category_name.localeCompare(b.category_name));
    } else if (sortBy === 'Events (high → low)') {
      sorted.sort((a, b) => b.weighted_event_count - a.weighted_event_count);
    } else {
      sorted.sort((a, b) => a.weighted_event_count - b.weighted_event_count);
    }
    return sorted;
  }, [activeChip, categories, search, sortBy]);

  async function handleRoleChange(categoryId: string, newRole: string | null) {
    setSaving(categoryId);
    try {
      const res = await fetch(`/api/tenant/reco/categories/${categoryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendation_role: newRole }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to update');

      setCategories((prev) =>
        prev.map((c) =>
          c.category_id === categoryId
            ? {
                ...c,
                override_role: newRole,
                resolved_role: newRole ?? c.computed_role ?? 'anchor',
                is_auto: newRole === null,
              }
            : c,
        ),
      );
      toast.success('Category role updated');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update category role';
      toast.error(message);
    } finally {
      setSaving(null);
    }
  }

  if (categories.length === 0) {
    return (
      <EmptyState
        icon={<Tag size={28} strokeWidth={1.5} />}
        heading="No categories yet"
        description="Add categories in the Catalog section before configuring recommendation roles."
      />
    );
  }

  return (
    <div>
      <FilterBar
        count={`Showing ${filteredCategories.length} of ${categories.length} categories`}
        searchPlaceholder="Search categories…"
        chips={ROLE_CHIPS}
        activeChip={activeChip}
        sortBy={sortBy}
        hideViewToggle
        searchValue={search}
        onSearchChange={setSearch}
        onChipChange={(chip) => setActiveChip(chip as RoleChip)}
        sortOptions={SORT_OPTIONS}
        onSortChange={(option) => setSortBy(option as CategoryRoleSort)}
      />

      <LandingTable
        tableMinWidth={1040}
        columns={[
          { label: 'Category', width: 150, minWidth: 150, maxWidth: 360, className: 'px-5' },
          { label: 'Events', align: 'right', width: 100, minWidth: 100, maxWidth: 120, className: 'px-5' },
          { label: 'Auto-detected', width: 180, minWidth: 180, maxWidth: 220, className: 'px-5' },
          { label: 'Override', width: 360, minWidth: 360, className: 'px-5' },
        ]}
      >
        {filteredCategories.length === 0 ? (
          <tr>
            <td colSpan={4} className="px-5 py-16 text-center text-base text-cream-500">
              No categories match your filters.
            </td>
          </tr>
        ) : (
          filteredCategories.map((cat) => {
            const thumbUrl = r2Url(cat.r2_image_thumb_key);
            return (
              <tr
                key={cat.category_id}
                className="border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
              >
                <td className="px-3 py-2 align-middle">
                  <div className="flex items-center gap-3">
                    <EntityAvatar
                      initials={categoryInitials(cat.category_name)}
                      hue="teal"
                      size={32}
                      imageUrl={thumbUrl}
                    />
                    <span className="text-base font-medium text-cream-900">{cat.category_name}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right align-middle">
                  <span className="font-mono text-base tabular-nums text-cream-700">
                    {cat.weighted_event_count > 0 ? cat.weighted_event_count : '—'}
                  </span>
                </td>
                <td className="px-3 py-2 align-middle">
                  {cat.computed_role ? (
                    <div className="flex items-center gap-1.5">
                      <Badge variant={ROLE_BADGE_VARIANT[cat.computed_role] ?? 'outline'} icon>
                        {ROLE_LABELS[cat.computed_role] ?? cat.computed_role}
                      </Badge>
                      {cat.is_auto ? (
                        <span className="text-sm text-cream-500">Auto</span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-base text-cream-500">No data yet</span>
                  )}
                </td>
                <td className="px-3 py-2 align-middle">
                  <Select
                    value={cat.override_role ?? 'auto'}
                    onValueChange={(value) =>
                      handleRoleChange(cat.category_id, value === 'auto' ? null : value)
                    }
                    disabled={saving === cat.category_id}
                  >
                    <SelectTrigger className="h-9 w-full max-w-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">
                        Auto ({ROLE_LABELS[cat.computed_role ?? 'anchor'] ?? 'Anchor'})
                      </SelectItem>
                      <SelectItem value="anchor">Anchor — show in Bestsellers</SelectItem>
                      <SelectItem value="companion">Companion — accessory, skip Bestsellers</SelectItem>
                      <SelectItem value="exclude">Exclude — never surface</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            );
          })
        )}
      </LandingTable>
    </div>
  );
}
