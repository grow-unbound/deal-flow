'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, label, id, disabled, ...props }, ref) => {
    const switchId = id ?? (label ? `switch-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          id={switchId}
          disabled={disabled}
          onClick={() => onCheckedChange?.(!checked)}
          className={cn(
            'relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent',
            'transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-400 focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            checked ? 'bg-teal-500' : 'bg-cream-300',
            className,
          )}
        >
          <span
            className={cn(
              'pointer-events-none block h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-fast',
              checked ? 'translate-x-3' : 'translate-x-0',
            )}
          />
        </button>
        {label && (
          <label
            htmlFor={switchId}
            className="text-body-sm text-cream-800 cursor-pointer select-none"
          >
            {label}
          </label>
        )}
        {/* Hidden input for form compatibility */}
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          disabled={disabled}
          className="sr-only"
          tabIndex={-1}
          {...props}
        />
      </div>
    );
  },
);
Switch.displayName = 'Switch';

export { Switch };
