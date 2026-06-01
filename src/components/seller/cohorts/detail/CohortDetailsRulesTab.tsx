'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LandingTable } from '@/components/seller/layout';
import { CohortRuleBuilder } from '@/components/seller/cohorts/CohortRuleBuilder';
import type { CohortDetailResponse } from '@/hooks/useCohorts';
import type { CohortRuleFilter } from '@/lib/zod';

interface CohortDetailsRulesTabProps {
  detailsRules: CohortDetailResponse['details_rules'];
  isSaving: boolean;
  startInEditMode?: boolean;
  onEditModeSync?: (editing: boolean) => void;
  onSave: (payload: { name: string; description: string; rules: { filters: CohortRuleFilter[] } }) => void;
}

export function CohortDetailsRulesTab({
  detailsRules,
  isSaving,
  startInEditMode,
  onEditModeSync,
  onSave,
}: CohortDetailsRulesTabProps) {
  const [isEditing, setIsEditing] = useState(Boolean(startInEditMode));
  const [name, setName] = useState(detailsRules.name);
  const [description, setDescription] = useState(detailsRules.description ?? '');
  const [filters, setFilters] = useState<CohortRuleFilter[]>(
    (detailsRules.rules?.filters ?? []).map((filter) => ({
      field: filter.field as CohortRuleFilter['field'],
      operator: filter.operator as CohortRuleFilter['operator'],
      value: filter.value,
    })),
  );

  useEffect(() => {
    if (!startInEditMode) return;
    setIsEditing(true);
  }, [startInEditMode]);

  const toggleEditing = (next: boolean) => {
    setIsEditing(next);
    onEditModeSync?.(next);
  };

  const resetLocal = () => {
    setName(detailsRules.name);
    setDescription(detailsRules.description ?? '');
    setFilters(
      (detailsRules.rules?.filters ?? []).map((filter) => ({
        field: filter.field as CohortRuleFilter['field'],
        operator: filter.operator as CohortRuleFilter['operator'],
        value: filter.value,
      })),
    );
  };

  return (
    <section className="mt-5 space-y-4">
      <article className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
        <div className="flex items-center justify-between border-b border-cream-300 px-5 py-4">
          <h3 className="font-display text-[17px] text-cream-950">Details & rules</h3>
          <p className="text-[12px] text-cream-700">Rules and members merged in one view</p>
        </div>

        <div className="grid grid-cols-2 gap-5 p-5">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-cream-700">Cohort name</p>
            {isEditing ? <Input value={name} onChange={(event) => setName(event.target.value)} /> : <p className="text-[14px] text-cream-900">{detailsRules.name}</p>}
          </div>

          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-cream-700">Type</p>
            <p className="text-[14px] text-cream-900">{detailsRules.type}</p>
          </div>

          <div className="col-span-2 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-cream-700">Description</p>
            {isEditing ? <Input value={description} onChange={(event) => setDescription(event.target.value)} /> : <p className="text-[14px] text-cream-900">{detailsRules.description || 'No description'}</p>}
          </div>

          <div className="col-span-2 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-cream-700">Rule conditions</p>
            {isEditing ? (
              <CohortRuleBuilder filters={filters} onChange={setFilters} />
            ) : detailsRules.rules?.filters?.length ? (
              <div className="space-y-2">
                {detailsRules.rules.filters.map((filter, index) => (
                  <div key={`${filter.field}-${index}`} className="rounded-[10px] border border-cream-200 bg-cream-50 px-3 py-2 text-[13px] text-cream-800">
                    {filter.field} {filter.operator} {Array.isArray(filter.value) ? filter.value.join(', ') : filter.value}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-cream-700">No rules configured.</p>
            )}
          </div>

          <div className="col-span-2 flex justify-end gap-2 border-t border-cream-300 pt-4">
            {isEditing ? (
              <>
                <Button
                  type="button"
                  className="cockpit-btn cockpit-btn-secondary h-9 px-4 text-cream-800"
                  onClick={() => {
                    resetLocal();
                    toggleEditing(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={isSaving}
                  className="cockpit-btn cockpit-btn-primary h-9 px-4"
                  onClick={() => {
                    onSave({
                      name,
                      description,
                      rules: { filters },
                    });
                    toggleEditing(false);
                  }}
                >
                  Save changes
                </Button>
              </>
            ) : (
              <Button type="button" className="cockpit-btn cockpit-btn-secondary h-9 px-4 text-cream-800" onClick={() => toggleEditing(true)}>
                Edit
              </Button>
            )}
          </div>
        </div>
      </article>

      <article className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
        <div className="border-b border-cream-300 px-5 py-4">
          <h3 className="font-display text-[17px] text-cream-950">Member preview</h3>
          <p className="text-[13px] text-cream-700">Top 10 buyers in this cohort</p>
        </div>

        <LandingTable
          columns={[
            { label: 'Buyer', className: 'px-5' },
            { label: 'City', className: 'px-5' },
            { label: 'Tier', className: 'px-5' },
          ]}
          className="rounded-none border-0"
        >
          {detailsRules.members_preview.map((member) => (
            <tr key={member.id} className="border-b border-cream-300 bg-white">
              <td className="px-5 py-3.5 text-cream-900">{member.name}</td>
              <td className="px-5 py-3.5 text-cream-700">{member.city}</td>
              <td className="px-5 py-3.5 font-mono text-[12px] text-cream-800">{member.tier}</td>
            </tr>
          ))}
        </LandingTable>
      </article>
    </section>
  );
}
