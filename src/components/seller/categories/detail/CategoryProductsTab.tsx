'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { Package } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { LandingTable } from '@/components/seller/layout';
import type { CategoryDetailProduct } from '@/hooks/useCategories';
import { formatCompactInr } from '@/lib/utils';

interface CategoryProductsTabProps {
  products: CategoryDetailProduct[];
  categoryId: string;
}

function DaysCoverBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-cream-400">—</span>;
  const cls =
    value < 7
      ? 'text-danger-600 font-semibold'
      : value < 14
        ? 'text-amber-600 font-medium'
        : 'text-cream-700';
  return <span className={cls}>{value}d</span>;
}

export function CategoryProductsTab({ products }: CategoryProductsTabProps) {
  const router = useRouter();

  return (
    <div className="mt-6">
      <LandingTable
        columns={[
          { label: 'Product', width: '28%' },
          { label: 'Brand' },
          { label: 'On hand', align: 'right' },
          { label: 'Days cover', align: 'right' },
          { label: 'Units MTD', align: 'right' },
          { label: 'GMV MTD', align: 'right' },
          { label: '', width: 40 },
        ]}
        showEmptyState={products.length === 0}
        emptyState={
          <EmptyState
            icon={<Package size={28} strokeWidth={1.5} />}
            heading="No products in this category"
            description="Assign products to this category from the Products settings page."
          />
        }
      >
        {products.map((p) => (
          <tr
            key={p.id}
            className="cursor-pointer border-b border-cream-200 transition-colors last:border-0 hover:bg-cream-50"
            onClick={() => router.push(`/products/${p.id}`)}
          >
            <td className="px-4 py-3">
              <p className="text-sm font-medium text-cream-900">{p.name}</p>
              {p.sku_code && <p className="text-xs text-cream-400">{p.sku_code}</p>}
            </td>
            <td className="px-4 py-3 text-sm text-cream-700">{p.brand_name}</td>
            <td className="px-4 py-3 text-right text-sm">
              {p.on_hand <= 0 ? (
                <span className="rounded-full bg-danger-100 px-2 py-0.5 text-xs font-medium text-danger-700">OOS</span>
              ) : (
                <span className="text-cream-900">{p.on_hand}</span>
              )}
            </td>
            <td className="px-4 py-3 text-right text-sm">
              <DaysCoverBadge value={p.days_cover} />
            </td>
            <td className="px-4 py-3 text-right text-sm text-cream-700">
              {p.units_mtd > 0 ? p.units_mtd : '—'}
            </td>
            <td className="px-4 py-3 text-right text-sm font-medium text-cream-900">
              {p.gmv_mtd > 0 ? formatCompactInr(p.gmv_mtd) : '—'}
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
