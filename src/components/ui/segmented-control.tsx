'use client';

import * as React from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { cn } from '@/lib/cn';

export interface SegmentedControlOption {
  value: string;
  label: string;
}

export interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value: string | null | undefined;
  onChange: (value: string) => void;
  /** Renders an extra "Any" segment that clears the filter (sets value to null). */
  allowClear?: boolean;
  clearLabel?: string;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

/**
 * Single-value segmented control for fixed-bucket automatic-membership filters
 * (Last Sale, Sales-90d, Buyer App status, Stock status). No open-ended rule
 * builder -- one tap picks exactly one bucket, or clears back to "no filter".
 */
export function SegmentedControl({
  options,
  value,
  onChange,
  allowClear = true,
  clearLabel = 'Any',
  className,
  disabled,
  'aria-label': ariaLabel,
}: SegmentedControlProps) {
  return (
    <RadioGroupPrimitive.Root
      value={value ?? ''}
      onValueChange={(next) => {
        if (allowClear && next === value) {
          onChange('');
          return;
        }
        onChange(next);
      }}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex flex-wrap items-center gap-1 rounded-[10px] border border-cream-300 bg-cream-100 p-1',
        className,
      )}
    >
      {allowClear && (
        <RadioGroupPrimitive.Item
          value=""
          className={cn(
            'rounded-[8px] px-3 py-1.5 text-body-sm font-medium text-cream-700 transition-colors duration-fast ease-standard',
            'hover:bg-cream-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-400',
            'data-[state=checked]:bg-white data-[state=checked]:text-cream-900 data-[state=checked]:shadow-sm data-[state=checked]:font-semibold',
          )}
        >
          {clearLabel}
        </RadioGroupPrimitive.Item>
      )}
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          className={cn(
            'rounded-[8px] px-3 py-1.5 text-body-sm font-medium text-cream-700 transition-colors duration-fast ease-standard',
            'hover:bg-cream-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-400',
            'data-[state=checked]:bg-white data-[state=checked]:text-cream-900 data-[state=checked]:shadow-sm data-[state=checked]:font-semibold',
          )}
        >
          {option.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
