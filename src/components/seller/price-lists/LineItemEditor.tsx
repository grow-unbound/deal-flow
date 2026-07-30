'use client';

import { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { ScrollableTableShell } from '@/components/seller/layout/ScrollableTableShell';
import { Button } from '@/components/ui/button';
import { MutationButton } from '@/components/ui/mutation-button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePriceListItems, useAddPriceListItem, useDeletePriceListItem } from '@/hooks/usePriceLists';
import { useTenantProducts } from '@/hooks/useProducts';

interface LineItemEditorProps {
  priceListId: string;
}

const EMPTY_FORM = {
  tenant_product_id: '',
  price: '',
  min_qty: '1',
  max_qty: '',
};

export function LineItemEditor({ priceListId }: LineItemEditorProps) {
  const { data: itemsData, isLoading: itemsLoading } = usePriceListItems(priceListId);
  const { data: productsData } = useTenantProducts();
  const addItem = useAddPriceListItem(priceListId);
  const deleteItem = useDeletePriceListItem(priceListId);

  const [form, setForm] = useState(EMPTY_FORM);
  const [addError, setAddError] = useState<string | null>(null);

  const items = itemsData?.items ?? [];
  const products = productsData?.products ?? [];

  const selectedProduct = products.find((p) => p.id === form.tenant_product_id) ?? null;
  const parsedPrice = parseFloat(form.price);
  const showMrpWarning =
    selectedProduct?.mrp != null &&
    !isNaN(parsedPrice) &&
    parsedPrice > selectedProduct.mrp;

  async function handleAdd() {
    setAddError(null);

    if (!form.tenant_product_id) {
      setAddError('Please select a product.');
      return;
    }

    const price = parseFloat(form.price);
    if (isNaN(price) || price <= 0) {
      setAddError('Price must be a positive number.');
      return;
    }

    const min_qty = parseInt(form.min_qty, 10);
    if (isNaN(min_qty) || min_qty < 1) {
      setAddError('Min qty must be at least 1.');
      return;
    }

    const max_qty = form.max_qty ? parseInt(form.max_qty, 10) : null;

    try {
      await addItem.mutateAsync({
        tenant_product_id: form.tenant_product_id,
        price,
        min_qty,
        max_qty,
      });
      setForm(EMPTY_FORM);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add product.');
    }
  }

  return (
    <div className="space-y-6">
      {/* Add product row */}
      <div className="rounded-lg border border-cream-200 bg-cream-50 p-4">
        <p className="text-sm font-medium text-cream-800 mb-3">Add product</p>
        <div className="flex flex-wrap items-start gap-3">
          {/* Product picker */}
          <div className="flex-1 min-w-[200px]">
            <Select
              value={form.tenant_product_id}
              onValueChange={(val) => setForm((f) => ({ ...f, tenant_product_id: val }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a product…" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.display_name} ({p.internal_sku})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Price */}
          <div className="flex flex-col gap-1">
            <Input
              type="number"
              step="0.01"
              className="font-mono w-28"
              placeholder="0.00"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            />
            {showMrpWarning && (
              <p className="text-amber-600 text-xs">This price exceeds the product MRP.</p>
            )}
          </div>

          {/* Min Qty */}
          <Input
            type="number"
            className="font-mono w-20"
            defaultValue="1"
            value={form.min_qty}
            onChange={(e) => setForm((f) => ({ ...f, min_qty: e.target.value }))}
          />

          {/* Max Qty */}
          <Input
            type="number"
            className="font-mono w-20"
            placeholder="—"
            value={form.max_qty}
            onChange={(e) => setForm((f) => ({ ...f, max_qty: e.target.value }))}
          />

          <MutationButton
            variant="outline"
            className="flex items-center gap-1.5"
            onClick={handleAdd}
            isPending={addItem.isPending}
            pendingLabel="Adding…"
          >
            <Plus size={16} />
            Add product
          </MutationButton>
        </div>

        {addError && (
          <p className="text-red-600 text-xs mt-2">{addError}</p>
        )}
      </div>

      {/* Items table */}
      {itemsLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, idx) => (
            <Skeleton key={idx} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-cream-500 text-sm">No line items yet. Add a product above.</p>
      ) : (
        <ScrollableTableShell className="rounded-lg border border-cream-200 bg-white">
          <table className="data-table w-full min-w-[900px] table-fixed border-collapse text-base">
            <thead>
              <tr className="border-b border-cream-200 bg-cream-100">
                <th className="table-label px-3 py-2 text-left" style={{ minWidth: '280px', maxWidth: '420px' }}>Product</th>
                <th className="table-label px-3 py-2 text-left" style={{ minWidth: '160px', maxWidth: '260px' }}>SKU</th>
                <th className="table-label px-3 py-2 text-right" style={{ minWidth: '110px', maxWidth: '140px' }}>Price</th>
                <th className="table-label px-3 py-2 text-right" style={{ minWidth: '90px', maxWidth: '110px' }}>Min Qty</th>
                <th className="table-label px-3 py-2 text-right" style={{ minWidth: '90px', maxWidth: '110px' }}>Max Qty</th>
                <th className="table-label w-8 px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const productName =
                  item.tenant_product?.name_override ??
                  item.tenant_product?.master_product?.name ??
                  '—';
                const sku = item.tenant_product?.internal_sku ?? '—';

                return (
                  <tr key={item.id} className="border-b border-cream-100 bg-white transition-colors hover:bg-cream-50">
                    <td className="px-3 py-2 font-medium text-cream-900">
                      <span className="block truncate">{productName}</span>
                    </td>
                    <td className="px-3 py-2 text-base text-cream-600">
                      <span className="block truncate">{sku}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-cream-900">
                      {item.price.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-cream-700">
                      {item.min_qty}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-cream-700">
                      {item.max_qty != null ? item.max_qty : '—'}
                    </td>
                    <td className="px-2 py-3 text-right align-middle">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-500 hover:bg-red-50 hover:text-red-700"
                        onClick={() => deleteItem.mutate(item.id)}
                        disabled={deleteItem.isPending}
                        aria-label="Remove item"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollableTableShell>
      )}
    </div>
  );
}
