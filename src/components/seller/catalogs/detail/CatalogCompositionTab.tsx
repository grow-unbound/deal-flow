import { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CatalogDetailResponse } from '@/hooks/useCatalogs';
import { formatCompactInr } from '@/lib/utils';

interface CatalogCompositionTabProps {
  rows: CatalogDetailResponse['composition'];
  canEdit: boolean;
  onAdd: (tenantProductId: string) => void;
  onRemove: (tenantProductId: string) => void;
  isMutating: boolean;
}

export function CatalogCompositionTab({ rows, canEdit, onAdd, onRemove, isMutating }: CatalogCompositionTabProps) {
  const [tenantProductId, setTenantProductId] = useState('');

  return (
    <section className="mt-4 rounded-[14px] border border-cream-200 bg-white">
      {canEdit ? (
        <div className="flex items-center gap-2 border-b border-cream-200 px-4 py-3">
          <input
            value={tenantProductId}
            onChange={(e) => setTenantProductId(e.target.value)}
            placeholder="Tenant product UUID"
            className="h-9 w-72 rounded-[8px] border border-cream-300 bg-cream-50 px-3 text-[13px] text-cream-900"
          />
          <Button
            type="button"
            className="h-9 gap-1.5 bg-teal-700 px-3 text-cream-50 hover:bg-teal-800"
            disabled={isMutating || tenantProductId.trim().length === 0}
            onClick={() => {
              onAdd(tenantProductId.trim());
              setTenantProductId('');
            }}
          >
            <Plus size={14} />
            Add product
          </Button>
        </div>
      ) : null}

      <table className="w-full table-fixed">
        <thead>
          <tr className="border-b border-cream-200 bg-cream-50 text-left text-[11px] uppercase tracking-[0.08em] text-cream-600">
            <th className="px-4 py-3 font-semibold">Product</th>
            <th className="px-4 py-3 font-semibold">Brand</th>
            <th className="px-4 py-3 font-semibold">MRP</th>
            <th className="px-4 py-3 font-semibold">Catalog price</th>
            <th className="px-4 py-3 font-semibold">Override price</th>
            <th className="px-4 py-3 font-semibold">Stock status</th>
            {canEdit ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.tenant_product_id} className="border-b border-cream-200 text-[13px] text-cream-900 last:border-b-0">
              <td className="px-4 py-3 font-medium">{row.product}</td>
              <td className="px-4 py-3">{row.brand}</td>
              <td className="px-4 py-3">{row.mrp > 0 ? formatCompactInr(row.mrp) : '—'}</td>
              <td className="px-4 py-3">{row.catalog_price > 0 ? formatCompactInr(row.catalog_price) : '—'}</td>
              <td className="px-4 py-3">{row.override_price != null ? formatCompactInr(row.override_price) : '—'}</td>
              <td className="px-4 py-3">{row.stock_status}</td>
              {canEdit ? (
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-cream-300 text-cream-700 hover:bg-cream-100"
                    aria-label={`Remove ${row.product}`}
                    onClick={() => onRemove(row.tenant_product_id)}
                    disabled={isMutating}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
