'use client';

import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export interface NotificationToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  readOnlySystemOn?: boolean;
}

export function NotificationToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  readOnlySystemOn,
}: NotificationToggleRowProps) {
  const locked = readOnlySystemOn || disabled;
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b border-cream-100 py-4 last:border-b-0 last:pb-0',
        locked && 'opacity-90',
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-cream-900">{label}</p>
        <p className="mt-1 text-sm text-cream-600">{description}</p>
        {readOnlySystemOn ? (
          <p className="mt-2 inline-flex rounded-md bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800">Always on</p>
        ) : null}
      </div>
      <Switch
        checked={readOnlySystemOn ? true : checked}
        onCheckedChange={readOnlySystemOn ? undefined : onCheckedChange}
        disabled={locked}
        className="shrink-0"
        aria-readonly={readOnlySystemOn}
      />
    </div>
  );
}
