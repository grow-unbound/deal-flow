'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

export interface CategoryRoleRow {
  category_id: string;
  category_name: string;
  override_role: string | null;
  computed_role: string | null;
  resolved_role: string;
  is_auto: boolean;
  weighted_event_count: number;
}

interface CategoryRolesTableProps {
  tenantId: string;
  initialCategories: CategoryRoleRow[];
}

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

const ROLE_TOOLTIP: Record<string, string> = {
  anchor: 'Primary discovery product — appears in Bestsellers',
  companion: 'Add-on / accessory — excluded from Bestsellers, shown in "add to cart" suggestions',
  exclude: 'Service line item — never surfaces in recommendations',
};

export function CategoryRolesTable({ tenantId, initialCategories }: CategoryRolesTableProps) {
  const [categories, setCategories] = useState<CategoryRoleRow[]>(initialCategories);
  const [saving, setSaving] = useState<string | null>(null);

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
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update category role');
    } finally {
      setSaving(null);
    }
  }

  if (categories.length === 0) {
    return (
      <p className="text-sm text-cream-500 py-4 text-center">
        No categories found. Add categories in the Catalog section first.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-cream-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-cream-200 bg-cream-50">
            <th className="px-4 py-3 text-left font-medium text-cream-600">Category</th>
            <th className="px-4 py-3 text-left font-medium text-cream-600">Auto-detected</th>
            <th className="px-4 py-3 text-left font-medium text-cream-600">Override</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cream-100">
          {categories.map((cat) => (
            <tr key={cat.category_id} className="hover:bg-cream-50 transition-colors">
              <td className="px-4 py-3">
                <span className="font-medium text-cream-900">{cat.category_name}</span>
                {cat.weighted_event_count > 0 && (
                  <span className="ml-2 text-xs text-cream-400">({cat.weighted_event_count} events)</span>
                )}
              </td>
              <td className="px-4 py-3">
                {cat.computed_role ? (
                  <div className="flex items-center gap-1.5">
                    <Badge variant={ROLE_BADGE_VARIANT[cat.computed_role] ?? 'outline'}>
                      {ROLE_LABELS[cat.computed_role] ?? cat.computed_role}
                    </Badge>
                    {cat.is_auto && (
                      <span className="text-xs text-cream-400" title="Auto-learned from order data">Auto</span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-cream-400">No data yet</span>
                )}
              </td>
              <td className="px-4 py-3">
                <select
                  value={cat.override_role ?? ''}
                  onChange={(e) => handleRoleChange(cat.category_id, e.target.value || null)}
                  disabled={saving === cat.category_id}
                  className="rounded-md border border-cream-200 bg-white px-2.5 py-1.5 text-sm text-cream-900 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400 disabled:opacity-50"
                  title={cat.override_role ? ROLE_TOOLTIP[cat.override_role] : 'Use auto-detected role'}
                >
                  <option value="">Auto ({ROLE_LABELS[cat.computed_role ?? 'anchor'] ?? 'Anchor'})</option>
                  <option value="anchor">Anchor — show in Bestsellers</option>
                  <option value="companion">Companion — accessory, skip Bestsellers</option>
                  <option value="exclude">Exclude — never surface</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
