import { cn } from '@/lib/utils';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'accent';

interface StatusTagProps {
  label: string;
  tone: StatusTone;
  className?: string;
}

const toneClasses: Record<StatusTone, string> = {
  success: 'border-success-50 bg-success-50 text-success-700',
  warning: 'border-warning-50 bg-warning-50 text-warning-700',
  danger: 'border-danger-50 bg-danger-50 text-danger-700',
  neutral: 'border-cream-300 bg-cream-100 text-cream-700',
  accent: 'border-ember-100 bg-ember-50 text-ember-700',
};

export function StatusTag({ label, tone, className }: StatusTagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-[9px] py-[2px] text-xs font-medium uppercase tracking-[0.08em]',
        toneClasses[tone],
        className
      )}
    >
      <span className="inline-block h-2 w-2 rounded-full bg-current" />
      {label}
    </span>
  );
}
