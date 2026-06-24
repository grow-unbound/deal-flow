'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight, Layers } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { LandingTable } from '@/components/seller/layout';
import { GrowthPill } from '@/components/seller/layout';
import type { CategoryDetailBrand } from '@/hooks/useCategories';
import { formatCompactInr } from '@/lib/utils';

interface CategoryBrandsTabProps {
  brands: CategoryDetailBrand[];
}

export function CategoryBrandsTab({ brands }: CategoryBrandsTabProps) {
  const router = useRouter();

  return (
    <div className="mt-6">
      <LandingTable
        columns={[
          { label: 'Brand', width: '35%' },
          { label: 'SKUs in category', align: 'right' },
          { label: 'GMV MTD', align: 'right' },
          { label: 'Growth', align: 'right' },
          { label: 'Status', align: 'center' },
          { label: '', width: 40 },
        ]}
        showEmptyState={brands.length === 0}
        emptyState={
          <EmptyState
            icon={<Layers size={28} strokeWidth={1.5} />}
            heading="No brands in this category"
            description="Products assigned to this category will appear here."
          />
        }
      >
        {brands.map((b) => (
          <tr
            key={b.id}
            className="cursor-pointer border-b border-cream-200 transition-colors last:border-0 hover:bg-cream-50"
            onClick={() => router.push(`/brands/${b.id}`)}
          >
            <td className="px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-teal-100 text-xs font-semibold text-teal-700">
                  {b.initials}
                </span>
                <span className="text-sm font-medium text-cream-900">{b.name}</span>
              </div>
            </td>
            <td className="px-4 py-3 text-right text-sm text-cream-700">{b.sku_count}</td>
            <td className="px-4 py-3 text-right text-sm font-medium text-cream-900">
              {b.gmv_mtd > 0 ? formatCompactInr(b.gmv_mtd) : '—'}
            </td>
            <td className="px-4 py-3 text-right">
              <GrowthPill value={b.growth_pct} />
            </td>
            <td className="px-4 py-3 text-center">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  b.is_active ? 'bg-success-100 text-success-700' : 'bg-cream-100 text-cream-500'
                }`}
              >
                {b.is_active ? 'Active' : 'Archived'}
              </span>
            </td>
            <td className="px-4 py-3 text-right text-cream-400">
              <ChevronRight size={16} />
            </td>
          </tr>
        ))}
      </LandingTable>
    </div>
  );
}
