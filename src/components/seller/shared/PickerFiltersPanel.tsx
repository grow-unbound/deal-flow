'use client';

import { Check } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/cn';
import type { PickerAdvancedFilterDef, PickerQuickFilterDef } from '@/lib/picker-filters';

const ALL_VALUE = '__all__';

interface PickerFiltersPanelProps {
  quickFilters: PickerQuickFilterDef[];
  activeQuickFilters: string[];
  onToggleQuickFilter: (key: string, active: boolean) => void;
  advancedFilters: PickerAdvancedFilterDef[];
  advancedValues: Record<string, string | null>;
  onAdvancedChange: (key: string, value: string | null) => void;
  className?: string;
}

/**
 * Generic, entity-agnostic quick-toggle + advanced-accordion filter panel shared across the
 * buyer/product search-overlay pickers. Rendered between the search bar and the
 * selected-items section. Callers own filter definitions and state — this component is a
 * dumb renderer.
 */
export function PickerFiltersPanel({
  quickFilters,
  activeQuickFilters,
  onToggleQuickFilter,
  advancedFilters,
  advancedValues,
  onAdvancedChange,
  className,
}: PickerFiltersPanelProps) {
  const activeSet = new Set(activeQuickFilters);

  return (
    <div className={cn('space-y-3', className)}>
      {quickFilters.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {quickFilters.map((filter) => {
            const active = activeSet.has(filter.key);
            return (
              <button
                key={filter.key}
                type="button"
                aria-pressed={active}
                onClick={() => onToggleQuickFilter(filter.key, !active)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'border-ember-500 bg-ember-500 text-white'
                    : 'border-cream-300 bg-white text-cream-700 hover:bg-cream-100',
                )}
              >
                {active ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                {filter.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {advancedFilters.length > 0 ? (
        <Accordion type="single" collapsible className="rounded-[8px] border border-cream-200 bg-cream-50 px-3">
          <AccordionItem value="advanced-filters">
            <AccordionTrigger>Advanced filters</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {advancedFilters.map((filter) => {
                  const value = advancedValues[filter.key] ?? ALL_VALUE;
                  return (
                    <div key={filter.key} className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-cream-700">{filter.label}</span>
                      <Select
                        value={value}
                        onValueChange={(next) => onAdvancedChange(filter.key, next === ALL_VALUE ? null : next)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ALL_VALUE}>All</SelectItem>
                          {filter.options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : null}
    </div>
  );
}
