import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-eyebrow font-medium transition-colors',
  {
    variants: {
      variant: {
        default:     'bg-cream-200 text-cream-800',
        teal:        'bg-teal-50 text-teal-500',
        ember:       'bg-ember-50 text-ember-500',
        success:     'bg-success-50 text-success-700',
        warning:     'bg-warning-50 text-warning-700',
        danger:      'bg-danger-50 text-danger-700',
        info:        'bg-info-50 text-info-700',
        outline:     'border border-cream-300 text-cream-700 bg-transparent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
