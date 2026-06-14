'use client';

import { useState } from 'react';
import { Check, IndianRupee, Pencil, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatInrInput, parseInrInput } from '@/lib/utils';
import type { ProductDetailResponse } from '@/hooks/useProducts';
import { useUpdateProductPriceOverride } from '@/hooks/useProducts';

interface ProductPricingTabProps {
  productId: string;
  role: string;
  pricingSummary: ProductDetailResponse['detail']['pricing_summary'];
  pricing: ProductDetailResponse['detail']['pricing'];
}

export function ProductPricingTab({ productId, role, pricingSummary, pricing }: ProductPricingTabProps) {
  const isAdmin = role === 'seller_admin';
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const updateOverride = useUpdateProductPriceOverride(productId);

  return (
    <section className="mt-5 space-y-4">
      <article className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
        <div className="border-b border-cream-300 px-5 py-4">
          <h3 className="font-display text-lg text-cream-950">Base pricing context</h3>
          <p className="text-base text-cream-700">Use these values as a baseline while editing cohort and price-list overrides.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">MRP</p>
            <p className="mt-2 font-display text-2xl leading-none text-cream-950">{pricingSummary.mrp != null ? formatCurrency(pricingSummary.mrp, 'INR') : '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Base selling price</p>
            <p className="mt-2 font-display text-2xl leading-none text-cream-950">{pricingSummary.base_selling_price != null ? formatCurrency(pricingSummary.base_selling_price, 'INR') : '—'}</p>
          </div>
          {isAdmin ? (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Cost price</p>
                <p className="mt-2 font-display text-2xl leading-none text-cream-950">{pricingSummary.cost_price != null ? formatCurrency(pricingSummary.cost_price, 'INR') : '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Margin</p>
                <p className="mt-2 font-display text-2xl leading-none text-cream-950">{pricingSummary.margin_pct != null ? `${pricingSummary.margin_pct}%` : '—'}</p>
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Pricing visibility</p>
                <p className="mt-2 font-display text-2xl leading-none text-cream-950">Read only</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Override access</p>
                <p className="mt-2 font-display text-2xl leading-none text-cream-950">Admin only</p>
              </div>
            </>
          )}
        </div>
      </article>

      <section className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
        <div className="border-b border-cream-300 px-5 py-4">
          <h3 className="font-display text-lg text-cream-950">Pricing &amp; cohorts</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead className="border-b border-cream-300 bg-cream-100 text-xs uppercase tracking-[0.06em] text-cream-700">
              <tr>
                <th className="px-5 py-2.5">Price list</th>
                <th className="px-5 py-2.5">Cohorts</th>
                <th className="px-5 py-2.5">Effective price</th>
                <th className="px-5 py-2.5">Validity</th>
                <th className="px-5 py-2.5">Status</th>
                {isAdmin ? <th className="px-5 py-2.5 text-right">Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {pricing.map((row) => {
                const isEditing = editingRow === row.item_id;
                const value = draft[row.item_id] ?? formatInrInput(String(row.effective_price));
                return (
                  <tr key={row.item_id} className="border-b border-cream-300 align-top last:border-b-0">
                    <td className="px-5 py-3 text-base font-medium text-cream-900">{row.price_list_name}</td>
                    <td className="px-5 py-3 text-base text-cream-800">{row.cohorts.join(', ')}</td>
                    <td className="px-5 py-3">
                      {isEditing ? (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <div className="flex max-w-[220px] items-center rounded-sm border border-cream-300 bg-white pl-3">
                              <IndianRupee size={14} className="text-cream-700" />
                              <Input
                                className="h-8 w-36 border-0 focus-visible:ring-0"
                                value={value}
                                onChange={(e) => setDraft((prev) => ({ ...prev, [row.item_id]: formatInrInput(e.target.value) }))}
                                inputMode="decimal"
                              />
                            </div>
                          </div>
                          <p className="text-xs text-cream-600">
                            Base: {formatCurrency(row.base_price, 'INR')}
                          </p>
                        </div>
                      ) : (
                        <p className="font-mono text-base text-cream-900">{formatCurrency(row.effective_price, 'INR')}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-cream-700">
                      {(row.valid_from ? new Date(row.valid_from).toLocaleDateString('en-IN') : 'Now') + ' → ' + (row.valid_to ? new Date(row.valid_to).toLocaleDateString('en-IN') : 'Open')}
                    </td>
                    <td className="px-5 py-3 text-sm text-cream-700">{row.is_active ? 'Active' : 'Inactive'}</td>
                    {isAdmin ? (
                      <td className="px-5 py-3 text-right">
                        isEditing ? (
                          <div className="inline-flex items-center gap-2">
                            <Button
                              type="button"
                              variant="primary"
                              size="icon"
                              className="h-8 w-8"
                              disabled={updateOverride.isPending}
                              onClick={() => {
                                const next = parseInrInput(draft[row.item_id] ?? formatInrInput(String(row.effective_price)));
                                if (next == null || !Number.isFinite(next) || next <= 0) return;
                                updateOverride.mutate({
                                  priceListId: row.price_list_id,
                                  itemId: row.item_id,
                                  price: next,
                                });
                                setEditingRow(null);
                              }}
                              aria-label={`Save ${row.price_list_name} price`}
                            >
                              <Check size={14} />
                            </Button>
                            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingRow(null)} aria-label={`Cancel editing ${row.price_list_name} price`}>
                              <X size={14} />
                            </Button>
                          </div>
                        ) : (
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingRow(row.item_id)} aria-label={`Edit ${row.price_list_name} price`}>
                            <Pencil size={14} />
                          </Button>
                        )
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {pricing.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-5 py-8 text-center text-base text-cream-700">No price-list overrides for this product yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
