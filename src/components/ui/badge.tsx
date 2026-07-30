import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import { Ban, CheckCircle2, Clock3, Info, Minus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';

const glyphVariants: Record<string, string> = {
  default: 'rounded-full',
  teal: 'rounded-full',
  ember: 'rounded-sm rotate-45',
  success: 'rounded-full',
  warning: 'rounded-full border border-current bg-transparent',
  danger: 'rounded-[2px]',
  info: 'rounded-full border border-current bg-transparent',
  outline: 'rounded-full',
};

const variantIcon: Record<string, LucideIcon> = {
  default: Minus,
  teal: CheckCircle2,
  ember: Sparkles,
  success: CheckCircle2,
  warning: Clock3,
  danger: Ban,
  info: Info,
  outline: Minus,
};

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-pill border px-[var(--ctl-badge-px)] py-[var(--ctl-badge-py)] text-[length:var(--ctl-badge-text)] leading-4 font-medium uppercase tracking-[0.1em] transition-colors font-mono',
  {
    variants: {
      variant: {
        default:     'border-cream-300 bg-cream-100 text-cream-700',
        teal:        'border-teal-100 bg-teal-50 text-teal-700',
        ember:       'border-ember-100 bg-ember-50 text-ember-700',
        success:     'border-success-50 bg-success-50 text-success-700',
        warning:     'border-warning-50 bg-warning-50 text-warning-700',
        danger:      'border-danger-50 bg-danger-50 text-danger-700',
        info:        'border-info-50 bg-info-50 text-info-700',
        outline:     'border-cream-300 text-cream-700 bg-transparent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Render a real Lucide icon (matching StatusPill's tone→icon mapping) instead of the plain dot/diamond/square. Default false. */
  icon?: boolean;
}

function Badge({ className, variant, icon = false, ...props }: BadgeProps) {
  const currentVariant = variant ?? 'default';
  const Icon = variantIcon[currentVariant];

  return (
    <span className={cn(badgeVariants({ variant: currentVariant }), className)} {...props}>
      {icon ? (
        <Icon className="h-[var(--ctl-badge-icon)] w-[var(--ctl-badge-icon)] shrink-0" strokeWidth={2.2} />
      ) : (
        <span className={cn('inline-block h-[var(--ctl-badge-glyph)] w-[var(--ctl-badge-glyph)] shrink-0', glyphVariants[currentVariant])} />
      )}
      {props.children}
    </span>
  );
}

export { Badge, badgeVariants };
