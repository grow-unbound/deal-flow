import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, hint, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-body-sm font-medium text-cream-800">
            {label}
          </label>
        )}
        <input
          id={inputId}
          type={type}
          className={cn(
            'h-10 w-full rounded-[8px] border border-cream-400 bg-white px-3 text-[13.5px] text-cream-900 placeholder:text-cream-600',
            'transition-colors duration-fast ease-standard',
            'focus:outline-none focus:border-ember-400 focus:ring-2 focus:ring-ember-400/20',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-cream-100',
            error && 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/20',
            className
          )}
          ref={ref}
          {...props}
        />
        {error && <p className="text-[11.5px] text-danger-500">{error}</p>}
        {hint && !error && <p className="text-[11.5px] text-cream-700">{hint}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';

export { Input };
