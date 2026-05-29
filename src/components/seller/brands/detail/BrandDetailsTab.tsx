'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BrandDetailResponse } from '@/hooks/useBrands';

interface BrandDetailsTabProps {
  details: BrandDetailResponse['details'];
  onSave: (payload: {
    display_name_override?: string | null;
    margin_pct?: number | null;
    exclusivity?: boolean | null;
    external_ref?: string | null;
    is_active?: boolean;
  }) => void;
  isSaving: boolean;
}

export function BrandDetailsTab({ details, onSave, isSaving }: BrandDetailsTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    display_name_override: details.display_name_override ?? '',
    margin_pct: details.margin_pct != null ? String(details.margin_pct) : '',
    exclusivity: details.exclusivity ?? false,
    external_ref: details.external_ref ?? '',
    is_active: details.is_active,
  });

  return (
    <section className="mt-5 overflow-hidden rounded-[14px] border border-cream-300 bg-white">
      <div className="flex items-center justify-between border-b border-cream-300 px-5 py-4">
        <h2 className="font-display text-[17px] text-cream-950">Details</h2>
        <Button
          type="button"
          className="h-9 gap-1.5 border border-cream-400 bg-white px-4 text-[13px] font-medium text-teal-700 hover:bg-cream-100"
          onClick={() => setIsEditing((prev) => !prev)}
        >
          <Pencil size={14} />
          Edit Details
        </Button>
      </div>

      <div className="p-5">
        <table className="w-full text-[13px]">
          <tbody>
            <tr className="border-b border-cream-200">
              <td className="w-64 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-cream-700">Display Name</td>
              <td className="py-3 text-cream-900">
                {isEditing ? (
                  <Input
                    value={form.display_name_override}
                    onChange={(event) => setForm((prev) => ({ ...prev, display_name_override: event.target.value }))}
                  />
                ) : (
                  details.display_name_override ?? '—'
                )}
              </td>
            </tr>
            <tr className="border-b border-cream-200">
              <td className="py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-cream-700">Margin %</td>
              <td className="py-3 text-cream-900">
                {isEditing ? (
                  <Input value={form.margin_pct} onChange={(event) => setForm((prev) => ({ ...prev, margin_pct: event.target.value }))} />
                ) : (
                  details.margin_pct ?? '—'
                )}
              </td>
            </tr>
            <tr className="border-b border-cream-200">
              <td className="py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-cream-700">Exclusivity</td>
              <td className="py-3 text-cream-900">
                {isEditing ? (
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.exclusivity}
                      onChange={(event) => setForm((prev) => ({ ...prev, exclusivity: event.target.checked }))}
                    />
                    <span>Exclusive principal</span>
                  </label>
                ) : details.exclusivity ? (
                  'Yes'
                ) : (
                  'No'
                )}
              </td>
            </tr>
            <tr className="border-b border-cream-200">
              <td className="py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-cream-700">External Ref</td>
              <td className="py-3 text-cream-900">
                {isEditing ? (
                  <Input
                    value={form.external_ref}
                    onChange={(event) => setForm((prev) => ({ ...prev, external_ref: event.target.value }))}
                  />
                ) : (
                  details.external_ref ?? '—'
                )}
              </td>
            </tr>
            <tr className="border-b border-cream-200">
              <td className="py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-cream-700">Status</td>
              <td className="py-3 text-cream-900">
                {isEditing ? (
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                    />
                    <span>Active</span>
                  </label>
                ) : details.is_active ? (
                  'Active'
                ) : (
                  'Inactive'
                )}
              </td>
            </tr>
            <tr>
              <td className="py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-cream-700">Last Updated</td>
              <td className="py-3 font-mono text-[12px] text-cream-900">{new Date(details.updated_at).toLocaleString('en-IN')}</td>
            </tr>
          </tbody>
        </table>

        {isEditing ? (
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" className="cockpit-btn cockpit-btn-secondary h-9 px-4 text-cream-800" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isSaving}
              className="cockpit-btn cockpit-btn-primary h-9 px-4"
              onClick={() => {
                onSave({
                  display_name_override: form.display_name_override || null,
                  margin_pct: form.margin_pct ? Number(form.margin_pct) : null,
                  exclusivity: form.exclusivity,
                  external_ref: form.external_ref || null,
                  is_active: form.is_active,
                });
                setIsEditing(false);
              }}
            >
              Save changes
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
