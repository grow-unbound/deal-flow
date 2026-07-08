'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CohortRuleFilter } from '@/lib/zod';

const FIELD_OPTIONS = [
  { value: 'geography.city', label: 'City' },
  { value: 'last_order_bucket', label: 'Order history' },
  { value: 'gmv_90d_bucket', label: 'GMV (last 90 days)' },
] as const;

const OPERATOR_OPTIONS = [
  { value: 'eq', label: '=' },
  { value: 'in', label: 'in' },
] as const;

interface CohortRuleBuilderProps {
  filters: CohortRuleFilter[];
  onChange: (filters: CohortRuleFilter[]) => void;
}

export function CohortRuleBuilder({ filters, onChange }: CohortRuleBuilderProps) {
  function addFilter() {
    onChange([...filters, { field: 'geography.city', operator: 'in', value: '' }]);
  }

  function updateFilter(index: number, patch: Partial<CohortRuleFilter>) {
    const next = filters.map((f, i) => (i === index ? { ...f, ...patch } : f));
    onChange(next);
  }

  function removeFilter(index: number) {
    onChange(filters.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      {filters.map((filter, idx) => (
        <div key={idx}>
          {idx > 0 && (
            <div className="flex justify-center mb-3">
              <span className="bg-cream-200 text-cream-600 text-xs rounded px-2 py-0.5 font-medium">
                AND
              </span>
            </div>
          )}
          <div className="bg-cream-100 rounded-md border border-cream-200 p-3 flex items-center gap-3">
            {/* Field selector */}
            <Select
              value={filter.field}
              onValueChange={(val) =>
                updateFilter(idx, { field: val as CohortRuleFilter['field'], value: '' })
              }
            >
              <SelectTrigger className="w-40 bg-cream-50 text-sm">
                <SelectValue placeholder="Field" />
              </SelectTrigger>
              <SelectContent>
                {FIELD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Operator selector */}
            <Select
              value={filter.operator}
              onValueChange={(val) =>
                updateFilter(idx, { operator: val as CohortRuleFilter['operator'] })
              }
            >
              <SelectTrigger className="w-20 bg-cream-50 text-sm font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATOR_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="font-mono">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Value input */}
            <Input
              className="flex-1 bg-cream-50 text-sm"
              placeholder={filter.field === 'geography.city' ? 'e.g. Bengaluru' : 'Value'}
              value={typeof filter.value === 'string' ? filter.value : ''}
              onChange={(e) => updateFilter(idx, { value: e.target.value })}
            />

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeFilter(idx)}
              className="text-cream-500 hover:text-danger-600 hover:bg-danger-50 p-1"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={addFilter}
        className="flex items-center gap-1 text-teal-600 hover:text-teal-700 hover:bg-teal-50"
      >
        <Plus size={14} />
        Add rule
      </Button>
    </div>
  );
}
