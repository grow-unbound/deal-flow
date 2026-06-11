'use client';

import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export interface FeatureToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
}

export function FeatureToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: FeatureToggleRowProps) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b border-cream-200 px-5 py-4 last:border-b-0',
        disabled && 'opacity-60',
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-cream-900">{label}</p>
        <p className="mt-1 text-sm text-cream-600">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="shrink-0" />
    </div>
  );
}
