import { cn } from '@/lib/utils';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

interface StatusTagProps {
  label: string;
  tone: StatusTone;
  className?: string;
}

const toneClasses: Record<StatusTone, string> = {
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
  neutral: 'bg-cream-200 text-cream-700',
};

export function StatusTag({ label, tone, className }: StatusTagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-[9px] py-[2px] text-[11.5px] font-medium',
        toneClasses[tone],
        className
      )}
    >
      {label}
    </span>
  );
}
