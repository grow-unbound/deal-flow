'use client';

import { useMemo, useState } from 'react';
import { Check, IndianRupee, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { formatNumberInput, formatNumberValue, parseNumberInput } from '@/lib/utils';
import type { ProductDetailResponse } from '@/hooks/useProducts';

interface ProductDetailsTabProps {
  details: ProductDetailResponse['detail']['details'];
  role: ProductDetailResponse['detail']['role'];
  isSaving: boolean;
  onSave: (payload: {
    name_override?: string | null;
    mrp?: number | null;
    base_selling_price?: number | null;
    cost_price?: number | null;
    default_uom?: string | null;
    pack_size?: number | null;
    is_active?: boolean;
    external_ref?: string | null;
  }) => void;
}

export function ProductDetailsTab({ details, role, isSaving, onSave }: ProductDetailsTabProps) {
  const isAdmin = role === 'seller_admin';
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    name_override: details.name_override ?? '',
    mrp: details.mrp != null ? formatNumberInput(String(details.mrp), 'CURRENCY_EXACT') : '',
    base_selling_price: details.base_selling_price != null ? formatNumberInput(String(details.base_selling_price), 'CURRENCY_EXACT') : '',
    cost_price: details.cost_price != null ? formatNumberInput(String(details.cost_price), 'CURRENCY_EXACT') : '',
    default_uom: details.default_uom ?? '',
    pack_size: details.pack_size != null ? String(details.pack_size) : '',
    is_active: details.is_active,
    external_ref: details.external_ref ?? '',
  });

  const marginPct = useMemo(() => {
    const sell = parseNumberInput(form.base_selling_price, 'CURRENCY_EXACT') ?? NaN;
    const cost = parseNumberInput(form.cost_price, 'CURRENCY_EXACT') ?? NaN;
    if (!Number.isFinite(sell) || sell <= 0 || !Number.isFinite(cost) || cost < 0) return null;
    return (((sell - cost) / sell) * 100).toFixed(1);
  }, [form.base_selling_price, form.cost_price]);

  return (
    <section className="mt-5 overflow-hidden rounded-[14px] border border-cream-300 bg-white">
      <div className="flex items-center justify-between border-b border-cream-300 px-4 py-3">
        <h2 className="font-display text-lg text-cream-950">Details</h2>
      </div>

      <div className="p-5">
        <table className="w-full text-base">
          <tbody>
            <tr className="border-b border-cream-200">
              <td className="w-64 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Display Name</td>
              <td className="py-2 text-cream-900">
                {isEditing ? (
                  <Input
                    className="max-w-lg"
                    value={form.name_override}
                    onChange={(event) => setForm((prev) => ({ ...prev, name_override: event.target.value }))}
                    placeholder="Use master product name"
                  />
                ) : (
                  details.name
                )}
              </td>
            </tr>
            <tr className="border-b border-cream-200">
              <td className="py-2 text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">SKU</td>
              <td className="py-2 text-cream-900">{details.sku}</td>
            </tr>
            <tr className="border-b border-cream-200">
              <td className="py-2 text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Category</td>
              <td className="py-2 text-cream-900">{details.category}</td>
            </tr>
            <tr className="border-b border-cream-200">
              <td className="py-2 text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Pack size</td>
              <td className="py-2 text-cream-900">
                {isEditing ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Input
                      className="max-w-[180px]"
                      value={form.pack_size}
                      onChange={(event) => setForm((prev) => ({ ...prev, pack_size: event.target.value }))}
                      placeholder="750"
                      inputMode="decimal"
                    />
                    <Input
                      className="max-w-[180px]"
                      value={form.default_uom}
                      onChange={(event) => setForm((prev) => ({ ...prev, default_uom: event.target.value }))}
                      placeholder="ml"
                    />
                  </div>
                ) : details.pack_size != null ? (
                  `${details.pack_size}${details.default_uom ? ` ${details.default_uom}` : ''}`
                ) : (
                  '—'
                )}
              </td>
            </tr>
            <tr className="border-b border-cream-200">
              <td className="py-2 text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">MRP</td>
              <td className="py-2 text-cream-900">
                {isEditing ? (
                  <div className="flex max-w-[220px] items-center rounded-sm border border-cream-300 bg-white pl-3">
                    <IndianRupee size={14} className="text-cream-700" />
                    <Input
                      className="border-0 focus-visible:ring-0"
                      value={form.mrp}
                      onChange={(event) => setForm((prev) => ({ ...prev, mrp: formatNumberInput(event.target.value, 'CURRENCY_EXACT') }))}
                      inputMode="decimal"
                      placeholder="0"
                    />
                  </div>
                ) : details.mrp != null ? (
                  formatNumberValue(details.mrp, 'CURRENCY_EXACT')
                ) : (
                  '—'
                )}
              </td>
            </tr>
            <tr className="border-b border-cream-200">
              <td className="py-2 text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Base selling price</td>
              <td className="py-2 text-cream-900">
                {isEditing ? (
                  <div className="flex max-w-[220px] items-center rounded-sm border border-cream-300 bg-white pl-3">
                    <IndianRupee size={14} className="text-cream-700" />
                    <Input
                      className="border-0 focus-visible:ring-0"
                      value={form.base_selling_price}
                      onChange={(event) => setForm((prev) => ({ ...prev, base_selling_price: formatNumberInput(event.target.value, 'CURRENCY_EXACT') }))}
                      inputMode="decimal"
                      placeholder="0"
                    />
                  </div>
                ) : details.base_selling_price != null ? (
                  formatNumberValue(details.base_selling_price, 'CURRENCY_EXACT')
                ) : (
                  '—'
                )}
              </td>
            </tr>
            <tr className="border-b border-cream-200">
              <td className="py-2 text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Cost price</td>
              <td className="py-2 text-cream-900">
                {isEditing && isAdmin ? (
                  <div className="flex max-w-[220px] items-center rounded-sm border border-cream-300 bg-white pl-3">
                    <IndianRupee size={14} className="text-cream-700" />
                    <Input
                      className="border-0 focus-visible:ring-0"
                      value={form.cost_price}
                      onChange={(event) => setForm((prev) => ({ ...prev, cost_price: formatNumberInput(event.target.value, 'CURRENCY_EXACT') }))}
                      inputMode="decimal"
                      placeholder="0"
                    />
                  </div>
                ) : details.cost_price != null ? (
                  formatNumberValue(details.cost_price, 'CURRENCY_EXACT')
                ) : (
                  '—'
                )}
              </td>
            </tr>
            <tr className="border-b border-cream-200">
              <td className="py-2 text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Margin %</td>
              <td className="py-2 text-cream-900">
                {marginPct != null ? `${marginPct}%` : '—'}
              </td>
            </tr>
            <tr className="border-b border-cream-200">
              <td className="py-2 text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">HSN code</td>
              <td className="py-2 text-cream-900">{details.hsn_code ?? '—'}</td>
            </tr>
            <tr className="border-b border-cream-200">
              <td className="py-2 text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">GST rate</td>
              <td className="py-2 text-cream-900">{details.gst_rate != null ? `${details.gst_rate}%` : '—'}</td>
            </tr>
            <tr className="border-b border-cream-200">
              <td className="py-2 text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">External Ref</td>
              <td className="py-2 text-cream-900">
                {isEditing ? (
                  <Input
                    className="max-w-md"
                    value={form.external_ref}
                    onChange={(event) => setForm((prev) => ({ ...prev, external_ref: event.target.value }))}
                  />
                ) : (
                  details.external_ref ?? '—'
                )}
              </td>
            </tr>
            <tr className="border-b border-cream-200">
              <td className="py-2 text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Status</td>
              <td className="py-2 text-cream-900">
                {isEditing ? (
                  <Switch checked={form.is_active} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, is_active: checked }))} label="Active" />
                ) : details.is_active ? (
                  'Active'
                ) : (
                  'Inactive'
                )}
              </td>
            </tr>
            <tr>
              <td className="py-2 text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">Last Updated</td>
              <td className="py-2 font-mono text-sm text-cream-900">{new Date(details.updated_at).toLocaleString('en-IN')}</td>
            </tr>
          </tbody>
        </table>

        {isEditing ? (
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" className="h-9 px-4" onClick={() => setIsEditing(false)}>
              <X size={14} />
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={isSaving}
              className="h-9 px-4"
              onClick={() => {
                onSave({
                  name_override: form.name_override || null,
                  mrp: parseNumberInput(form.mrp, 'CURRENCY_EXACT'),
                  base_selling_price: parseNumberInput(form.base_selling_price, 'CURRENCY_EXACT'),
                  cost_price: isAdmin ? parseNumberInput(form.cost_price, 'CURRENCY_EXACT') : undefined,
                  default_uom: form.default_uom || null,
                  pack_size: form.pack_size ? Number(form.pack_size) : null,
                  is_active: form.is_active,
                  external_ref: form.external_ref || null,
                });
                setIsEditing(false);
              }}
            >
              <Check size={14} />
              Save changes
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
